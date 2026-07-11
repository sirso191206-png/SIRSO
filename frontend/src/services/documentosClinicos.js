import { supabase } from '../lib/supabase'

const BUCKET = 'documentos-clinicos'
const PAGINA = 12

export async function obtenerDocumentos(pacienteId, { desde = 0, limite = PAGINA } = {}) {
  const { data, error, count } = await supabase
    .from('documentos_clinicos')
    .select('id, tipo, nombre, descripcion, url_storage, creado_en', { count: 'exact' })
    .eq('paciente_id', pacienteId)
    .order('creado_en', { ascending: false })
    .range(desde, desde + limite - 1)
  if (error) throw error

  const conUrls = await Promise.all(
    data.map(async (doc) => {
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(doc.url_storage, 60 * 10)
      return { ...doc, url_firmada: signed?.signedUrl }
    })
  )
  return { documentos: conUrls, total: count ?? 0 }
}

export async function subirDocumento({ pacienteId, archivo, tipo, nombre, descripcion, usuarioId }) {
  const extension = archivo.name.split('.').pop()
  const path = `${pacienteId}/${crypto.randomUUID()}.${extension}`

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, archivo)
  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('documentos_clinicos')
    .insert({
      paciente_id: pacienteId,
      tipo,
      nombre: nombre || archivo.name,
      descripcion: descripcion || null,
      url_storage: path,
      subido_por: usuarioId
    })
    .select()
    .single()
  if (error) throw error
  return data
}
