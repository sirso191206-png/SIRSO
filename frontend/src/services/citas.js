import { supabase } from '../lib/supabase'
import { conCacheDeLectura } from '../lib/cacheLectura'
import { encolarOperacion } from '../lib/colaOffline'
import { esIdOffline } from '../lib/mapeoIdsOffline'
import { verificarConexionReal } from '../lib/conectividadReal'
import { buscarEnReplicaCitas, huboSincronizacionCompleta } from '../lib/citasReplica'
import { ventanaDeAgenda } from '../lib/clinicDataSync'
import { clasificarErrorDeDatos } from '../lib/erroresDatos'
import { haySesionVigente } from './sesionVigente'

// `.single()` se conserva a propósito: una cita por id debe ser EXACTAMENTE una. El caso "0 filas" (PGRST116 / 406) no se esconde
// ni se convierte en null: se clasifica y se explica (ver lib/erroresDatos.js — inexistente, sin acceso por RLS y sesión perdida
// responden IGUAL, así que se consulta si el cliente conserva sesión). La caché de lectura solo cubre la falta de CONEXIÓN: ante una
// respuesta definitiva del servidor no se abre una copia vieja (el usuario podría seguir editando algo a lo que ya no tiene acceso).
export async function obtenerCitaPorId(id) {
  const { datos } = await conCacheDeLectura(`cita:${id}`, async () => {
    const { data, error } = await supabase
      .from('citas')
      .select('*, paciente:pacientes(id, nombre_completo, telefono, numero_expediente, fecha_nacimiento, sexo), dentista:usuarios(nombre)')
      .eq('id', id)
      .single()
    if (error) throw clasificarErrorDeDatos(error, { haySesion: await haySesionVigente(), entidad: 'la cita' })
    return data
  }, { usarCacheSi: (err) => err.codigo === 'SIN_CONEXION' || err.codigo === 'SERVIDOR_NO_DISPONIBLE' })
  return datos
}

