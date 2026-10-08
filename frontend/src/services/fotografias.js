import { supabase } from '../lib/supabase'

const BUCKET = 'fotos-clinicas'
import { validarArchivo, mensajeErrorArchivo } from '../lib/limitesArchivos'
const PAGINA = 12

// select() con columnas específicas (no '*'), con límite de página — antes
// se traían TODAS las fotos del paciente y se generaba una URL firmada
// para cada una de golpe, aunque el usuario nunca las viera todas.
export async function obtenerFotografias(pacienteId, { desde = 0, limite = PAGINA } = {}) {
  const { data, error, count } = await supabase
    .from('fotografias')
    .select('id, etiqueta, fecha_captura, url_storage, tratamiento_id', { count: 'exact' })
    .eq('paciente_id', pacienteId)
    .order('fecha_captura', { ascending: false })
    .range(desde, desde + limite - 1)
  if (error) throw error

  // La URL firmada (de corta duración) solo se genera para esta página,
  // no para el historial completo de fotos del paciente. Una sola
  // llamada por lotes (createSignedUrls) en vez de una por foto — antes
  // eran hasta PAGINA llamadas en paralelo, ahora es una sola.
  let firmadaPorRuta = {}
  if (data.length > 0) {
    const { data: firmadas } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(data.map((f) => f.url_storage), 60 * 10) // 10 minutos
    firmadaPorRuta = Object.fromEntries((firmadas ?? []).map((f) => [f.path, f.signedUrl]))
  }
  const conUrls = data.map((foto) => ({ ...foto, url_firmada: firmadaPorRuta[foto.url_storage] }))
  return { fotos: conUrls, total: count ?? 0 }
}

export async function subirFotografia({ pacienteId, tratamientoId, archivo, etiqueta, usuarioId }) {
  const valido = validarArchivo(BUCKET, archivo)
  if (!valido.ok) throw new Error(valido.mensaje)
  const extension = archivo.name.split('.').pop()
  const path = `${pacienteId}/${crypto.randomUUID()}.${extension}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, archivo)
  if (uploadError) {
    console.error(uploadError)
    throw new Error(mensajeErrorArchivo(uploadError, BUCKET))
  }

  const { data, error } = await supabase
    .from('fotografias')
    .insert({
      paciente_id: pacienteId,
      tratamiento_id: tratamientoId ?? null,
      url_storage: path,
      etiqueta,
      subido_por: usuarioId
    })
    .select()
    .single()
  if (error) throw error
  return data
}
