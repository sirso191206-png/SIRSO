import { supabase } from '../lib/supabase'

// consentimientos_informados tiene DOS FK hacia usuarios (dentista_id
// y revocado_por) — sin especificar cuál, PostgREST no puede decidir
// solo y devuelve PGRST201 ("more than one relationship was found").
// Por eso toda relación hacia usuarios desde esta tabla debe nombrar
// su constraint explícitamente.
const SELECT_CON_DENTISTA = '*, dentista:usuarios!consentimientos_informados_dentista_id_fkey(nombre, cedula_profesional)'

export async function obtenerConsentimientos(pacienteId) {
  const { data, error } = await supabase
    .from('consentimientos_informados')
    .select(SELECT_CON_DENTISTA)
    .eq('paciente_id', pacienteId)
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data
}

export async function crearConsentimiento(consentimiento) {
  const { data, error } = await supabase
    .from('consentimientos_informados')
    .insert(consentimiento)
    .select(SELECT_CON_DENTISTA)
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
    .select(SELECT_CON_DENTISTA)
    .single()
  if (error) throw error
  return data
}
