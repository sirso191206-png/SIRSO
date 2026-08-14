// Edge Function: crear-usuario
// Solo el 'owner' de una clínica puede crear usuarios nuevos.
// Usa la service_role key (inyectada automáticamente por Supabase en el
// entorno de la función) — esa llave NUNCA debe existir en el frontend.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { buildCorsHeaders } from '../_shared/cors.ts'

const ROLES_VALIDOS = ['owner', 'dentista', 'recepcion', 'asistente']

serve(async (req) => {
  // CORS por petición: refleja el Origin si está en la lista blanca.
  const corsHeaders = buildCorsHeaders(req.headers.get('Origin'))
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Falta autenticación')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    // Cliente "normal": sirve solo para saber quién está llamando
    const supabaseCaller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user }, error: userError } = await supabaseCaller.auth.getUser()
    if (userError || !user) throw new Error('Token inválido')

    // Cliente admin: el único que puede crear usuarios de Auth
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    const { data: perfilCaller, error: perfilError } = await supabaseAdmin
      .from('usuarios')
      .select('clinica_id, rol')
      .eq('id', user.id)
      .single()
    if (perfilError || !perfilCaller) throw new Error('No se encontró tu perfil')
    if (perfilCaller.rol !== 'owner') throw new Error('Solo el owner puede crear usuarios')

    const { correo, nombre, rol, nombreClinica } = await req.json()
    if (!correo || !nombre || !rol) throw new Error('Faltan datos (correo, nombre, rol)')
    if (!ROLES_VALIDOS.includes(rol)) throw new Error('Rol inválido')

    let clinicaIdDestino = perfilCaller.clinica_id

    // Límite de usuarios del plan: solo aplica al agregar usuarios a una
    // clínica EXISTENTE (no cuando se crea un owner con su clínica nueva).
    if (rol !== 'owner') {
      const { data: clinicaDestino } = await supabaseAdmin
        .from('clinicas')
        .select('limite_usuarios')
        .eq('id', clinicaIdDestino)
        .single()

      if (clinicaDestino?.limite_usuarios != null) {
        const { count } = await supabaseAdmin
          .from('usuarios')
          .select('id', { count: 'exact', head: true })
          .eq('clinica_id', clinicaIdDestino)

        if ((count ?? 0) >= clinicaDestino.limite_usuarios) {
          throw new Error(
            'Has alcanzado el límite de usuarios de tu plan. Contacta al administrador para ampliarlo.',
          )
        }
      }
    }

    if (rol === 'owner') {
      // Un owner nuevo es dueño de SU PROPIA clínica, independiente de la
      // tuya — no hereda ni comparte tus pacientes/usuarios/citas.
      if (!nombreClinica || !nombreClinica.trim()) {
        throw new Error('Falta el nombre de la nueva clínica')
      }
      const { data: nuevaClinica, error: clinicaError } = await supabaseAdmin
        .from('clinicas')
        .insert({ nombre: nombreClinica.trim() })
        .select()
        .single()
      if (clinicaError) throw clinicaError
      clinicaIdDestino = nuevaClinica.id
    }

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
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
