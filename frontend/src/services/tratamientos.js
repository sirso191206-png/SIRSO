import { supabase } from '../lib/supabase'
import { conCacheDeLectura } from '../lib/cacheLectura'

export async function obtenerTratamientos(pacienteId) {
  const { datos } = await conCacheDeLectura(`tratamientos:${pacienteId}`, async () => {
    const { data, error } = await supabase
      .from('tratamientos')
      .select('*, dentista:usuarios!tratamientos_dentista_id_fkey(nombre)')
      .eq('paciente_id', pacienteId)
      .order('creado_en', { ascending: false })
    if (error) throw error
    return data
  })
  return datos
}

// upsert (no insert) a propósito: si se llama sin conexión (ver
// hooks/useTratamientos.js), `tratamiento.id` ya viene fijado desde el
// navegador — así, si la subida se reintenta, nunca crea un tratamiento
// duplicado. Llamado online (sin id) se comporta como un insert normal.
export async function crearTratamiento(tratamiento) {
  const { data, error } = await supabase
    .from('tratamientos')
    .upsert(tratamiento)
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

// Solo la usa el ejecutor de la cola (ver lib/procesadorColaOffline.js)
// para sumar una sesión SIN CONEXIÓN: a diferencia de las demás
// operaciones encoladas, esta NO puede mandar el valor final ya
// calculado — `sesiones_completadas + 1` capturado en el momento del
// click podría quedar desactualizado para cuando la operación por fin
// se suba (pudo agregarse otra sesión mientras tanto). Por eso vuelve
// a leer el tratamiento justo antes de sumar, en vez de confiar en una
// instantánea vieja — así, dos sesiones registradas offline antes de
// reconectar cuentan como dos, no como una, y ninguna retrocede un
// avance que ya haya llegado al servidor por otro lado.
export async function registrarSesionEnServidor(tratamientoId) {
  const { data: actual, error } = await supabase
    .from('tratamientos')
    .select('id, sesiones_completadas, numero_sesiones')
    .eq('id', tratamientoId)
    .single()
  if (error) throw error
  return registrarSesion(actual)
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
