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

// Traduce los campos camelCase del formulario a las columnas snake_case
// reales — se exporta para que la actualización optimista local (cola
// offline, useOdontograma.js) use exactamente esta misma conversión en
// vez de duplicarla, y nunca se desincronicen.
export function construirCambiosPieza({ estado, diagnostico, tratamientoId, notas, materialCorona, tipoIncrustacion, tipoAusencia }) {
  const cambios = {}
  if (estado !== undefined) cambios.estado = estado
  if (diagnostico !== undefined) cambios.diagnostico = diagnostico || null
  if (tratamientoId !== undefined) cambios.tratamiento_id = tratamientoId || null
  if (notas !== undefined) cambios.notas = notas || null
  if (materialCorona !== undefined) cambios.material_corona = materialCorona || null
  if (tipoIncrustacion !== undefined) cambios.tipo_incrustacion = tipoIncrustacion || null
  if (tipoAusencia !== undefined) cambios.tipo_ausencia = tipoAusencia || null
  return cambios
}

// Estado GENERAL de la pieza — condiciones que cubren todo el diente:
// ausente, corona, implante, endodoncia, en_tratamiento, sano. También
// diagnóstico, tratamiento asociado y notas libres.
// actualizado_en ya no la pone el frontend a mano — la mantiene un
// trigger (migración 072). Si se pasa actualizadoEnEsperado, se agrega
// como condición extra del UPDATE (se suma a RLS, no la reemplaza): si
// alguien más ya modificó esta pieza desde que se abrió el formulario,
// la condición no encuentra ninguna fila, y .single() lanza PGRST116
// en vez de guardar encima de datos ya desactualizados.
export async function actualizarPiezaOdontograma(piezaId, { estado, diagnostico, tratamientoId, notas, materialCorona, tipoIncrustacion, tipoAusencia, usuarioId, actualizadoEnEsperado }) {
  const cambios = { ...construirCambiosPieza({ estado, diagnostico, tratamientoId, notas, materialCorona, tipoIncrustacion, tipoAusencia }), actualizado_por: usuarioId }

  let query = supabase.from('odontograma_piezas').update(cambios).eq('id', piezaId)
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

// Estado de UNA cara específica — caries, obturado, fracturado, sano.
export async function actualizarCara(caraId, { estado, usuarioId, actualizadoEnEsperado }) {
  let query = supabase
    .from('odontograma_caras')
    .update({ estado, actualizado_por: usuarioId })
    .eq('id', caraId)
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

/**
 * Reconstruye el estado "inicial" de cada pieza (antes del primer
 * cambio registrado) a partir del historial — no existe una tabla de
 * snapshot aparte, se deriva de odontograma_historial. Si una pieza
 * nunca cambió, su estado inicial es el mismo que el actual (nunca
 * se tocó desde que se creó en 'sano').
 * Devuelve un mapa { numero_pieza: estado }.
 */
export function calcularEstadoInicial(piezas, historial) {
  const primerCambioPorPieza = new Map()
  for (const h of historial) {
    if (h.cara !== null) continue // solo nos interesan cambios de la pieza completa aquí
    const numero = h.pieza.numero_pieza
    if (!primerCambioPorPieza.has(numero)) primerCambioPorPieza.set(numero, h)
  }
  const inicial = {}
  for (const p of piezas) {
    const primerCambio = primerCambioPorPieza.get(p.numero_pieza)
    inicial[p.numero_pieza] = primerCambio ? (primerCambio.estado_anterior || 'sano') : p.estado
  }
  return inicial
}
