// Reserva en línea (migración 117): reglas puras compartidas por la página pública, la configuración y la Agenda.
// La base de datos valida TODO otra vez (es la que manda); aquí se valida antes de enviar para que la persona vea un
// texto claro y no un error técnico. Los límites DEBEN coincidir con los de la migración (una prueba lo comprueba).

export const LIMITES_RESERVA = { nombre: 120, correo: 254, telefono: 20, motivo: 500, mensaje: 500, slug: 60, servicio: 80 }

export const DIAS_SEMANA = [
  { valor: 1, corto: 'Lun', largo: 'Lunes' },
  { valor: 2, corto: 'Mar', largo: 'Martes' },
  { valor: 3, corto: 'Mié', largo: 'Miércoles' },
  { valor: 4, corto: 'Jue', largo: 'Jueves' },
  { valor: 5, corto: 'Vie', largo: 'Viernes' },
  { valor: 6, corto: 'Sáb', largo: 'Sábado' },
  { valor: 7, corto: 'Dom', largo: 'Domingo' }
]

export const INTERVALOS_RESERVA = [10, 15, 20, 30, 45, 60]

export const ZONAS_HORARIAS_MX = [
  { valor: 'America/Mexico_City', etiqueta: 'Centro (Ciudad de México, Guadalajara, Monterrey)' },
  { valor: 'America/Cancun', etiqueta: 'Sureste (Quintana Roo)' },
  { valor: 'America/Chihuahua', etiqueta: 'Chihuahua' },
  { valor: 'America/Mazatlan', etiqueta: 'Pacífico (Sinaloa, Nayarit, BCS)' },
  { valor: 'America/Hermosillo', etiqueta: 'Sonora' },
  { valor: 'America/Tijuana', etiqueta: 'Noroeste (Baja California)' }
]

export const CONFIG_RESERVA_INICIAL = {
  activa: false,
  slug: '',
  zona_horaria: 'America/Mexico_City',
  dias_semana: [1, 2, 3, 4, 5],
  hora_apertura: '09:00',
  hora_cierre: '18:00',
  intervalo_min: 30,
  anticipacion_min_horas: 2,
  anticipacion_max_dias: 30,
  mensaje: ''
}

const REGEX_CORREO = /^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/
const REGEX_TELEFONO = /^\+?[0-9 ()-]{10,20}$/
export const REGEX_SLUG = /^[a-z0-9]([a-z0-9-]{1,58}[a-z0-9])$/

// Lo que el paciente escribe en el formulario público → {} si todo está bien, o un texto por campo.
export function validarSolicitudReserva({ nombre = '', correo = '', telefono = '', motivo = '' }) {
  const e = {}
  const n = nombre.trim().replace(/\s+/g, ' ')
  const c = correo.trim().toLowerCase()
  const t = telefono.trim()
  const m = motivo.trim()
  if (n.length < 2 || n.length > LIMITES_RESERVA.nombre || !/\p{L}/u.test(n)) e.nombre = 'Escribe tu nombre completo.'
  else if (/[<>]/.test(n)) e.nombre = 'El nombre no puede llevar los símbolos < >.'
  if (c.length > LIMITES_RESERVA.correo || !REGEX_CORREO.test(c)) e.correo = 'Escribe un correo electrónico válido.'
  const digitos = t.replace(/\D/g, '').length
  if (!REGEX_TELEFONO.test(t) || digitos < 10 || digitos > 15) e.telefono = 'Escribe un teléfono de 10 dígitos o más.'
  if (m.length > LIMITES_RESERVA.motivo) e.motivo = `El motivo no puede tener más de ${LIMITES_RESERVA.motivo} caracteres.`
  else if (/[<>]/.test(m)) e.motivo = 'El motivo no puede llevar los símbolos < >.'
  return e
}

// Propuesta de enlace a partir del nombre de la clínica: «Clínica Dental Sonrisa» → «clinica-dental-sonrisa».
export function sugerirSlug(nombre = '') {
  const base = nombre
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, LIMITES_RESERVA.slug)
    .replace(/-+$/g, '')
  return base.length >= 3 ? base : ''
}

// Configuración del owner → {} si está bien, o un texto por campo.
export function validarConfigReserva(cfg) {
  const e = {}
  const slug = (cfg.slug ?? '').trim().toLowerCase()
  if (!REGEX_SLUG.test(slug) || slug.includes('--')) e.slug = 'Usa de 3 a 60 letras minúsculas, números o guiones (sin guion al inicio ni al final).'
  if (!Array.isArray(cfg.dias_semana) || cfg.dias_semana.length === 0) e.dias_semana = 'Elige al menos un día de atención.'
  if (!cfg.hora_apertura || !cfg.hora_cierre || cfg.hora_cierre <= cfg.hora_apertura) e.horario = 'La hora de cierre debe ser después de la de apertura.'
  if (!INTERVALOS_RESERVA.includes(Number(cfg.intervalo_min))) e.intervalo_min = 'Intervalo no válido.'
  const min = Number(cfg.anticipacion_min_horas)
  if (!Number.isInteger(min) || min < 0 || min > 720) e.anticipacion_min_horas = 'De 0 a 720 horas.'
  const max = Number(cfg.anticipacion_max_dias)
  if (!Number.isInteger(max) || max < 1 || max > 180) e.anticipacion_max_dias = 'De 1 a 180 días.'
  if ((cfg.mensaje ?? '').length > LIMITES_RESERVA.mensaje) e.mensaje = `Máximo ${LIMITES_RESERVA.mensaje} caracteres.`
  return e
}

