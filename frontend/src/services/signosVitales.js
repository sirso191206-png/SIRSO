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

export async function agregarSignosVitales(registro) {
  const { data, error } = await supabase
    .from('signos_vitales')
    .insert(registro)
    .select()
    .single()
  if (error) throw error
  return data
}
