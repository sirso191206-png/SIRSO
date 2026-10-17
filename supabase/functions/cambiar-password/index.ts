// Edge Function: cambiar-password
// Cambia la contraseña del usuario AUTENTICADO que llama (nunca la de
// otro). Existe porque `supabase.auth.updateUser({ password })` llamado
// directo desde el frontend habla con el servicio de Auth de Supabase,
// que es infraestructura aparte del esquema `public` — no pasa por
// nuestras políticas de RLS ni por auth_clinica_id(), así que un
// usuario de una clínica suspendida podía cambiar su contraseña sin
// que la suspensión se lo impidiera. Aquí sí se valida antes de tocar
// Auth, usando service_role (necesario para auth.admin.updateUserById).
//
// La recuperación de contraseña por correo (RestablecerPassword.jsx)
// NO pasa por aquí a propósito: es un mecanismo de recuperación de
// cuenta que debe seguir funcionando aunque la clínica esté suspendida
// (para que el dueño no quede permanentemente fuera de su cuenta si
// más adelante se reactiva). Este candado aplica solo al cambio de
// contraseña DESDE DENTRO de la app, con sesión activa.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

import { buildCorsHeaders } from '../_shared/cors.ts'
import { ErrorDeSolicitud, leerCuerpoJson, responderError } from '../_shared/solicitud.ts'

serve(async (req) => {
  // CORS por petición: refleja el Origin si está en la lista blanca.
  const corsHeaders = buildCorsHeaders(req.headers.get('Origin'))
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    console.log('cambiar-password: Authorization presente:', !!authHeader, '— empieza con Bearer:', !!authHeader?.startsWith('Bearer '))
    if (!authHeader) throw new ErrorDeSolicitud('Falta autenticación')

    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    console.log('cambiar-password: token presente:', !!token, '— longitud:', token.length)
    if (!token) throw new ErrorDeSolicitud('Falta token de acceso')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Cliente efímero: sin persistir/refrescar sesión propia — esta
    // función corre una sola vez por petición; el único propósito de
    // este cliente es validar el token recibido en la petición.
    const supabaseCaller = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    })
    const { data: { user }, error: userError } = await supabaseCaller.auth.getUser(token)
    if (userError) {
      console.error('cambiar-password: error validando JWT:', userError.message, '— status:', userError.status)
    }
    console.log('cambiar-password: usuario autenticado:', !!user)
    if (userError || !user) throw new ErrorDeSolicitud('Token inválido')

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    const { data: perfilCaller, error: perfilError } = await supabaseAdmin
      .from('usuarios')
      .select('clinica_id, es_super_admin, debe_cambiar_password')
      .eq('id', user.id)
      .single()
    if (perfilError || !perfilCaller) throw new ErrorDeSolicitud('No se encontró tu perfil')

    // El super admin no está atado a la suspensión de ninguna clínica.
    if (!perfilCaller.es_super_admin) {
      const { data: clinica, error: clinicaError } = await supabaseAdmin
        .from('clinicas')
        .select('estado')
        .eq('id', perfilCaller.clinica_id)
        .single()
      if (clinicaError || !clinica) throw new ErrorDeSolicitud('No se encontró tu clínica')
      if (clinica.estado === 'suspendida') {
        throw new ErrorDeSolicitud(
          'Tu clínica está suspendida. No puedes cambiar tu contraseña en este momento.',
        )
      }
    }

    const { password } = await leerCuerpoJson(req)
    if (typeof password !== 'string' || password.length > 128) throw new ErrorDeSolicitud('La contraseña no es válida')
    if (password.length < 8) {
      throw new ErrorDeSolicitud('La contraseña debe tener al menos 8 caracteres')
    }

    // Cambio OBLIGATORIO de la contraseña temporal (migración 103): el indicador se quita SOLO aquí, y SOLO después de cambiar la contraseña de verdad.
    const pendiente = perfilCaller.debe_cambiar_password === true
    // Marcador en Auth (app_metadata, que el usuario no puede escribir): si un intento anterior cambió la contraseña pero no pudo quitar el indicador, el reintento
    // no se bloquea por «igual a la actual» (ya no es la temporal) y simplemente termina el proceso.
    const { data: actual } = await supabaseAdmin.auth.admin.getUserById(user.id)
    const yaRotada = typeof actual?.user?.app_metadata?.password_rotada_en === 'string'
    if (pendiente && !yaRotada) {
      // La nueva contraseña NO puede ser la temporal: si con ella se puede iniciar sesión, es igual a la actual.
      const sonda = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
      const { error: igualError } = await sonda.auth.signInWithPassword({ email: user.email ?? '', password })
      const msgSonda = String(igualError?.message ?? '')
      // Con la contraseña temporal SÍ se pudo entrar (o Auth dice que el correo no está confirmado, lo que también implica credenciales válidas): es igual a la actual.
      if (!igualError || /email not confirmed/i.test(msgSonda)) throw new ErrorDeSolicitud('La nueva contraseña debe ser distinta de la contraseña temporal.', 400, 'PASSWORD_IGUAL_A_LA_TEMPORAL')
      // SOLO «credenciales inválidas» demuestra que es distinta. Un límite de peticiones, un error de Auth o de red NO concluyen nada: no se acepta a ciegas (si no, agotar el límite permitiría conservar la contraseña temporal).
      if (!(/invalid login credentials/i.test(msgSonda) || (igualError as { status?: number }).status === 400)) {
        console.error('cambiar-password: la verificación de la contraseña no fue concluyente:', msgSonda)
        throw new ErrorDeSolicitud('No se pudo verificar tu contraseña en este momento. Inténtalo de nuevo en unos minutos.', 503, 'VERIFICACION_NO_DISPONIBLE')
      }
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, pendiente ? { password, app_metadata: { password_rotada_en: new Date().toISOString() } } : { password })
    if (updateError) throw updateError

    if (pendiente) {
      const { error: indicadorError } = await supabaseAdmin.from('usuarios').update({ debe_cambiar_password: false }).eq('id', user.id)
      const { data: verificado } = await supabaseAdmin.from('usuarios').select('debe_cambiar_password').eq('id', user.id).single()
      if (indicadorError || verificado?.debe_cambiar_password !== false) {
        console.error('cambiar-password: la contraseña cambió pero no se pudo confirmar la baja del indicador', indicadorError?.message ?? '')
        throw new ErrorDeSolicitud('Tu contraseña se cambió, pero no se pudo confirmar. Vuelve a intentarlo (elige la misma contraseña nueva).', 500, 'CAMBIO_PARCIAL')
      }
      await supabaseAdmin.from('auditoria').insert({ usuario_id: user.id, accion: 'cambio_password_obligatorio_completado', entidad: 'usuarios', entidad_id: user.id, clinica_id: perfilCaller.clinica_id, detalle: { via: 'edge_function' } })
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return responderError(err, corsHeaders, 'cambiar-password')
  }
})
