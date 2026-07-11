import { supabase } from '../lib/supabase'

export async function obtenerTratamientos(pacienteId) {
  const { data, error } = await supabase
    .from('tratamientos')
    .select('*, dentista:usuarios(nombre)')
    .eq('paciente_id', pacienteId)
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data
}

export async function crearTratamiento(tratamiento) {
  const { data, error } = await supabase
    .from('tratamientos')
    .insert(tratamiento)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function cambiarEstadoTratamiento(id, estado) {
  const cambios = { estado }
  if (estado === 'completado') {
    cambios.completado_en = new Date().toISOString()
  }
  const { data, error } = await supabase
    .from('tratamientos')
    .update(cambios)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function actualizarTratamiento(id, cambios) {
  const { data, error } = await supabase
    .from('tratamientos')
    .update(cambios)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Suma una sesión completada; si llega al total de sesiones, marca el
// tratamiento como completado automáticamente.
export async function registrarSesion(tratamiento) {
  const nuevasSesiones = Math.min(tratamiento.sesiones_completadas + 1, tratamiento.numero_sesiones)
  const cambios = { sesiones_completadas: nuevasSesiones }
  if (nuevasSesiones >= tratamiento.numero_sesiones) {
    cambios.estado = 'completado'
    cambios.completado_en = new Date().toISOString()
  }
  const { data, error } = await supabase
    .from('tratamientos')
    .update(cambios)
    .eq('id', tratamiento.id)
    .select()
    .single()
  if (error) throw error
  return data
}
