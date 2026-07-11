import { supabase } from '../lib/supabase'

// Trae las 32 piezas de un paciente, cada una con sus 5 caras embebidas
// en un solo query (relación odontograma_piezas -> odontograma_caras).
export async function obtenerOdontogramaCompleto(pacienteId) {
  const { data, error } = await supabase
    .from('odontograma_piezas')
    .select('*, caras:odontograma_caras(*)')
    .eq('paciente_id', pacienteId)
    .order('numero_pieza')
  if (error) throw error
  return data
}

// Estado GENERAL de la pieza — condiciones que cubren todo el diente:
// ausente, corona, implante, endodoncia, en_tratamiento, sano. También
// diagnóstico, tratamiento asociado y notas libres.
export async function actualizarPiezaOdontograma(piezaId, { estado, diagnostico, tratamientoId, notas, usuarioId }) {
  const cambios = { actualizado_en: new Date().toISOString(), actualizado_por: usuarioId }
  if (estado !== undefined) cambios.estado = estado
  if (diagnostico !== undefined) cambios.diagnostico = diagnostico || null
  if (tratamientoId !== undefined) cambios.tratamiento_id = tratamientoId || null
  if (notas !== undefined) cambios.notas = notas || null

  const { data, error } = await supabase
    .from('odontograma_piezas')
    .update(cambios)
    .eq('id', piezaId)
    .select()
    .single()
  if (error) throw error
  return data
}

// Estado de UNA cara específica — caries, obturado, fracturado, sano.
export async function actualizarCara(caraId, { estado, usuarioId }) {
  const { data, error } = await supabase
    .from('odontograma_caras')
    .update({
      estado,
      actualizado_en: new Date().toISOString(),
      actualizado_por: usuarioId
    })
    .eq('id', caraId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function obtenerHistorialPieza(piezaId) {
  const { data, error } = await supabase
    .from('odontograma_historial')
    .select('*, usuario:usuarios(nombre)')
    .eq('pieza_id', piezaId)
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data
}

// Todo el historial del odontograma de un paciente (todas las piezas),
// ordenado del más antiguo al más nuevo — se usa para reconstruir el
// estado "inicial" (antes del primer cambio registrado) en la
// comparación inicial vs actual.
export async function obtenerHistorialCompletoOdontograma(pacienteId) {
  const { data, error } = await supabase
    .from('odontograma_historial')
    .select('*, pieza:odontograma_piezas!inner(numero_pieza, paciente_id)')
    .eq('pieza.paciente_id', pacienteId)
    .order('creado_en', { ascending: true })
  if (error) throw error
  return data
}