// Devuelve { datos, deCache, guardadoEn }: la Agenda necesita saber si lo
// que muestra viene de la última lectura guardada (sin conexión) para
// avisarlo. La clave incluye TODOS los filtros: un rango/dentista/sucursal
// distinto es otra lectura y nunca debe servirse en lugar de ésta.
export async function obtenerCitasRangoConEstado({ dentistaId, estado, desde, hasta, sucursalId }) {
  const clave = `citas-rango:${JSON.stringify({ dentistaId: dentistaId ?? null, estado: estado ?? null, desde, hasta, sucursalId: sucursalId ?? null })}`
  try {
    return await conCacheDeLectura(clave, () => _obtenerCitasRangoReal({ dentistaId, estado, desde, hasta, sucursalId }))
  } catch (err) {
    // Sin red y esta combinación EXACTA de filtros nunca se pidió
    // antes: si el rango cae dentro de la ventana que ya replica
    // useSincronizacionClinica (lib/clinicDataSync.js — pasado
    // reciente + próximos días, ver GUIA_OFFLINE.md), se filtra ahí en
    // vez de exigir haber consultado ese rango/dentista/estado exacto
    // con anterioridad.
    // Un array vacío de la réplica solo es confiable si de verdad ya
    // se sincronizó esa ventana Y el rango pedido cae dentro de ella —
    // si no, sería imposible distinguir "día sin citas" de "esta
    // ventana nunca se sincronizó", y lo segundo NO debe mostrarse
    // como lo primero.
    const ventana = ventanaDeAgenda()
    const dentroDeLaVentana = desde >= ventana.desde && hasta <= ventana.hasta
    const yaSincronizada = dentroDeLaVentana && (await huboSincronizacionCompleta())
    if (!yaSincronizada) throw err
    const datos = await buscarEnReplicaCitas({ desde, hasta, dentistaId, estado, sucursalId })
    return { datos, deCache: true, guardadoEn: null }
  }
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
// Al terminar una consulta, el siguiente paciente EN ESPERA pasa a consulta (comodidad que antes vivía en el botón de Mi día). Es ADMINISTRATIVO: no completa nada
// ni genera notas, y es de MEJOR ESFUERZO (quien llama ignora un fallo). NO avanza a nadie si pudiera asignarlo al odontólogo, la sucursal o el sillón equivocados:
//  · solo pacientes de ESE odontólogo (una urgencia sin odontólogo asignado nunca se avanza sola);
//  · solo de la MISMA sucursal que la consulta que termina;
//  · si el paciente en espera tiene SILLÓN asignado, solo si es el mismo sillón de la consulta que termina (sin sillón asignado, no hay conflicto);
//  · si el odontólogo ya tiene a otra persona EN CONSULTA hoy, no se abre una segunda;
//  · el cambio es CONDICIONAL (`estado = 'en_espera'`): si recepción canceló o movió a ese paciente mientras tanto, no se toca (antes se le «resucitaba»).
// La fila NO se reordena: se avanza al primero que le corresponde por hora; los que no corresponden se dejan como están.
export async function avanzarSiguienteEnEspera({ dentistaId, excluirCitaId, sucursalId = null, sillonId = null }) {
  if (!dentistaId) return null
  const hoy = new Date()
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const fin = new Date(inicio.getTime() + 86400000)
  const deHoy = (q) => q.eq('dentista_id', dentistaId).neq('id', excluirCitaId).gte('inicio', inicio.toISOString()).lt('inicio', fin.toISOString())

  const { data: yaEnConsulta, error: errorConsulta } = await deHoy(supabase.from('citas').select('id').eq('estado', 'en_consulta')).limit(1)
  if (errorConsulta) throw errorConsulta
  if (yaEnConsulta?.length) return null

  const { data, error } = await deHoy(supabase.from('citas').select('id, sucursal_id, sillon_id').eq('estado', 'en_espera')).order('inicio', { ascending: true }).limit(20)
  if (error) throw error
  const siguiente = (data ?? []).find((c) => (c.sucursal_id ?? null) === (sucursalId ?? null) && (c.sillon_id == null || (sillonId != null && c.sillon_id === sillonId)))
  if (!siguiente) return null

  const { data: movidas, error: errorMover } = await supabase.from('citas').update({ estado: 'en_consulta' }).eq('id', siguiente.id).eq('estado', 'en_espera').select('id')
  if (errorMover) throw errorMover
  return movidas?.length ? siguiente.id : null
}

export async function actualizarCita(id, cambios, actualizadoEnEsperado) {
  let query = supabase.from('citas').update(cambios).eq('id', id)
  if (actualizadoEnEsperado) {
    query = query.eq('actualizado_en', actualizadoEnEsperado)
  }
  const { data, error } = await query.select().single()

  if (error) {
    if (error.code === 'PGRST116' && actualizadoEnEsperado) {
      // Sin sesión, "0 filas" no es que alguien más cambió la cita: es que no hay sesión. Llamarlo conflicto haría que la cola offline
      // DESCARTARA la operación en vez de reintentarla al volver a iniciar sesión.
      if (!(await haySesionVigente())) throw clasificarErrorDeDatos(error, { haySesion: false, entidad: 'la cita', accion: 'actualizar' })
      throw new Error('CONFLICTO_CONCURRENCIA')
    }
    // Cero filas / sesión / permisos / red: se explican con su causa. Lo demás conserva el mensaje de siempre.
    const tipado = clasificarErrorDeDatos(error, { haySesion: await haySesionVigente(), entidad: 'la cita', accion: 'actualizar' })
    if (tipado.codigo !== 'DESCONOCIDO') throw tipado
    throw new Error(mensajeError(error))
  }
  return data
}

export async function eliminarCita(id) {
  const { error } = await supabase.from('citas').delete().eq('id', id)
  if (error) throw error
}

// Rechazos de NEGOCIO de fn_corregir_estado_cita (migración 094): su mensaje es nuestro, claro y seguro de mostrar.
export const CODIGOS_CORRECCION = ['SESION_INVALIDA', 'SESION_CERRADA', 'ROL_NO_PERMITIDO', 'ESTADO_NO_PERMITIDO', 'MOTIVO_REQUERIDO', 'CITA_NO_ENCONTRADA', 'SUCURSAL_NO_PERMITIDA', 'CITA_NO_COMPLETADA', 'CITA_DE_OTRO_DENTISTA', 'ESTADO_NO_PERMITIDO_PARA_ROL']

// Corrige una cita YA COMPLETADA (reabrir, cancelar o marcar inasistencia) con un MOTIVO; la base de datos decide por rol y deja la auditoría completa.
// Requiere conexión: es una corrección de historial, no se encola a ciegas. Un doble clic no duplica nada (la segunda llamada responde CITA_NO_COMPLETADA).
export async function corregirEstadoCita({ citaId, estado, motivo }) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw Object.assign(new Error('Corregir una consulta ya completada requiere conexión: es un cambio de historial y se registra en el servidor.'), { codigo: 'SIN_CONEXION' })
  }
  const { data, error } = await supabase.rpc('fn_corregir_estado_cita', { p_cita: citaId, p_estado: estado, p_motivo: motivo })
  if (error) {
    if (error.hint && CODIGOS_CORRECCION.includes(error.hint)) throw Object.assign(new Error(error.message), { codigo: error.hint, original: error })
    throw clasificarErrorDeDatos(error, { haySesion: await haySesionVigente(), entidad: 'la cita', accion: 'corregir' })
  }
  return data
}
