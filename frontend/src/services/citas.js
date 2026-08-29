import { supabase } from '../lib/supabase'

export async function obtenerCitaPorId(id) {
  const { data, error } = await supabase
    .from('citas')
    .select('*, paciente:pacientes(nombre_completo, telefono, numero_expediente), dentista:usuarios(nombre)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function obtenerCitasRango({ dentistaId, estado, desde, hasta, sucursalId }) {
  let query = supabase
    .from('citas')
    .select('*, paciente:pacientes(nombre_completo, telefono), dentista:usuarios(nombre)')
    .gte('inicio', desde)
    .lte('inicio', hasta)
    .order('inicio')

  if (dentistaId) {
    query = query.eq('dentista_id', dentistaId)
  }
  if (estado) {
    query = query.eq('estado', estado)
  }
  // sucursalId es opcional a propósito — si es null/undefined (clínica
  // sin multi-sucursal, o "Todas las sucursales" seleccionado), no se
  // agrega ningún filtro y el comportamiento es exactamente el de antes.
  if (sucursalId) {
    query = query.eq('sucursal_id', sucursalId)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

function mensajeError(error) {
  if (error.code === '23P01') return 'Ese horario ya está ocupado para este dentista.'
  if (error.message?.includes('horario está bloqueado')) return error.message
  return error.message
}

// Antes vivía como una consulta inline dentro de PacienteDetalle.jsx
// (handleIniciarConsulta). Busca, de las citas de HOY para este
// paciente, la primera en un estado desde el que se puede iniciar
// consulta (pendiente_confirmar/agendada/confirmada/en_espera).
const ESTADOS_INICIABLES = ['pendiente_confirmar', 'agendada', 'confirmada', 'en_espera']

export async function buscarCitaIniciableHoy(pacienteId) {
  const inicioHoy = new Date(); inicioHoy.setHours(0, 0, 0, 0)
  const finHoy = new Date(inicioHoy); finHoy.setDate(finHoy.getDate() + 1)
  const { data: citasHoy, error } = await supabase
    .from('citas')
    .select('id, estado')
    .eq('paciente_id', pacienteId)
    .gte('inicio', inicioHoy.toISOString())
    .lt('inicio', finHoy.toISOString())
    .order('inicio')
  if (error) throw error

  return citasHoy.find((c) => ESTADOS_INICIABLES.includes(c.estado)) ?? null
}

// Cola de espera: todo lo que hoy sigue "vivo" (sin contar lo ya
// finalizado/cancelado), ordenado para que urgencias y prioridad alta
// salten al frente sin perder el orden de llegada dentro de cada grupo.
export async function obtenerColaDeEspera({ dentistaId } = {}) {
  let query = supabase
    .from('citas')
    .select('*, paciente:pacientes(nombre_completo, telefono), dentista:usuarios(nombre)')
    .not('estado', 'in', '(completada,cancelada,no_asistio)')
    .gte('inicio', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
    .lt('inicio', new Date(new Date().setHours(24, 0, 0, 0)).toISOString())
    .order('numero_turno', { ascending: true })
  if (dentistaId) query = query.eq('dentista_id', dentistaId)

  const { data, error } = await query
  if (error) throw error

  const pesoPrioridad = { urgente: 0, alta: 1, normal: 2 }
  return data.sort((a, b) => (pesoPrioridad[a.prioridad] ?? 2) - (pesoPrioridad[b.prioridad] ?? 2))
}

export async function crearCitaUrgencia({ pacienteId, dentistaId, motivo, prioridad, duracionMinutos = 30 }) {
  const inicio = new Date()
  const fin = new Date(inicio.getTime() + duracionMinutos * 60000)

  return crearCita({
    paciente_id: pacienteId,
    dentista_id: dentistaId ?? null,
    inicio: inicio.toISOString(),
    fin: fin.toISOString(),
    motivo_consulta: motivo || 'Urgencia',
    estado: 'en_espera',
    es_urgencia: true,
    prioridad: prioridad || 'urgente'
  })
}
export async function crearCita(cita) {
  const { data, error } = await supabase
    .from('citas')
    .insert(cita)
    .select()
    .single()

  if (error) throw new Error(mensajeError(error))
  return data
}

export async function actualizarCita(id, cambios) {
  const { data, error } = await supabase
    .from('citas')
    .update(cambios)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(mensajeError(error))
  return data
}

export async function eliminarCita(id) {
  const { error } = await supabase.from('citas').delete().eq('id', id)
  if (error) throw error
}
