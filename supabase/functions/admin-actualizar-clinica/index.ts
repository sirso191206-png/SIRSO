// Edge Function: admin-actualizar-clinica
// Solo responde si quien llama tiene usuarios.es_super_admin = true.
// Permite al super admin cambiar los "permisos" de una clínica:
// estado (activa/suspendida) y fechas. Usa service_role, que es la única
// vía autorizada para tocar estas columnas (el owner tiene revocado el
// UPDATE sobre ellas — ver migración 029).
//
// PLAN y LÍMITES YA NO se cambian aquí (migración 075): la fuente de verdad
// es la suscripción de la clínica (un snapshot). Escribir clinicas.plan o
// clinicas.limite_* directo la desincronizaría de lo que la base de datos
// realmente aplica. Se hacen con las funciones sa_asignar_plan_clinica y
// sa_ajustar_condiciones_clinica, que además dejan auditoría.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

import { buildCorsHeaders } from '../_shared/cors.ts'

const ESTADOS = ['activa', 'suspendida']

serve(async (req) => {
  // CORS por petición: refleja el Origin si está en la lista blanca.
  const corsHeaders = buildCorsHeaders(req.headers.get('Origin'))
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    console.log('admin-actualizar-clinica: Authorization presente:', !!authHeader, '— empieza con Bearer:', !!authHeader?.startsWith('Bearer '))
    if (!authHeader) throw new Error('Falta autenticación')

    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    console.log('admin-actualizar-clinica: token presente:', !!token, '— longitud:', token.length)
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
      console.error('admin-actualizar-clinica: error validando JWT:', userError.message, '— status:', userError.status)
    }
    console.log('admin-actualizar-clinica: usuario autenticado:', !!user)
    if (userError || !user) throw new Error('Token inválido')

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    // Autorización: SOLO super admin.
    const { data: perfilCaller, error: perfilError } = await supabaseAdmin
      .from('usuarios')
      .select('es_super_admin')
      .eq('id', user.id)
      .single()
    if (perfilError || !perfilCaller) throw new Error('No se encontró tu perfil')
    if (!perfilCaller.es_super_admin) throw new Error('No autorizado')

    const body = await req.json()
    const clinicaId = body?.clinicaId
    if (!clinicaId) throw new Error('Falta clinicaId')

    // Se arma el update SOLO con los campos enviados (actualización parcial).
    const cambios: Record<string, unknown> = {}

    if (body.estado !== undefined) {
      if (!ESTADOS.includes(body.estado)) throw new Error('Estado inválido')
      cambios.estado = body.estado
    }
    if (body.plan !== undefined || body.limiteUsuarios !== undefined || body.limitePacientes !== undefined) {
      throw new Error(
        'El plan y los límites se cambian con "Cambiar plan" / "Ajustar condiciones" (suscripción de la clínica), no desde aquí.',
      )
    }
    if (body.fechaInicio !== undefined) cambios.fecha_inicio = body.fechaInicio || null
    if (body.fechaVencimiento !== undefined) cambios.fecha_vencimiento = body.fechaVencimiento || null

    if (Object.keys(cambios).length === 0) throw new Error('No se enviaron cambios')

    const { data: clinica, error: updateError } = await supabaseAdmin
      .from('clinicas')
      .update(cambios)
      .eq('id', clinicaId)
      .select()
      .single()
    if (updateError) throw updateError
    if (!clinica) throw new Error('Clínica no encontrada')

    // Mantener la suscripción vigente alineada con lo que acaba de cambiar:
    // estado y fechas viven en las DOS tablas (clinicas es el espejo).
    const cambiosSuscripcion: Record<string, unknown> = {}
    if (cambios.estado !== undefined) cambiosSuscripcion.estado = cambios.estado
    if (cambios.fecha_inicio !== undefined && cambios.fecha_inicio !== null) cambiosSuscripcion.fecha_inicio = cambios.fecha_inicio
    if (cambios.fecha_vencimiento !== undefined) cambiosSuscripcion.fecha_fin = cambios.fecha_vencimiento
    if (Object.keys(cambiosSuscripcion).length > 0) {
      cambiosSuscripcion.updated_at = new Date().toISOString()
      const { error: subError } = await supabaseAdmin
        .from('suscripciones')
        .update(cambiosSuscripcion)
        .eq('clinica_id', clinicaId)
        .neq('estado', 'reemplazada')
      if (subError) throw subError
    }

    await supabaseAdmin.from('auditoria').insert({
      usuario_id: user.id,
      accion: 'actualizar_clinica',
      entidad: 'clinicas',
      entidad_id: clinicaId,
      detalle: { cambios, via: 'edge_function' },
    })

    return new Response(JSON.stringify({ clinica }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
