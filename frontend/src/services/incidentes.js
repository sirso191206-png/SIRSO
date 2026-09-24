import { supabase } from '../lib/supabase'

const ESTADOS_INCIDENTE = ['detectado', 'en_investigacion', 'contenido', 'resuelto', 'cerrado']
const SEVERIDADES_INCIDENTE = ['baja', 'media', 'alta', 'critica']

export { ESTADOS_INCIDENTE, SEVERIDADES_INCIDENTE }

export async function listarIncidentes() {
  const { data, error } = await supabase
    .from('incidentes_seguridad')
    .select('*, detector:usuarios!incidentes_seguridad_detectado_por_fkey(nombre)')
    .order('fecha', { ascending: false })
  if (error) throw error
  return data
}

export async function crearIncidente(incidente) {
  const { data, error } = await supabase
    .from('incidentes_seguridad')
    .insert(incidente)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function actualizarIncidente(id, cambios) {
  const { data, error } = await supabase
    .from('incidentes_seguridad')
    .update(cambios)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
