// Edge Function: eliminar-usuario
// Solo el 'owner' puede eliminar usuarios, y solo de su propia clínica.
// No se puede eliminar a sí mismo (evita que una clínica se quede sin owner).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { buildCorsHeaders } from '../_shared/cors.ts'

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

    const supabaseCaller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user }, error: userError } = await supabaseCaller.auth.getUser()
    if (userError || !user) throw new Error('Token inválido')

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    const { data: perfilCaller, error: perfilError } = await supabaseAdmin
      .from('usuarios')
      .select('clinica_id, rol')
      .eq('id', user.id)
      .single()
    if (perfilError || !perfilCaller) throw new Error('No se encontró tu perfil')
    if (perfilCaller.rol !== 'owner') throw new Error('Solo el owner puede eliminar usuarios')

    const { usuarioId } = await req.json()
    if (!usuarioId) throw new Error('Falta usuarioId')
    if (usuarioId === user.id) throw new Error('No puedes eliminarte a ti mismo')

    const { data: perfilObjetivo, error: objetivoError } = await supabaseAdmin
      .from('usuarios')
      .select('clinica_id, nombre, correo, rol')
      .eq('id', usuarioId)
      .single()
    if (objetivoError || !perfilObjetivo) throw new Error('Usuario no encontrado')
    if (perfilObjetivo.clinica_id !== perfilCaller.clinica_id) {
      throw new Error('Ese usuario no pertenece a tu clínica')
    }

    // Borra primero el perfil (por si el borrado de Auth fallara, no deja
    // un usuario de Auth "invisible" con acceso pero sin fila en usuarios)
    const { error: deleteProfileError } = await supabaseAdmin
      .from('usuarios')
      .delete()
      .eq('id', usuarioId)
    if (deleteProfileError) {
      if (deleteProfileError.code === '23503') {
        throw new Error(
          'No se puede eliminar: este usuario tiene citas, tratamientos o pagos registrados a su nombre. Desactívalo en vez de eliminarlo.'
        )
      }
      throw deleteProfileError
    }

    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(usuarioId)
    if (deleteAuthError) throw deleteAuthError

    // Mismo motivo que en crear-usuario: esta conexión es service_role,
    // sin auth.uid(), así que se audita a mano con el actor real.
    await supabaseAdmin.from('auditoria').insert({
      usuario_id: user.id,
      accion: 'eliminar_usuarios',
      entidad: 'usuarios',
      entidad_id: usuarioId,
      detalle: { ...perfilObjetivo, via: 'edge_function' }
    })

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
