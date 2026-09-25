import { supabase } from '../lib/supabase'

export async function obtenerTratamientos(pacienteId) {
  const { data, error } = await supabase
    .from('tratamientos')
    .select('*, dentista:usuarios!tratamientos_dentista_id_fkey(nombre)')
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

// Cancelar deja el registro (nunca se borra) — solo cambia su estado y
// deja constancia de quién y por qué. El costo de un tratamiento
// cancelado ya no cuenta en el saldo del paciente (v_saldo_pacientes
// lo excluye desde siempre).
export async function cancelarTratamiento(id, { usuarioId, motivo }) {
  const { data, error } = await supabase
    .from('tratamientos')
    .update({ estado: 'cancelado', motivo_cancelacion: motivo || null, cancelado_por: usuarioId })
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
