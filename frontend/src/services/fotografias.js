import { supabase } from '../lib/supabase'

const BUCKET = 'fotos-clinicas'
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
  // no para el historial completo de fotos del paciente.
  const conUrls = await Promise.all(
    data.map(async (foto) => {
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(foto.url_storage, 60 * 10) // 10 minutos
      return { ...foto, url_firmada: signed?.signedUrl }
    })
  )
  return { fotos: conUrls, total: count ?? 0 }
}

export async function subirFotografia({ pacienteId, tratamientoId, archivo, etiqueta, usuarioId }) {
  const extension = archivo.name.split('.').pop()
  const path = `${pacienteId}/${crypto.randomUUID()}.${extension}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, archivo)
  if (uploadError) throw uploadError

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
