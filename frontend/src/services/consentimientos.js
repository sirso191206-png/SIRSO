import { supabase } from '../lib/supabase'

export async function obtenerConsentimientos(pacienteId) {
  const { data, error } = await supabase
    .from('consentimientos_informados')
    .select(`
      *,
      dentista:usuarios!consentimientos_informados_dentista_id_fkey(
        nombre,
        cedula_profesional
      )
    `)
    .eq('paciente_id', pacienteId)
    .order('creado_en', { ascending: false })

  if (error) throw error
  return data
}

export async function crearConsentimiento(consentimiento) {
  const { data, error } = await supabase
    .from('consentimientos_informados')
    .insert(consentimiento)
    .select(`
      *,
      dentista:usuarios!consentimientos_informados_dentista_id_fkey(
        nombre,
        cedula_profesional
      )
    `)
    .single()

  if (error) throw error
  return data
}

export async function revocarConsentimiento(id, { usuarioId, motivo }) {
  const { data, error } = await supabase
    .from('consentimientos_informados')
    .update({
      revocado_en: new Date().toISOString(),
      revocado_por: usuarioId,
      motivo_revocacion: motivo || null
    })
    .eq('id', id)
    .select(`
      *,
      dentista:usuarios!consentimientos_informados_dentista_id_fkey(
        nombre,
        cedula_profesional
      )
    `)
    .single()

  if (error) throw error
  return data
}
