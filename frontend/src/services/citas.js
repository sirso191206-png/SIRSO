import { supabase } from '../lib/supabase'

export async function obtenerCitaPorId(id) {
  const { data, error } = await supabase
    .from('citas')
    .select('*, paciente:pacientes(nombre_completo, telefono, numero_expediente), dentista:usuarios(nombre)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function obtenerCitasRango({ dentistaId, estado, desde, hasta }) {
  let query = supabase
    .from('citas')
    .select('*, paciente:pacientes(nombre_completo, telefono), dentista:usuarios(nombre)')
    .gte('inicio', desde)
    .lte('inicio', hasta)
    .order('inicio')

  if (dentistaId) {
    query = query.eq('dentista_id', dentistaId)
  }
  if (estado) {
    query = query.eq('estado', estado)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

function mensajeError(error) {
  if (error.code === '23P01') return 'Ese horario ya está ocupado para este dentista.'
  if (error.message?.includes('horario está bloqueado')) return error.message
  return error.message
}

export async function crearCita(cita) {
  const { data, error } = await supabase
    .from('citas')
    .insert(cita)
    .select()
    .single()

  if (error) throw new Error(mensajeError(error))
  return data
}

export async function actualizarCita(id, cambios) {
  const { data, error } = await supabase
    .from('citas')
    .update(cambios)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(mensajeError(error))
  return data
}

export async function eliminarCita(id) {
  const { error } = await supabase.from('citas').delete().eq('id', id)
  if (error) throw error
}
