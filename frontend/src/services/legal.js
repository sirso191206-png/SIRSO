import { supabase } from '../lib/supabase'

// ---------- Documentos legales ----------

// Devuelve el documento activo de este tipo para la clínica dada — si
// la clínica tiene su propia versión publicada, esa gana; si no, cae
// al documento de plataforma (clinica_id null). Nunca se mezclan
// fragmentos de ambos — es una versión completa u otra, nunca un
// híbrido.
export async function obtenerDocumentoActivo(tipo, clinicaId) {
  if (clinicaId) {
    const { data: propio, error: errorPropio } = await supabase
      .from('legal_documents')
      .select('*')
      .eq('tipo', tipo)
      .eq('clinica_id', clinicaId)
      .eq('activo', true)
      .maybeSingle()
    if (errorPropio) throw errorPropio
    if (propio) return propio
  }

  const { data: plataforma, error: errorPlataforma } = await supabase
    .from('legal_documents')
    .select('*')
    .eq('tipo', tipo)
    .is('clinica_id', null)
    .eq('activo', true)
    .maybeSingle()
  if (errorPlataforma) throw errorPlataforma
  return plataforma
}

export async function listarDocumentosDeClinica(clinicaId) {
  const { data, error } = await supabase
    .from('legal_documents')
    .select('*')
    .eq('clinica_id', clinicaId)
    .order('tipo')
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data
}

export async function listarHistorialVersiones(tipo, clinicaId) {
  let query = supabase
    .from('legal_documents')
    .select('*')
    .eq('tipo', tipo)
    .order('creado_en', { ascending: false })
  query = clinicaId ? query.eq('clinica_id', clinicaId) : query.is('clinica_id', null)
  const { data, error } = await query
  if (error) throw error
  return data
}

// Publicar una nueva versión NO modifica la anterior — inserta un
// registro nuevo y, si se pide activarla de inmediato, desactiva la
// que estaba activa en un segundo paso (nunca se pisan directamente).
export async function crearVersionDocumento(documento) {
  const { data, error } = await supabase
    .from('legal_documents')
    .insert(documento)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function activarVersionDocumento(id, tipo, clinicaId) {
  let query = supabase.from('legal_documents').update({ activo: false }).eq('tipo', tipo).eq('activo', true)
  query = clinicaId ? query.eq('clinica_id', clinicaId) : query.is('clinica_id', null)
  const { error: errorDesactivar } = await query
  if (errorDesactivar) throw errorDesactivar

  const { data, error } = await supabase
    .from('legal_documents')
    .update({ activo: true, publicado_en: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ---------- Aceptaciones ----------

export async function registrarAceptacion(aceptacion) {
  const { data, error } = await supabase
    .from('legal_acceptances')
    .insert(aceptacion)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function obtenerMisAceptaciones() {
  const { data, error } = await supabase
    .from('legal_acceptances')
    .select('*, documento:legal_documents(tipo, titulo, version)')
    .order('aceptado_en', { ascending: false })
  if (error) throw error
  return data
}

// Para saber si el usuario actual ya aceptó la versión ACTIVA de un
// tipo de documento — se usa para decidir si mostrar el modal de
// reaceptación al iniciar sesión.
export async function yaAceptoVersionActiva(documentoId) {
  const { data, error } = await supabase
    .from('legal_acceptances')
    .select('id')
    .eq('documento_id', documentoId)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return Boolean(data)
}
