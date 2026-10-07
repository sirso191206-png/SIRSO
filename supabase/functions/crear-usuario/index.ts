// Edge Function: crear-usuario
// Solo el 'owner' de una clínica puede crear usuarios nuevos, y SIEMPRE dentro de SU
// PROPIA clínica. Esta función NUNCA crea clínicas ni owners: dar de alta una clínica
// (con su plan y suscripción) es exclusivo del superadmin, vía admin-crear-clinica.
// Usa la service_role key (inyectada automáticamente por Supabase en el
// entorno de la función) — esa llave NUNCA debe existir en el frontend.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

import { buildCorsHeaders } from '../_shared/cors.ts'

// 'owner' NO está a propósito: un owner nace solo al dar de alta una clínica (superadmin).
const ROLES_VALIDOS = ['dentista', 'recepcion', 'asistente']

// Error con código HTTP propio (las fallas de autorización devuelven 403, no 400).
class ErrorDeAutorizacion_ extends Error {
  status: number
  constructor(mensaje: string, status = 403) {
    super(mensaje)
    this.status = status
  }
}

serve(async (req) => {
  // CORS por petición: refleja el Origin si está en la lista blanca.
  const corsHeaders = buildCorsHeaders(req.headers.get('Origin'))
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    console.log('crear-usuario: Authorization presente:', !!authHeader, '— empieza con Bearer:', !!authHeader?.startsWith('Bearer '))
    if (!authHeader) throw new Error('Falta autenticación')

    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    console.log('crear-usuario: token presente:', !!token, '— longitud:', token.length)
    if (!token) throw new Error('Falta token de acceso')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    // Cliente efímero: sin persistir/refrescar sesión propia — esta
    // función corre una sola vez por petición; el único propósito de
    // este cliente es validar el token recibido en la petición.
    const supabaseCaller = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    })
    const { data: { user }, error: userError } = await supabaseCaller.auth.getUser(token)
    if (userError) {
      console.error('crear-usuario: error validando JWT:', userError.message, '— status:', userError.status)
    }
    console.log('crear-usuario: usuario autenticado:', !!user)
    if (userError || !user) throw new Error('Token inválido')

    // Cliente admin: el único que puede crear usuarios de Auth
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    const { data: perfilCaller, error: perfilError } = await supabaseAdmin
      .from('usuarios')
      .select('clinica_id, rol')
      .eq('id', user.id)
      .single()
    if (perfilError || !perfilCaller) throw new Error('No se encontró tu perfil')
    if (perfilCaller.rol !== 'owner') throw new ErrorDeAutorizacion_('Solo el owner puede crear usuarios', 403)

    // Clínica suspendida: ninguna acción administrativa, ni siquiera
    // crear otra clínica desde aquí. Esto se valida en el backend porque
    // esta función usa service_role y por sí sola NO pasa por RLS — el
    // bloqueo de auth_clinica_id() (migración 030) no la alcanza.
    const { data: clinicaCaller, error: clinicaCallerError } = await supabaseAdmin
      .from('clinicas')
      .select('estado')
      .eq('id', perfilCaller.clinica_id)
      .single()
    if (clinicaCallerError || !clinicaCaller) throw new Error('No se encontró tu clínica')
    if (clinicaCaller.estado === 'suspendida') {
      throw new Error('Tu clínica está suspendida. No puedes crear usuarios en este momento.')
    }

    const { correo, nombre, rol } = await req.json()
    if (!correo || !nombre || !rol) throw new ErrorDeAutorizacion_('Faltan datos (correo, nombre, rol)', 400)
    // Un owner NO puede crear otro owner ni una clínica nueva (ni con nombreClinica, ni de
    // ninguna otra forma): dejaría una clínica fuera del sistema de planes.
    if (rol === 'owner') {
      throw new ErrorDeAutorizacion_(
        'Solo el superadmin puede dar de alta una clínica nueva o un owner. Puedes agregar dentistas, recepción y asistentes a tu clínica.',
        403,
      )
    }
    if (!ROLES_VALIDOS.includes(rol)) throw new ErrorDeAutorizacion_('Rol inválido', 400)

    // SIEMPRE la clínica del owner que llama — nunca una indicada por el cliente.
    const clinicaIdDestino = perfilCaller.clinica_id

    // El límite de usuarios lo aplica la BASE DE DATOS (trigger trg_validar_limite_usuarios,
    // migración 075): si el insert de más abajo choca con el cupo, el error PT402 sube con su
    // mensaje y se revierte el usuario de Auth.

    // Contraseña temporal — se le entrega al owner para compartirla; el
    // nuevo usuario debería cambiarla en su primer inicio de sesión.
    const passwordTemporal = crypto.randomUUID().slice(0, 12)

    const { data: nuevoAuth, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: correo,
      password: passwordTemporal,
      email_confirm: true
    })
    if (createError) throw createError

    const { error: insertError } = await supabaseAdmin.from('usuarios').insert({
      id: nuevoAuth.user.id,
      clinica_id: clinicaIdDestino,
      nombre,
      correo,
      rol
    })
    if (insertError) {
      // Si falla el perfil, no dejamos un usuario de Auth huérfano
      await supabaseAdmin.auth.admin.deleteUser(nuevoAuth.user.id)
      throw insertError
    }

    // El trigger de auditoría de `usuarios` no puede usar auth.uid() aquí
    // (esta conexión es service_role, sin sesión) — se audita a mano,
    // con el `user.id` del owner que sí validamos arriba.
    await supabaseAdmin.from('auditoria').insert({
      usuario_id: user.id,
      accion: 'crear_usuarios',
      entidad: 'usuarios',
      entidad_id: nuevoAuth.user.id,
      detalle: { nombre, correo, rol, clinica_id: clinicaIdDestino, via: 'edge_function' }
    })

    return new Response(JSON.stringify({ correo, passwordTemporal }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err instanceof ErrorDeAutorizacion_ ? err.status : 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
