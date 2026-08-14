// Edge Function: admin-ver-clinica
// Devuelve pacientes y usuarios de UNA clínica específica.
// Solo responde si quien llama tiene usuarios.es_super_admin = true.

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
      .select('es_super_admin')
      .eq('id', user.id)
      .single()
    if (perfilError || !perfilCaller) throw new Error('No se encontró tu perfil')
    if (!perfilCaller.es_super_admin) throw new Error('No autorizado')

    const { clinicaId } = await req.json()
    if (!clinicaId) throw new Error('Falta clinicaId')

    const { data: clinica, error: clinicaError } = await supabaseAdmin
      .from('clinicas')
      .select('*')
      .eq('id', clinicaId)
      .single()
    if (clinicaError || !clinica) throw new Error('Clínica no encontrada')

    const { data: pacientes, error: pacientesError } = await supabaseAdmin
      .from('pacientes')
      .select('id, nombre_completo, telefono, correo, fecha_nacimiento, creado_en')
      .eq('clinica_id', clinicaId)
      .order('nombre_completo')
    if (pacientesError) throw pacientesError

    const { data: usuarios, error: usuariosError } = await supabaseAdmin
      .from('usuarios')
      .select('id, nombre, correo, rol, activo, creado_en')
      .eq('clinica_id', clinicaId)
      .order('nombre')
    if (usuariosError) throw usuariosError

    return new Response(JSON.stringify({ clinica, pacientes, usuarios }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
