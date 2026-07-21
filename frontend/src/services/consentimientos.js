import { supabase } from '../lib/supabase'

export async function obtenerConsentimientos(pacienteId) {
  const { data, error } = await supabase
    .from('consentimientos_informados')
    .select('*, dentista:usuarios(nombre, cedula_profesional)')
    .eq('paciente_id', pacienteId)
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data
}

export async function crearConsentimiento(consentimiento) {
  const { data, error } = await supabase
    .from('consentimientos_informados')
    .insert(consentimiento)
    .select('*, dentista:usuarios(nombre, cedula_profesional)')
    .single()
  if (error) throw error
  return data
}
