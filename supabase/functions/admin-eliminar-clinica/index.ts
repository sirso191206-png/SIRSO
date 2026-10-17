// Edge Function: admin-eliminar-clinica
// Solo responde si quien llama tiene usuarios.es_super_admin = true.
// A diferencia de "suspender" (admin-actualizar-clinica, reversible), esto es un borrado REAL e IRREVERSIBLE.
//
// Dos acciones:
//   { accion: 'previsualizar', clinicaId }  → qué se destruiría, qué se conserva y si algo lo impide. No modifica nada.
//   { accion: 'eliminar', clinicaId, confirmarNombre, confirmarDatosClinicos }
//   { accion: 'limpieza_pendiente' | 'reintentar_limpieza', clinicaId }  → lo que falta limpiar (Storage y Auth) tras una eliminación, y reanudarlo
//
// POR QUÉ ESTÁ ESCRITA ASÍ (migración 086): antes borraba las cuentas de Auth una por una y, si alguna fallaba, solo lo anotaba
// como "advertencia" y seguía; terminaba borrando datos clínicos y fallando al final contra usuarios_clinica_id_fkey, con la
// clínica a medias. Ahora TODO lo que es base de datos ocurre en UNA transacción (fn_eliminar_clinica: todo o nada, con
// comprobaciones previas) y solo DESPUÉS del commit se limpia lo que SQL no puede borrar — archivos de Storage y cuentas de
// Auth —, informando cada fallo. Si esa limpieza falla, la base ya es consistente y queda constancia en la auditoría.
// Los controles de autorización y de negocio (solo superadmin, clínica suspendida, política de conservación de información
// clínica —migración 087: sin política definida o dentro del plazo NO se elimina—, ARCO e incidentes pendientes, nombre exacto,
// confirmación de datos clínicos, nunca la clínica de quien solicita) viven en la base de datos, no aquí: esta función no puede
// saltárselos. Para revocar el acceso SIN destruir nada, la vía es suspender (admin-actualizar-clinica).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

import { buildCorsHeaders } from '../_shared/cors.ts'

const TAMANO_LOTE_STORAGE = 100

// Errores PROPIOS de la función (mensaje fijo y seguro de mostrar). Cualquier otro error (de la base, de red…) es INESPERADO: se registra en el
// servidor y al cliente solo se le devuelve un mensaje genérico, para no filtrar detalles internos ni reflejar la entrada recibida.
class ErrorDeSolicitud extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ACCIONES = ['previsualizar', 'eliminar', 'limpieza_pendiente', 'reintentar_limpieza']

