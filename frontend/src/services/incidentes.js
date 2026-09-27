import { supabase } from '../lib/supabase'

const ESTADOS_INCIDENTE = ['detectado', 'en_investigacion', 'contenido', 'resuelto', 'cerrado']
const SEVERIDADES_INCIDENTE = ['baja', 'media', 'alta', 'critica']

export { ESTADOS_INCIDENTE, SEVERIDADES_INCIDENTE }

// Límite de seguridad, no paginación completa todavía — mismo criterio
// que arco.js: es una bitácora que nunca se borra, y un super_admin
// puede estar viendo la de TODAS las clínicas a la vez.
export async function listarIncidentes() {
  const { data, error } = await supabase
    .from('incidentes_seguridad')
    .select('*, detector:usuarios!incidentes_seguridad_detectado_por_fkey(nombre), clinica:clinicas(nombre)')
    .order('fecha', { ascending: false })
    .limit(200)
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
