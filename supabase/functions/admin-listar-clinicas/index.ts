// Edge Function: admin-listar-clinicas
// Solo responde si quien llama tiene usuarios.es_super_admin = true.
// Usa service_role para saltarse RLS a propósito — es la única puerta
// legítima para ver datos de más de una clínica a la vez.

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

    const { data: clinicas, error: clinicasError } = await supabaseAdmin
      .from('clinicas')
      .select('id, nombre, creado_en')
      .order('creado_en')
    if (clinicasError) throw clinicasError

    // Conteos por clínica — varias consultas simples en vez de un JOIN
    // complejo, más fácil de leer y esta lista no crece muy grande.
    const resultado = []
    for (const c of clinicas) {
      const { count: pacientesCount } = await supabaseAdmin
        .from('pacientes')
        .select('id', { count: 'exact', head: true })
        .eq('clinica_id', c.id)

      const { count: usuariosCount } = await supabaseAdmin
        .from('usuarios')
        .select('id', { count: 'exact', head: true })
        .eq('clinica_id', c.id)

      resultado.push({
        ...c,
        totalPacientes: pacientesCount ?? 0,
        totalUsuarios: usuariosCount ?? 0
      })
    }

    return new Response(JSON.stringify(resultado), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
