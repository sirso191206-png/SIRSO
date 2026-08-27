// Edge Function: admin-eliminar-clinica
// Solo responde si quien llama tiene usuarios.es_super_admin = true.
// A diferencia de "suspender" (admin-actualizar-clinica, reversible),
// esto es un borrado REAL e IRREVERSIBLE: usuarios (cuentas de Auth
// incluidas), pacientes y todo lo que cuelga de ellos (expedientes,
// notas, tratamientos, odontograma, periodontograma, citas, pagos,
// fotografías, documentos, recetas, consentimientos, referencias),
// además de storage, catálogo de tratamientos, horarios bloqueados y
// lista de espera. Requiere escribir el nombre exacto de la clínica
// como confirmación — no hay manera de deshacerlo después.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

import { buildCorsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get('Origin'))
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    console.log('admin-eliminar-clinica: Authorization presente:', !!authHeader, '— empieza con Bearer:', !!authHeader?.startsWith('Bearer '))
    if (!authHeader) throw new Error('Falta autenticación')

    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    console.log('admin-eliminar-clinica: token presente:', !!token, '— longitud:', token.length)
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
      console.error('admin-eliminar-clinica: error validando JWT:', userError.message, '— status:', userError.status)
    }
    console.log('admin-eliminar-clinica: usuario autenticado:', !!user)
    if (userError || !user) throw new Error('Token inválido')

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    const { data: perfilCaller, error: perfilError } = await supabaseAdmin
      .from('usuarios')
      .select('es_super_admin, clinica_id')
      .eq('id', user.id)
      .single()
    if (perfilError || !perfilCaller) throw new Error('No se encontró tu perfil')
    if (!perfilCaller.es_super_admin) throw new Error('No autorizado')

    const body = await req.json()
    const clinicaId = body?.clinicaId
    const confirmarNombre = body?.confirmarNombre
    if (!clinicaId) throw new Error('Falta clinicaId')
    if (!confirmarNombre) throw new Error('Falta confirmarNombre — debes escribir el nombre exacto de la clínica.')
    if (perfilCaller.clinica_id === clinicaId) {
      throw new Error('No puedes eliminar la clínica a la que pertenece tu propia cuenta.')
    }

    const { data: clinica, error: clinicaError } = await supabaseAdmin
      .from('clinicas')
      .select('id, nombre')
      .eq('id', clinicaId)
      .single()
    if (clinicaError || !clinica) throw new Error('Clínica no encontrada')
    if (confirmarNombre.trim() !== clinica.nombre) {
      throw new Error('El nombre no coincide — escribe el nombre exacto de la clínica para confirmar.')
    }

    // ---------- 1. Pacientes de esta clínica (para Storage, antes del cascade) ----------
    const { data: pacientes, error: pacientesQueryError } = await supabaseAdmin
      .from('pacientes')
      .select('id')
      .eq('clinica_id', clinicaId)
    if (pacientesQueryError) throw pacientesQueryError
    const pacienteIds = (pacientes ?? []).map((p) => p.id)

    const advertencias: string[] = []

    if (pacienteIds.length > 0) {
      const [{ data: fotos }, { data: documentos }] = await Promise.all([
        supabaseAdmin.from('fotografias').select('url_storage').in('paciente_id', pacienteIds),
        supabaseAdmin.from('documentos_clinicos').select('url_storage').in('paciente_id', pacienteIds),
      ])

      const pathsFotos = (fotos ?? []).map((f) => f.url_storage).filter(Boolean)
      const pathsDocumentos = (documentos ?? []).map((d) => d.url_storage).filter(Boolean)

      if (pathsFotos.length > 0) {
        const { error } = await supabaseAdmin.storage.from('fotos-clinicas').remove(pathsFotos)
        if (error) advertencias.push(`No se pudieron borrar ${pathsFotos.length} fotografía(s) de Storage: ${error.message}`)
      }
      if (pathsDocumentos.length > 0) {
        const { error } = await supabaseAdmin.storage.from('documentos-clinicos').remove(pathsDocumentos)
        if (error) advertencias.push(`No se pudieron borrar ${pathsDocumentos.length} documento(s) de Storage: ${error.message}`)
      }
    }

    // ---------- 2. Usuarios: se borra la cuenta de Auth, que cascada la fila de `usuarios` ----------
    const { data: usuariosClinica, error: usuariosQueryError } = await supabaseAdmin
      .from('usuarios')
      .select('id')
      .eq('clinica_id', clinicaId)
    if (usuariosQueryError) throw usuariosQueryError

    for (const u of usuariosClinica ?? []) {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(u.id)
      if (error) advertencias.push(`No se pudo eliminar la cuenta de un usuario (${u.id}): ${error.message}`)
    }

    // ---------- 3. Pacientes (cascada: expedientes, notas, tratamientos, odontograma, ----------
    //              periodontograma, citas, pagos, fotos/documentos, recetas, consentimientos, referencias)
    if (pacienteIds.length > 0) {
      const { error } = await supabaseAdmin.from('pacientes').delete().eq('clinica_id', clinicaId)
      if (error) throw error
    }

    // ---------- 4. Lo que referencia clinica_id directo y no cascada ----------
    for (const tabla of ['horarios_bloqueados', 'lista_espera', 'catalogo_tratamientos']) {
      const { error } = await supabaseAdmin.from(tabla).delete().eq('clinica_id', clinicaId)
      if (error) advertencias.push(`No se pudo limpiar "${tabla}": ${error.message}`)
    }

    // ---------- 5. La clínica misma ----------
    const { error: deleteClinicaError } = await supabaseAdmin.from('clinicas').delete().eq('id', clinicaId)
    if (deleteClinicaError) throw deleteClinicaError

    // La auditoría vive en su propia tabla, sin FK a clinicas — sobrevive al borrado a propósito.
    await supabaseAdmin.from('auditoria').insert({
      usuario_id: user.id,
      accion: 'eliminar_clinica',
      entidad: 'clinicas',
      entidad_id: clinicaId,
      detalle: { nombre: clinica.nombre, pacientes_eliminados: pacienteIds.length, usuarios_eliminados: (usuariosClinica ?? []).length, advertencias, via: 'edge_function' },
    })

    return new Response(JSON.stringify({ ok: true, advertencias }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
