import { supabase } from '../lib/supabase'

export async function obtenerSignosVitales(pacienteId) {
  const { data, error } = await supabase
    .from('signos_vitales')
    .select('*, usuario:usuarios(nombre)')
    .eq('paciente_id', pacienteId)
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data
}

export async function agregarSignosVitales(registro) {
  const { data, error } = await supabase
    .from('signos_vitales')
    .insert(registro)
    .select()
    .single()
  if (error) throw error
  return data
}
