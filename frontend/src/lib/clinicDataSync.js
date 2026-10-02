// Motor central de sincronización de la clínica completa — a
// diferencia de sincronizarMiDia() (que precarga solo el día de hoy,
// ver lib/sincronizacionDia.js), esto busca que la LISTA DE PACIENTES
// de toda la clínica esté disponible offline, no solo quien tiene
// cita hoy o ya se abrió antes.
//
// ESTADO HONESTO DE ESTA ENTREGA: solo `syncPacientes()` está
// implementado de verdad. syncAgenda/syncExpedientes/syncTratamientos/
// etc. — replicar el EXPEDIENTE COMPLETO (notas, odontograma,
// periodontograma, tratamientos, recetas) de TODA la clínica, no solo
// de quien se abrió — es un sistema de sincronización incremental por
// entidad, cada una con su propia forma y volumen de datos, y no se
// construyó aquí: seguir cacheando eso por paciente, cuando se abre
// (lib/cacheLectura.js), sigue siendo el mecanismo real. No se
// declaran funciones vacías para esas — sería fingir un trabajo que
// no está hecho.
import { supabase } from './supabase'
import { verificarConexionReal } from './conectividadReal'
import { guardarPacientesEnReplica, leerCursorReplica, guardarCursorReplica } from './pacientesReplica'
import { guardarCitasEnReplica, marcarSincronizacionCompleta } from './citasReplica'
import { guardarExpedientesEnReplica, leerCursorExpedientes, guardarCursorExpedientes } from './expedientesReplica'

// Por corrida: suficiente para que una clínica con cientos de
// pacientes modificados desde la última sincronización quede al día
// en una sola pasada. Si hubiera más (prácticamente solo pasaría en
// la primerísima sincronización de una clínica ya grande, con miles
// de pacientes nunca antes replicados en este equipo), el resto se
// completa en la siguiente corrida automática — no se pagina dentro
// de la misma llamada, para no correr el riesgo de un ciclo mal
// acotado sobre un cursor no estrictamente único (ver límite en
// GUIA_OFFLINE.md).
const TAMANO_LOTE = 2000

export async function syncPacientes() {
  const cursorAnterior = await leerCursorReplica()
  let query = supabase
    .from('v_pacientes_seguro')
    .select('*')
    .order('actualizado_en', { ascending: true })
    .limit(TAMANO_LOTE)
  if (cursorAnterior) query = query.gt('actualizado_en', cursorAnterior)

  const { data, error } = await query
  if (error) throw error
  if (data.length === 0) return { pacientes: 0, cursor: cursorAnterior }

  await guardarPacientesEnReplica(data)
  const cursorNuevo = data[data.length - 1].actualizado_en
  await guardarCursorReplica(cursorNuevo)
  return { pacientes: data.length, cursor: cursorNuevo }
}

// Ventana de agenda que se mantiene replicada — pasado reciente +
// próximos días, no "todo el historial" ni "solo hoy".
//
// A propósito NO usa un cursor incremental por `actualizado_en` como
// syncPacientes(): para pacientes eso es correcto porque CUALQUIER
// paciente está siempre "dentro del alcance". Para la agenda no — una
// cita agendada para dentro de 35 días no se vuelve a tocar hasta que
// alguien la modifica, pero el día en que por fin entra a la ventana
// de 30 días (porque "hoy" avanzó, no porque la cita cambió), un
// cursor por `actualizado_en` la habría descartado para siempre: su
// marca de tiempo ya habría quedado detrás del cursor mucho antes. En
// vez de eso, cada corrida vuelve a traer la ventana COMPLETA (acotada
// y pequeña — citas de una clínica en 37 días, no toda la agenda
// histórica), que es correcto por construcción y evita esa clase de
// error por completo. El "costo" de no ser incremental aquí es
// aceptable porque la ventana en sí ya es chica.
const DIAS_ATRAS = 7
const DIAS_ADELANTE = 30

export function ventanaDeAgenda(ahora = new Date()) {
  const desde = new Date(ahora); desde.setDate(desde.getDate() - DIAS_ATRAS); desde.setHours(0, 0, 0, 0)
  const hasta = new Date(ahora); hasta.setDate(hasta.getDate() + DIAS_ADELANTE); hasta.setHours(23, 59, 59, 999)
  return { desde: desde.toISOString(), hasta: hasta.toISOString() }
}

export async function syncAgenda() {
  const { desde, hasta } = ventanaDeAgenda()
  const { data, error } = await supabase
    .from('citas')
    .select('*, paciente:pacientes(nombre_completo, telefono), dentista:usuarios(nombre)')
    .gte('inicio', desde)
    .lte('inicio', hasta)
    .limit(TAMANO_LOTE)
  if (error) throw error
  await guardarCitasEnReplica(data)
  await marcarSincronizacionCompleta()
  return { citas: data.length }
}

// Expediente LIGERO (alergias, enfermedades, medicamentos,
// antecedentes familiares) de toda la clínica — mismo patrón de
// cursor que syncPacientes() (correcto aquí: un expediente siempre
// está "dentro del alcance", sin el problema de ventana relativa al
// tiempo que tiene syncAgenda). A propósito NO trae notas clínicas,
// odontograma, periodontograma, tratamientos ni recetas — ver el
// comentario al inicio de lib/expedientesReplica.js.
export async function syncExpedientes() {
  const cursorAnterior = await leerCursorExpedientes()
  let query = supabase
    .from('expedientes')
    .select('paciente_id, alergias, enfermedades, medicamentos_actuales, antecedentes_familiares, actualizado_en')
    .order('actualizado_en', { ascending: true })
    .limit(TAMANO_LOTE)
  if (cursorAnterior) query = query.gt('actualizado_en', cursorAnterior)

  const { data, error } = await query
  if (error) throw error
  if (data.length === 0) return { expedientes: 0, cursor: cursorAnterior }

  await guardarExpedientesEnReplica(data)
  const cursorNuevo = data[data.length - 1].actualizado_en
  await guardarCursorExpedientes(cursorNuevo)
  return { expedientes: data.length, cursor: cursorNuevo }
}

let sincronizando = false

// Lock simple: nunca dos corridas de ClinicDataSync a la vez — evita
// carreras escribiendo el cursor si, por ejemplo, se dispara una vez
// al abrir SIRO y otra vez casi junto al recuperar la conexión.
export async function syncClinica() {
  if (sincronizando) return null
  sincronizando = true
  try {
    const conexionReal = await verificarConexionReal(supabase)
    if (!conexionReal) return null
    const pacientes = await syncPacientes()
    const agenda = await syncAgenda()
    const expedientes = await syncExpedientes()
    return { pacientes, agenda, expedientes }
  } finally {
    sincronizando = false
  }
}