// Valida el cuerpo ANTES de tocar la base de datos: ningún dato malformado llega a una función SQL (y menos a una destructiva).
function validarEntrada(body: unknown): { clinicaId: string; accion: string; confirmarNombre?: string; confirmarDatosClinicos: boolean } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ErrorDeSolicitud('Solicitud inválida')
  const b = body as Record<string, unknown>
  if (b.clinicaId === undefined || b.clinicaId === null || b.clinicaId === '') throw new ErrorDeSolicitud('Falta clinicaId')
  if (typeof b.clinicaId !== 'string' || !UUID.test(b.clinicaId)) throw new ErrorDeSolicitud('clinicaId inválido')
  const accion = b.accion ?? 'eliminar'
  if (typeof accion !== 'string' || !ACCIONES.includes(accion)) throw new ErrorDeSolicitud('Acción no válida')
  let confirmarNombre: string | undefined
  if (accion === 'eliminar') {
    if (!b.confirmarNombre) throw new ErrorDeSolicitud('Falta confirmarNombre — debes escribir el nombre exacto de la clínica.')
    if (typeof b.confirmarNombre !== 'string' || b.confirmarNombre.length > 200) throw new ErrorDeSolicitud('confirmarNombre inválido')
    confirmarNombre = b.confirmarNombre
  }
  if (b.confirmarDatosClinicos !== undefined && typeof b.confirmarDatosClinicos !== 'boolean') throw new ErrorDeSolicitud('confirmarDatosClinicos debe ser verdadero o falso')
  return { clinicaId: b.clinicaId, accion, confirmarNombre, confirmarDatosClinicos: b.confirmarDatosClinicos === true }
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get('Origin'))
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  const responder = (cuerpo: unknown, status = 200) =>
    new Response(JSON.stringify(cuerpo), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new ErrorDeSolicitud('Falta autenticación')
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) throw new ErrorDeSolicitud('Falta token de acceso')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Cliente efímero solo para validar el token de quien llama.
    const supabaseCaller = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    })
    const { data: { user }, error: userError } = await supabaseCaller.auth.getUser(token)
    if (userError || !user) throw new ErrorDeSolicitud('Token inválido')

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    const { data: perfilCaller, error: perfilError } = await supabaseAdmin
      .from('usuarios')
      .select('es_super_admin, debe_cambiar_password')
      .eq('id', user.id)
      .single()
    if (perfilError || !perfilCaller) throw new ErrorDeSolicitud('No se encontró tu perfil')
    if (perfilCaller.debe_cambiar_password === true) throw new ErrorDeSolicitud('Debes cambiar tu contraseña temporal antes de continuar.')
    if (!perfilCaller.es_super_admin) throw new ErrorDeSolicitud('No autorizado')

    let body: unknown
    try { body = await req.json() } catch { throw new ErrorDeSolicitud('Solicitud inválida') }
    const { clinicaId, accion, confirmarNombre, confirmarDatosClinicos } = validarEntrada(body)

    // ---------- Acciones de solo lectura / reanudación ----------
    if (accion === 'previsualizar') {
      const { data: resumen, error } = await supabaseAdmin.rpc('fn_clinica_resumen_eliminacion', { p_clinica: clinicaId, p_solicitante: user.id })
      if (error) throw error
      return responder({ ok: true, resumen })
    }
    if (accion === 'limpieza_pendiente') {
      const { data, error } = await supabaseAdmin.rpc('fn_limpieza_pendiente_clinica', { p_clinica: clinicaId })
      if (error) throw error
      return responder({ ok: true, ...data })
    }
    if (accion === 'reintentar_limpieza') {
      // Reanuda la limpieza de una clínica YA eliminada (p. ej. si la función se interrumpió o Auth/Storage fallaron): solo toca
      // lo que sigue pendiente según la auditoría, nunca nada ajeno a esa eliminación.
      const { data: pendiente, error } = await supabaseAdmin.rpc('fn_limpieza_pendiente_clinica', { p_clinica: clinicaId })
      if (error) throw error
      if (!pendiente?.existe) throw new ErrorDeSolicitud('No hay una eliminación registrada de esa clínica: no hay nada que reanudar.')
      if (pendiente.error === 'CLINICA_AUN_EXISTE') throw new ErrorDeSolicitud('La clínica sigue existiendo: no hay limpieza que reanudar.')
      return responder(await limpiarYRegistrar(supabaseAdmin, user.id, clinicaId, pendiente.pendiente, { conteos: null }))
    }

    // ---------- 1. La base de datos: UNA transacción, todo o nada ----------
    // El servidor decide TODO: no se envía ninguna fecha ni plazo desde el cliente; la política de conservación se evalúa en la base.
    const { data: resultado, error: errorEliminar } = await supabaseAdmin.rpc('fn_eliminar_clinica', {
      p_clinica: clinicaId,
      p_solicitante: user.id,
      p_confirmar_nombre: confirmarNombre,
      p_confirmar_datos_clinicos: confirmarDatosClinicos
    })
    if (errorEliminar) {
      // No se borró NADA (la transacción se deshizo). Como el rechazo revierte lo que la propia función hubiera escrito, el
      // intento se registra APARTE (mejor esfuerzo: si esto falla, el rechazo se devuelve igual).
      await supabaseAdmin.rpc('fn_registrar_intento_eliminacion', {
        p_clinica: clinicaId, p_solicitante: user.id, p_codigo: errorEliminar.hint ?? errorEliminar.code ?? 'ERROR', p_mensaje: errorEliminar.message
      }).then(() => null, () => null)
      if (errorEliminar.hint) return responder({ error: errorEliminar.message, codigo: errorEliminar.hint }, 400)
      // Sin `hint` NO es un rechazo de negocio (nuestras funciones SQL siempre lo marcan): es un fallo INESPERADO de la base. No se muestra su texto.
      console.error('admin-eliminar-clinica: fallo inesperado de la base', errorEliminar.code ?? '', errorEliminar.message)
      return responder({ error: 'No se pudo completar la operación. Revisa los registros de la función.', codigo: errorEliminar.code ? `DB_${errorEliminar.code}` : null }, 500)
    }

    // ---------- 2. Tras el COMMIT: lo que SQL no puede borrar (Storage y Auth). NO comparten transacción con PostgreSQL ----------
    // La lista completa de lo pendiente ya quedó guardada en la auditoría DENTRO de la transacción del borrado: si esta función
    // se interrumpe a partir de aquí, nada se pierde y `reintentar_limpieza` la reanuda.
    return responder(await limpiarYRegistrar(supabaseAdmin, user.id, clinicaId,
      { archivos: resultado.rutas_storage, cuentas_auth: resultado.cuentas_auth }, { conteos: resultado.conteos }))
  } catch (err) {
    if (err instanceof ErrorDeSolicitud) return responder({ error: err.message }, 400)
    // Rechazo de NEGOCIO de la base de datos (nuestras funciones SQL lo marcan con un `hint`): su mensaje es seguro y accionable.
    const e = err as { hint?: string; message?: string; code?: string }
    if (e && typeof e === 'object' && typeof e.hint === 'string' && e.hint) return responder({ error: e.message, codigo: e.hint }, 400)
    // Cualquier otra cosa es INESPERADA: se registra aquí (sin el cuerpo de la petición) y se responde algo genérico.
    console.error('admin-eliminar-clinica: error inesperado', e?.code ?? '', e?.message ?? String(err))
    return responder({ error: 'No se pudo completar la operación. Revisa los registros de la función.', codigo: e?.code ? `DB_${e.code}` : null }, 500)
  }
})

