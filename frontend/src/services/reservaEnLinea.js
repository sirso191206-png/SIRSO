import { supabase } from '../lib/supabase'
import { mensajeErrorReserva } from '../lib/reservaEnLinea'

// Reserva en línea (migración 117). El enlace público solo usa las tres funciones `reserva_*` (anon): nunca lee
// tablas. El personal lee sus solicitudes con RLS y las confirma o rechaza con funciones del servidor.

function errorLegible(error) {
  const e = new Error(mensajeErrorReserva(error))
  e.hint = error?.hint
  e.code = error?.code
  return e
}

// ---------- Página pública ----------
export async function obtenerReservaPublica(slug) {
  const { data, error } = await supabase.rpc('reserva_publica_info', { p_slug: slug })
  if (error) throw errorLegible(error)
  return data
}

export async function obtenerHorariosLibres({ slug, servicioId, fecha, sucursalId }) {
  const { data, error } = await supabase.rpc('reserva_horarios_libres', {
    p_slug: slug, p_servicio: servicioId, p_fecha: fecha, p_sucursal: sucursalId || null
  })
  if (error) throw errorLegible(error)
  return data ?? []
}

// `sitioWeb` es el campo trampa: una persona nunca lo llena.
export async function solicitarCitaEnLinea({ slug, servicioId, inicio, nombre, correo, telefono, motivo, sucursalId, sitioWeb }) {
  const { data, error } = await supabase.rpc('reserva_solicitar_cita', {
    p_slug: slug,
    p_servicio: servicioId,
    p_inicio: inicio,
    p_nombre: nombre.trim(),
    p_correo: correo.trim().toLowerCase(),
    p_telefono: telefono.trim(),
    p_motivo: motivo?.trim() || null,
    p_sucursal: sucursalId || null,
    p_sitio_web: sitioWeb || null
  })
  if (error) throw errorLegible(error)
  return data
}

// ---------- Configuración (owner) ----------
export async function obtenerConfigReserva() {
  const { data, error } = await supabase.from('reserva_config').select('*').maybeSingle()
  if (error) throw errorLegible(error)
  return data
}

export async function guardarConfigReserva(clinicaId, cfg) {
  const fila = {
    clinica_id: clinicaId,
    activa: !!cfg.activa,
    slug: cfg.slug.trim().toLowerCase(),
    zona_horaria: cfg.zona_horaria,
    dias_semana: [...cfg.dias_semana].sort((a, b) => a - b),
    hora_apertura: cfg.hora_apertura,
    hora_cierre: cfg.hora_cierre,
    intervalo_min: Number(cfg.intervalo_min),
    anticipacion_min_horas: Number(cfg.anticipacion_min_horas),
    anticipacion_max_dias: Number(cfg.anticipacion_max_dias),
    mensaje: cfg.mensaje?.trim() || null
  }
  const { data, error } = await supabase.from('reserva_config').upsert(fila, { onConflict: 'clinica_id' }).select().single()
  if (error) throw errorLegible(error)
  return data
}

export async function listarServiciosReserva() {
  const { data, error } = await supabase.from('reserva_servicios').select('*').order('orden').order('nombre')
  if (error) throw errorLegible(error)
  return data ?? []
}

export async function crearServicioReserva({ nombre, duracion_min }) {
  const { data, error } = await supabase.from('reserva_servicios')
    .insert({ nombre: nombre.trim(), duracion_min: Number(duracion_min) }).select().single()
  if (error) throw errorLegible(error)
  return data
}

export async function actualizarServicioReserva(id, cambios) {
  const { error } = await supabase.from('reserva_servicios').update(cambios).eq('id', id)
  if (error) throw errorLegible(error)
}

export async function eliminarServicioReserva(id) {
  const { error } = await supabase.from('reserva_servicios').delete().eq('id', id)
  if (error) throw errorLegible(error)
}

// ---------- Agenda (personal) ----------
export async function listarSolicitudesPendientes() {
  const { data, error } = await supabase
    .from('solicitudes_cita')
    .select('id, servicio_nombre, inicio, fin, nombre, correo, telefono, motivo, estado, dentista_id, sucursal_id, creado_en, dentista:usuarios!solicitudes_cita_dentista_id_fkey(nombre)')
    .eq('estado', 'pendiente_confirmar')
    .gte('fin', new Date().toISOString())
    .order('inicio')
    .limit(200)
  if (error) throw errorLegible(error)
  return data ?? []
}

// Devuelve el id de la cita creada. Sin `pacienteId` se crea un paciente nuevo con los datos de la solicitud.
export async function confirmarSolicitudCita(solicitudId, pacienteId = null) {
  const { data, error } = await supabase.rpc('reserva_confirmar_solicitud', { p_solicitud: solicitudId, p_paciente: pacienteId })
  if (error) throw errorLegible(error)
  return data
}

export async function rechazarSolicitudCita(solicitudId, motivo = '') {
  const { error } = await supabase.rpc('reserva_rechazar_solicitud', { p_solicitud: solicitudId, p_motivo: motivo?.trim() || null })
  if (error) throw errorLegible(error)
}
