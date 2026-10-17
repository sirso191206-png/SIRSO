import { supabase } from '../lib/supabase'
import { datosDeDiagnostico, mensajeErrorFinalizar } from '../lib/finalizarConsulta'

// Finalizar una consulta clínica en UNA sola transacción del servidor (fn_finalizar_consulta, migración 085): actualiza la
// cita, crea la nota (inmutable, idempotente por id) y, si se pide, el seguimiento. Todo o nada, y es seguro repetirlo: una
// consulta ya completada responde `ya_finalizada` sin duplicar nada.
//   nota:        { id, contenido, diagnostico, diagnostico_cie10_codigo, …, hallazgos, creado_en } | null (plan sin notas)
//   seguimiento: { id, inicio, fin, motivo_consulta } | null
// Los ids de nota y seguimiento los fija el que llama (y los conserva entre reintentos): así un reintento nunca duplica.
export async function finalizarConsulta({ citaId, motivo, nota, seguimiento, actualizadoEnEsperado } = {}) {
  const { data, error } = await supabase.rpc('fn_finalizar_consulta', {
    p_cita: citaId,
    p_motivo: motivo ?? null,
    p_nota: nota ?? null,
    p_seguimiento: seguimiento ?? null,
    p_actualizado_en_esperado: actualizadoEnEsperado ?? null
  })
  if (error) {
    // Registro técnico mínimo, sin datos clínicos: qué falló (código), no qué se estaba escribiendo.
    console.error('No se pudo finalizar la consulta:', datosDeDiagnostico(error, citaId))
    const falla = new Error(error.hint === 'CONFLICTO_CONCURRENCIA' ? 'CONFLICTO_CONCURRENCIA' : '')
    falla.codigo = error.hint || null
    falla.original = error
    if (falla.message === '') falla.message = error.hint ? error.message : mensajeErrorFinalizar({ message: error.message, name: error.name, status: error.status, code: error.code })
    return Promise.reject(falla)
  }
  return data
}

function errorDeLaFuncion(error, citaId, operacion) {
  console.error(`No se pudo ${operacion}:`, datosDeDiagnostico(error, citaId))
  const falla = new Error(error.hint ? error.message : mensajeErrorFinalizar({ message: error.message, name: error.name, status: error.status, code: error.code }))
  falla.codigo = error.hint || null
  falla.original = error
  return falla
}

// Completa una consulta cuya cita YA estaba completada pero SIN nota (o sin seguimiento): crea lo que falta, lo VERIFICA y no
// duplica (migración 090). No modifica la cita. Requiere conexión: la verificación es del servidor.
export async function completarConsultaPendiente({ citaId, nota, seguimiento } = {}) {
  const { data, error } = await supabase.rpc('fn_completar_consulta_pendiente', { p_cita: citaId, p_nota: nota ?? null, p_seguimiento: seguimiento ?? null })
  if (error) return Promise.reject(errorDeLaFuncion(error, citaId, 'completar la consulta pendiente'))
  return data
}

// Citas completadas sin nota a las que el usuario tiene acceso (vacía para otros roles o si el plan no incluye notas).
export async function listarConsultasSinNota(dias = 30) {
  const { data, error } = await supabase.rpc('fn_consultas_sin_nota', { p_dias: dias })
  if (error) return Promise.reject(errorDeLaFuncion(error, null, 'listar las consultas pendientes'))
  return data ?? []
}
