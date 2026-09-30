import { supabase } from '../lib/supabase'
import { conCacheDeLectura } from '../lib/cacheLectura'
import { encolarOperacion } from '../lib/colaOffline'
import { esIdOffline } from '../lib/mapeoIdsOffline'
import { verificarConexionReal } from '../lib/conectividadReal'

export async function obtenerCitaPorId(id) {
  const { datos } = await conCacheDeLectura(`cita:${id}`, async () => {
    const { data, error } = await supabase
      .from('citas')
      .select('*, paciente:pacientes(nombre_completo, telefono, numero_expediente), dentista:usuarios(nombre)')
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  })
  return datos
}

// Devuelve { datos, deCache, guardadoEn }: la Agenda necesita saber si lo
// que muestra viene de la última lectura guardada (sin conexión) para
// avisarlo. La clave incluye TODOS los filtros: un rango/dentista/sucursal
// distinto es otra lectura y nunca debe servirse en lugar de ésta.
export async function obtenerCitasRangoConEstado({ dentistaId, estado, desde, hasta, sucursalId }) {
  const clave = `citas-rango:${JSON.stringify({ dentistaId: dentistaId ?? null, estado: estado ?? null, desde, hasta, sucursalId: sucursalId ?? null })}`
  return conCacheDeLectura(clave, () => _obtenerCitasRangoReal({ dentistaId, estado, desde, hasta, sucursalId }))
}

export async function obtenerCitasRango(filtros) {
  const { datos } = await obtenerCitasRangoConEstado(filtros)
  return datos
}

async function _obtenerCitasRangoReal({ dentistaId, estado, desde, hasta, sucursalId }) {
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

// Consciente de conectividad y de pacientes offline, igual que
// crearPaciente() en services/pacientes.js: un walk-in de urgencia es
// exactamente el escenario que más importa cubrir bien sin conexión
// (llega alguien sin avisar, puede ser un paciente que se acaba de
// crear en este mismo formulario, todavía sin subir).
export async function crearCitaUrgencia({ pacienteId, dentistaId, motivo, prioridad, duracionMinutos = 30, usuarioId, clinicaId, sucursalId } = {}) {
  const inicio = new Date()
  const fin = new Date(inicio.getTime() + duracionMinutos * 60000)
  const cita = {
    paciente_id: pacienteId,
    dentista_id: dentistaId ?? null,
    inicio: inicio.toISOString(),
    fin: fin.toISOString(),
    motivo_consulta: motivo || 'Urgencia',
    estado: 'en_espera',
    es_urgencia: true,
    prioridad: prioridad || 'urgente'
  }

  const pacienteEsOffline = esIdOffline(pacienteId)
  const conexionReal = pacienteEsOffline ? false : await verificarConexionReal(supabase)
  if (!conexionReal) {
    // Id generado en el navegador, upsert-safe (crearCita ya usa
    // upsert) — reintentar la subida nunca duplica. Si el paciente
    // también es offline, esta cita depende de que él se sincronice
    // primero (lib/procesadorColaOffline.js resuelve paciente_id).
    const id = crypto.randomUUID()
    const citaCompleta = { ...cita, id }
    await encolarOperacion({
      id,
      tipo: 'crear_cita',
      entidad: 'citas',
      entidadId: id,
      payload: citaCompleta,
      dependeDe: pacienteEsOffline ? [pacienteId] : [],
      creado_en: Date.now(),
      usuarioId: usuarioId ?? null,
      clinicaId: clinicaId ?? null,
      sucursalId: sucursalId ?? null,
      claveIdempotencia: id
    })
    return { ...citaCompleta, _offline: true }
  }

  return crearCita(cita)
}
// Si cita.id viene definido (lo genera el navegador con
// crypto.randomUUID() para las citas de seguimiento creadas sin
// conexión), se usa upsert en vez de insert — reintentar la subida
// después de un fallo parcial nunca duplica la cita.
export async function crearCita(cita) {
  const { data, error } = await supabase
    .from('citas')
    .upsert(cita)
    .select()
    .single()

  if (error) throw new Error(mensajeError(error))
  return data
}

// actualizado_en la mantiene un trigger (migración 073), no el
// frontend. Si se pasa actualizadoEnEsperado, se agrega como condición
// extra del UPDATE — si alguien más ya modificó esta cita desde que se
// abrió la consulta, la condición no encuentra ninguna fila, y
// .single() lanza PGRST116. Ese código se revisa ANTES de pasar por
// mensajeError() — envolver el error ahí abajo pierde `.code`, así que
// la detección de conflicto tiene que pasar primero.
export async function actualizarCita(id, cambios, actualizadoEnEsperado) {
  let query = supabase.from('citas').update(cambios).eq('id', id)
  if (actualizadoEnEsperado) {
    query = query.eq('actualizado_en', actualizadoEnEsperado)
  }
  const { data, error } = await query.select().single()

  if (error) {
    if (error.code === 'PGRST116' && actualizadoEnEsperado) {
      throw new Error('CONFLICTO_CONCURRENCIA')
    }
    throw new Error(mensajeError(error))
  }
  return data
}

export async function eliminarCita(id) {
  const { error } = await supabase.from('citas').delete().eq('id', id)
  if (error) throw error
}
