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

serve(async (req) => {
  // CORS por petición: refleja el Origin si está en la lista blanca.
  const corsHeaders = buildCorsHeaders(req.headers.get('Origin'))
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    console.log('cambiar-password: Authorization presente:', !!authHeader, '— empieza con Bearer:', !!authHeader?.startsWith('Bearer '))
    if (!authHeader) throw new Error('Falta autenticación')

    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    console.log('cambiar-password: token presente:', !!token, '— longitud:', token.length)
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
      console.error('cambiar-password: error validando JWT:', userError.message, '— status:', userError.status)
    }
    console.log('cambiar-password: usuario autenticado:', !!user)
    if (userError || !user) throw new Error('Token inválido')

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    const { data: perfilCaller, error: perfilError } = await supabaseAdmin
      .from('usuarios')
      .select('clinica_id, es_super_admin')
      .eq('id', user.id)
      .single()
    if (perfilError || !perfilCaller) throw new Error('No se encontró tu perfil')

    // El super admin no está atado a la suspensión de ninguna clínica.
    if (!perfilCaller.es_super_admin) {
      const { data: clinica, error: clinicaError } = await supabaseAdmin
        .from('clinicas')
        .select('estado')
        .eq('id', perfilCaller.clinica_id)
        .single()
      if (clinicaError || !clinica) throw new Error('No se encontró tu clínica')
      if (clinica.estado === 'suspendida') {
        throw new Error(
          'Tu clínica está suspendida. No puedes cambiar tu contraseña en este momento.',
        )
      }
    }

    const { password } = await req.json()
    if (!password || password.length < 8) {
      throw new Error('La contraseña debe tener al menos 8 caracteres')
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password,
    })
    if (updateError) throw updateError

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
