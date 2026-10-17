// Edge Function: admin-ver-clinica
// Devuelve pacientes y usuarios de UNA clínica específica.
// Solo responde si quien llama tiene usuarios.es_super_admin = true.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

import { buildCorsHeaders } from '../_shared/cors.ts'
import { exigirSinCambioPendiente, ErrorDeSolicitud, esUuid, leerCuerpoJson, responderError } from '../_shared/solicitud.ts'

serve(async (req) => {
  // CORS por petición: refleja el Origin si está en la lista blanca.
  const corsHeaders = buildCorsHeaders(req.headers.get('Origin'))
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    console.log('admin-ver-clinica: Authorization presente:', !!authHeader, '— empieza con Bearer:', !!authHeader?.startsWith('Bearer '))
    if (!authHeader) throw new ErrorDeSolicitud('Falta autenticación')

    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    console.log('admin-ver-clinica: token presente:', !!token, '— longitud:', token.length)
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
      console.error('admin-ver-clinica: error validando JWT:', userError.message, '— status:', userError.status)
    }
    console.log('admin-ver-clinica: usuario autenticado:', !!user)
    if (userError || !user) throw new ErrorDeSolicitud('Token inválido')

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    const { data: perfilCaller, error: perfilError } = await supabaseAdmin
      .from('usuarios')
      .select('es_super_admin, debe_cambiar_password')
      .eq('id', user.id)
      .single()
    if (perfilError || !perfilCaller) throw new ErrorDeSolicitud('No se encontró tu perfil')
    exigirSinCambioPendiente(perfilCaller)
    if (!perfilCaller.es_super_admin) throw new ErrorDeSolicitud('No autorizado')

    const { clinicaId } = await leerCuerpoJson(req)
    if (!clinicaId) throw new ErrorDeSolicitud('Falta clinicaId')
    if (!esUuid(clinicaId)) throw new ErrorDeSolicitud('clinicaId inválido')

    const { data: clinica, error: clinicaError } = await supabaseAdmin
      .from('clinicas')
      .select('*')
      .eq('id', clinicaId)
      .single()
    if (clinicaError || !clinica) throw new ErrorDeSolicitud('Clínica no encontrada')

    // Esta respuesta entrega a la plataforma datos PERSONALES de los pacientes de la clínica (nombre, teléfono, correo, fecha de nacimiento): el acceso queda
    // REGISTRADO ANTES de devolverlos, con la clínica en el registro (su propietario lo ve en su auditoría). Si no se puede registrar, NO se entregan los datos.
    const { error: errorAuditoria } = await supabaseAdmin.from('auditoria').insert({
      usuario_id: user.id,
      accion: 'ver_clinica',
      entidad: 'clinicas',
      entidad_id: clinicaId,
      clinica_id: clinicaId,
      detalle: { via: 'edge_function', incluye: ['datos_personales_de_pacientes', 'usuarios'] }
    })
    if (errorAuditoria) throw errorAuditoria

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
    return responderError(err, corsHeaders, 'admin-ver-clinica')
  }
})
