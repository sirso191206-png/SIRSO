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

// Único UPDATE permitido sobre un consentimiento ya firmado — un
// trigger en la base de datos bloquea cualquier otro cambio, incluso
// si alguien intentara mandarlo por fuera de esta función.
export async function revocarConsentimiento(id, { usuarioId, motivo }) {
  const { data, error } = await supabase
    .from('consentimientos_informados')
    .update({ revocado_en: new Date().toISOString(), revocado_por: usuarioId, motivo_revocacion: motivo || null })
    .eq('id', id)
    .select('*, dentista:usuarios(nombre, cedula_profesional)')
    .single()
  if (error) throw error
  return data
}
