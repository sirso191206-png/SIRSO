import { supabase } from '../lib/supabase'
import { conCacheDeLectura } from '../lib/cacheLectura'

export async function obtenerHistorialPeriodontal(piezaId) {
  const { data, error } = await supabase
    .from('periodontograma_historial')
    .select('*, usuario:usuarios(nombre)')
    .eq('pieza_id', piezaId)
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data
}

export async function obtenerPeriodontogramaCompleto(pacienteId) {
  const { datos } = await conCacheDeLectura(`periodontograma:${pacienteId}`, async () => {
    const { data, error } = await supabase
      .from('periodontograma_piezas')
      .select('*, sitios:periodontograma_sitios(*)')
      .eq('paciente_id', pacienteId)
      .order('numero_pieza')
    if (error) throw error
    return data
  })
  return datos
}

export async function actualizarPiezaPeriodontal(piezaId, { movilidad, furcacion, usuarioId, actualizadoEnEsperado }) {
  let query = supabase
    .from('periodontograma_piezas')
    .update({ movilidad, furcacion, actualizado_por: usuarioId })
    .eq('id', piezaId)
  if (actualizadoEnEsperado) {
    query = query.eq('actualizado_en', actualizadoEnEsperado)
  }
  const { data, error } = await query.select().single()
  if (error) {
    if (error.code === 'PGRST116' && actualizadoEnEsperado) {
      throw new Error('CONFLICTO_CONCURRENCIA')
    }
    throw error
  }
  return data
}

export async function actualizarSitioPeriodontal(sitioId, cambios) {
  const { usuarioId, actualizadoEnEsperado, ...resto } = cambios
  let query = supabase
    .from('periodontograma_sitios')
    .update({ ...resto, actualizado_por: usuarioId })
    .eq('id', sitioId)
  if (actualizadoEnEsperado) {
    query = query.eq('actualizado_en', actualizadoEnEsperado)
  }
  const { data, error } = await query.select().single()
  if (error) {
    if (error.code === 'PGRST116' && actualizadoEnEsperado) {
      throw new Error('CONFLICTO_CONCURRENCIA')
    }
    throw error
  }
  return data
}