// Borra archivos y cuentas, anota en la base lo que SÍ se logró y lo que falló, y responde con el estado REAL: la base de datos ya no
// (PROPUESTA v3) Borra SOLO lo que la base aprueba: rutas validadas y cuentas comprobadas una a una con fn_cuenta_auth_eliminable (108).
// Registra el avance por lotes; nunca declara «completa» si queda algo. Los descartes y fallos quedan registrados.
const UUID_PREFIJO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i
const BUCKETS = new Set(['fotos-clinicas', 'documentos-clinicos', 'logos-clinicas'])
function rutasValidas(bucket: string, rutas: unknown, clinicaId: string): { validas: string[]; descartadas: string[] } {
  const validas: string[] = [], descartadas: string[] = []
  if (!Array.isArray(rutas)) return { validas, descartadas }
  if (!BUCKETS.has(bucket)) return { validas, descartadas: rutas.map(String) }
  for (const r of rutas) {
    const ok = typeof r === 'string' && UUID_PREFIJO.test(r) && !r.split('/').includes('..') && (bucket !== 'logos-clinicas' || r.startsWith(`${clinicaId}/`))
    ;(ok ? validas : descartadas).push(String(r))
  }
  return { validas, descartadas }
}

async function limpiarYRegistrar(admin: any, solicitanteId: string, clinicaId: string,
                                 pendiente: { archivos: Record<string, string[]>, cuentas_auth: string[] }, extra: { conteos: unknown }) {
  const fallos: Array<Record<string, unknown>> = []
  const advertencias: string[] = []
  let restante: any = null, errorRegistro: any = null
  const registrar = async (archivos: Record<string, string[]>, cuentas: string[]) => {
    if (Object.keys(archivos).length === 0 && cuentas.length === 0 && fallos.length === 0) return
    const lote = fallos.splice(0)
    for (const f of lote) advertencias.push(`${f.tipo}: ${f.motivo}`)
    const r = await admin.rpc('fn_registrar_limpieza_clinica', { p_clinica: clinicaId, p_solicitante: solicitanteId, p_archivos_borrados: archivos, p_cuentas_borradas: cuentas, p_fallos: lote })
    if (r.error) errorRegistro = r.error; else restante = r.data
  }
  for (const [bucket, rutas] of Object.entries(pendiente.archivos ?? {})) {
    const { validas, descartadas } = rutasValidas(bucket, rutas, clinicaId)
    if (descartadas.length) fallos.push({ tipo: 'archivos', bucket, cantidad: descartadas.length, motivo: 'ruta descartada por validación' })
    for (let i = 0; i < validas.length; i += TAMANO_LOTE_STORAGE) {
      const lote = validas.slice(i, i + TAMANO_LOTE_STORAGE)
      const { error } = await admin.storage.from(bucket).remove(lote)
      if (error) fallos.push({ tipo: 'archivos', bucket, cantidad: lote.length, motivo: error.message })
      else await registrar({ [bucket]: lote }, [])
    }
  }
  for (const id of pendiente.cuentas_auth ?? []) {
    const { data: veredicto, error: errV } = await admin.rpc('fn_cuenta_auth_eliminable', { p_clinica: clinicaId, p_cuenta: id })
    if (errV) { fallos.push({ tipo: 'cuenta', id, motivo: 'no se pudo comprobar la propiedad' }); continue }
    if (veredicto === 'YA_NO_EXISTE') { await registrar({}, [id]); continue }
    if (veredicto !== 'OK') { fallos.push({ tipo: 'cuenta', id, motivo: `no eliminable: ${veredicto}` }); continue }
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error && !/not.?found/i.test(error.message)) fallos.push({ tipo: 'cuenta', id, motivo: error.message })
    else await registrar({}, [id])
  }
  await registrar({}, [])
  if (!restante && !errorRegistro) { const r = await admin.rpc('fn_limpieza_pendiente_clinica', { p_clinica: clinicaId }); restante = r.data; errorRegistro = r.error }
  const completa = !errorRegistro && restante?.limpieza_completa === true && advertencias.length === 0
  return {
    ok: true,
    base_de_datos: 'eliminada',
    estado: completa ? 'eliminada_completa' : 'eliminada_con_limpieza_pendiente',
    conteos: extra.conteos,
    advertencias: [...advertencias, ...(errorRegistro ? [`No se pudo registrar el avance de la limpieza: ${errorRegistro.message}`] : [])],
    pendientes: errorRegistro ? { desconocido: true } : { total: restante?.total_pendiente ?? null, cuentas: restante?.pendiente?.cuentas_auth?.length ?? null,
      archivos: Object.values(restante?.pendiente?.archivos ?? {}).reduce((n: number, l: any) => n + l.length, 0) }
  }
}