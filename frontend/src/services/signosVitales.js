import { supabase } from '../lib/supabase'
import { conCacheDeLectura } from '../lib/cacheLectura'

export async function obtenerSignosVitales(pacienteId) {
  const { datos } = await conCacheDeLectura(`signos_vitales:${pacienteId}`, async () => {
    const { data, error } = await supabase
      .from('signos_vitales')
      .select('*, usuario:usuarios(nombre)')
      .eq('paciente_id', pacienteId)
      .order('creado_en', { ascending: false })
    if (error) throw error
    return data
  })
  return datos
}

// upsert (no insert) a propósito, mismo motivo que tratamientos y
// citas: si se llama sin conexión (ver hooks/useSignosVitales.js),
// `registro.id` ya viene fijado desde el navegador — reintentar la
// subida nunca duplica. Llamado online (sin id) se comporta como un
// insert normal.
export async function agregarSignosVitales(registro) {
  const { data, error } = await supabase
    .from('signos_vitales')
    .upsert(registro)
    .select()
    .single()
  if (error) throw error
  return data
}
