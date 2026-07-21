import { supabase } from '../lib/supabase'

export async function obtenerReferencias(pacienteId) {
  const { data, error } = await supabase
    .from('referencias_medicas')
    .select('*, dentista:usuarios(nombre, cedula_profesional)')
    .eq('paciente_id', pacienteId)
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data
}

export async function crearReferencia(referencia) {
  const { data, error } = await supabase
    .from('referencias_medicas')
    .insert(referencia)
    .select('*, dentista:usuarios(nombre, cedula_profesional)')
    .single()
  if (error) throw error
  return data
}
