import { supabase } from '../lib/supabase'

export async function obtenerMiClinica(clinicaId) {
  const { data, error } = await supabase
    .from('clinicas')
    .select('*')
    .eq('id', clinicaId)
    .single()
  if (error) throw error
  return data
}

export async function actualizarMiClinica(clinicaId, cambios) {
  const { data, error } = await supabase
    .from('clinicas')
    .update(cambios)
    .eq('id', clinicaId)
    .select()
    .single()
  if (error) throw error
  return data
}
