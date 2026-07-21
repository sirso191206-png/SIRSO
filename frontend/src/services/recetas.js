import { supabase } from '../lib/supabase'

export async function obtenerRecetas(pacienteId) {
  const { data, error } = await supabase
    .from('recetas')
    .select('*, dentista:usuarios(nombre, cedula_profesional)')
    .eq('paciente_id', pacienteId)
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data
}

export async function crearReceta(receta) {
  const { data, error } = await supabase
    .from('recetas')
    .insert(receta)
    .select('*, dentista:usuarios(nombre, cedula_profesional)')
    .single()
  if (error) throw error
  return data
}