export function validarServicioReserva({ nombre = '', duracion_min }) {
  const e = {}
  const n = nombre.trim()
  if (n.length < 2 || n.length > LIMITES_RESERVA.servicio) e.nombre = `El nombre debe tener de 2 a ${LIMITES_RESERVA.servicio} caracteres.`
  const d = Number(duracion_min)
  if (!Number.isInteger(d) || d < 10 || d > 240) e.duracion_min = 'La duración debe ser de 10 a 240 minutos.'
  return e
}

const MENSAJES_POR_PISTA = {
  RESERVA_NO_DISPONIBLE: 'Este enlace de reserva no existe o la clínica lo desactivó. Revisa que el enlace que te enviaron esté completo, o comunícate directamente con la clínica.',
  RESERVA_DEMASIADAS: 'Se han recibido demasiadas solicitudes. Inténtalo más tarde o llama a la clínica.',
  RESERVA_HORARIO_OCUPADO: 'Ese horario se acaba de ocupar. Elige otro.',
  RESERVA_HORARIO_INVALIDO: 'Ese horario no se puede reservar. Elige otro.',
  RESERVA_SUCURSAL_REQUERIDA: 'Elige una sucursal.',
  RESERVA_SOLICITUD_NO_ENCONTRADA: 'La solicitud ya no existe.',
  RESERVA_SOLICITUD_RESUELTA: 'Esta solicitud ya fue atendida.',
  RESERVA_SOLICITUD_VENCIDA: 'El horario solicitado ya pasó: recházala o agenda otra cita con el paciente.'
}

// Error de Supabase → texto para la persona. Los de validación traen ya un texto claro del servidor.
export function mensajeErrorReserva(error) {
  if (!error) return ''
  if (error.hint === 'RESERVA_DATOS_INVALIDOS' && error.message) return error.message
  if (error.hint === 'RESERVA_HORARIO_OCUPADO' && error.message) return error.message
  if (MENSAJES_POR_PISTA[error.hint]) return MENSAJES_POR_PISTA[error.hint]
  if (error.code === '23505') return 'Ese enlace ya lo usa otra clínica. Elige otro.'
  if (error.code === '23514') return 'Algún dato no es válido. Revisa el formulario.'
  if (error.code === 'PT402') return error.message
  if (error.code === '42501') return 'No tienes permiso para hacer esto.'
  return 'No se pudo completar. Revisa tu conexión e inténtalo de nuevo.'
}

export function enlacePublicoReserva(slug, origen = typeof window !== 'undefined' ? window.location.origin : '') {
  return `${origen}/reservar/${slug}`
}

// Fecha local «YYYY-MM-DD» → «martes 4 de noviembre» (sin desfases de zona horaria: se arma a mediodía).
export function fechaLegible(isoFecha) {
  if (!isoFecha) return ''
  const [a, m, d] = isoFecha.split('-').map(Number)
  return new Date(a, m - 1, d, 12).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
}

// ¿Este día («YYYY-MM-DD») es de atención? isodow: lunes = 1 … domingo = 7.
export function esDiaDeAtencion(isoFecha, diasSemana = []) {
  if (!isoFecha) return false
  const [a, m, d] = isoFecha.split('-').map(Number)
  const dow = new Date(a, m - 1, d, 12).getDay()
  return diasSemana.includes(dow === 0 ? 7 : dow)
}

// Solicitud pendiente → objeto con la forma de una cita para dibujarla en la cuadrícula de la Agenda.
export function solicitudComoCita(s) {
  return {
    id: `solicitud-${s.id}`,
    esSolicitud: true,
    solicitud: s,
    inicio: s.inicio,
    fin: s.fin,
    estado: 'pendiente_confirmar',
    dentista_id: s.dentista_id,
    sucursal_id: s.sucursal_id,
    motivo_consulta: `En línea · ${s.servicio_nombre}`,
    paciente: { nombre_completo: s.nombre },
    dentista: s.dentista ?? null
  }
}

// Filtra las solicitudes con los mismos filtros de la Agenda (rango, dentista, estado, sucursal).
export function solicitudesVisiblesEnAgenda(solicitudes, { desde, hasta, dentistaId, estado, sucursalId }) {
  if (estado && estado !== 'pendiente_confirmar') return []
  return solicitudes.filter((s) =>
    (!desde || s.inicio >= desde) && (!hasta || s.inicio <= hasta)
    && (!dentistaId || s.dentista_id === dentistaId)
    && (!sucursalId || s.sucursal_id === sucursalId))
}
