import { supabase } from '../lib/supabase'

const BUCKET = 'documentos-clinicos'
import { validarArchivo, mensajeErrorArchivo } from '../lib/limitesArchivos'
const PAGINA = 12

export async function obtenerDocumentos(pacienteId, { desde = 0, limite = PAGINA } = {}) {
  const { data, error, count } = await supabase
    .from('documentos_clinicos')
    .select('id, tipo, nombre, descripcion, url_storage, creado_en', { count: 'exact' })
    .eq('paciente_id', pacienteId)
    .order('creado_en', { ascending: false })
    .range(desde, desde + limite - 1)
  if (error) throw error

  // Una sola llamada de red para firmar todas las URLs de la página
  // (createSignedUrls, por lotes) en vez de una llamada por documento
  // — antes eran hasta PAGINA llamadas en paralelo, ahora es una sola.
  let firmadaPorRuta = {}
  if (data.length > 0) {
    const { data: firmadas } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(data.map((d) => d.url_storage), 60 * 10)
    firmadaPorRuta = Object.fromEntries((firmadas ?? []).map((f) => [f.path, f.signedUrl]))
  }
  const conUrls = data.map((doc) => ({ ...doc, url_firmada: firmadaPorRuta[doc.url_storage] }))
  return { documentos: conUrls, total: count ?? 0 }
}

export async function subirDocumento({ pacienteId, archivo, tipo, nombre, descripcion, usuarioId }) {
  const valido = validarArchivo(BUCKET, archivo)
  if (!valido.ok) throw new Error(valido.mensaje)
  const extension = archivo.name.split('.').pop()
  const path = `${pacienteId}/${crypto.randomUUID()}.${extension}`

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, archivo)
  if (uploadError) {
    console.error(uploadError)
    throw new Error(mensajeErrorArchivo(uploadError, BUCKET))
  }

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
