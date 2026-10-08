import { supabase } from '../lib/supabase'
import { validarArchivo, mensajeErrorArchivo } from '../lib/limitesArchivos'

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

// Un logo por clínica — el path SIEMPRE es {clinica_id}/logo.{ext}, así
// que subir uno nuevo sobreescribe el anterior (upsert: true). El
// bucket es público, así que la URL pública queda estable de una vez
// (no hace falta firmar nada cada vez que se muestra en una receta).
export async function subirLogoClinica(clinicaId, archivo) {
  const valido = validarArchivo('logos-clinicas', archivo)
  if (!valido.ok) throw new Error(valido.mensaje)
  const extension = archivo.name.split('.').pop()
  const path = `${clinicaId}/logo.${extension}`

  const { error: uploadError } = await supabase.storage
    .from('logos-clinicas')
    .upload(path, archivo, { upsert: true })
  if (uploadError) {
    console.error(uploadError)
    throw new Error(mensajeErrorArchivo(uploadError, 'logos-clinicas'))
  }

  const { data: { publicUrl } } = supabase.storage.from('logos-clinicas').getPublicUrl(path)
  // Se agrega un parámetro de caché-bust (?t=timestamp) porque el path
  // es siempre el mismo — sin esto, el navegador podría seguir
  // mostrando el logo viejo desde caché tras reemplazarlo.
  const urlConCacheBust = `${publicUrl}?t=${Date.now()}`

  return actualizarMiClinica(clinicaId, { logo_url: urlConCacheBust })
}
