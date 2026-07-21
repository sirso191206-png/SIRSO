import { supabase } from '../lib/supabase'

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
  const { data, error } = await supabase
    .from('periodontograma_piezas')
    .select('*, sitios:periodontograma_sitios(*)')
    .eq('paciente_id', pacienteId)
    .order('numero_pieza')
  if (error) throw error
  return data
}

export async function actualizarPiezaPeriodontal(piezaId, { movilidad, furcacion, usuarioId }) {
  const { data, error } = await supabase
    .from('periodontograma_piezas')
    .update({ movilidad, furcacion, actualizado_en: new Date().toISOString(), actualizado_por: usuarioId })
    .eq('id', piezaId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function actualizarSitioPeriodontal(sitioId, cambios) {
  const { usuarioId, ...resto } = cambios
  const { data, error } = await supabase
    .from('periodontograma_sitios')
    .update({ ...resto, actualizado_en: new Date().toISOString(), actualizado_por: usuarioId })
    .eq('id', sitioId)
    .select()
    .single()
  if (error) throw error
  return data
}
