import { supabase } from '../lib/supabase'
import { sanitizarTerminoBusqueda } from '../lib/texto'
import { conCacheDeLectura, actualizarCacheDeLectura } from '../lib/cacheLectura'
import { indexarPaciente, buscarEnIndiceLocal } from '../lib/indicePacientesOffline'
import { crearPacienteOffline, obtenerPacienteOfflineLocal } from '../lib/pacientesOffline'
import { encolarOperacion } from '../lib/colaOffline'
import { esIdOffline, resolverId } from '../lib/mapeoIdsOffline'
import { verificarConexionReal } from '../lib/conectividadReal'
import { buscarEnReplicaClinica, obtenerPacienteDeReplica } from '../lib/pacientesReplica'

// Si ya existe un paciente con esa CURP en la clínica, lo regresa (para
// no crear un expediente duplicado) — si no, regresa null.
export async function buscarPacientePorCurp(curp) {
  const { data, error } = await supabase
    .from('pacientes')
    .select('id, nombre_completo, numero_expediente, archivado_en')
    .eq('curp', curp)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function buscarPacientes(termino, { incluirArchivados = false } = {}) {
  const conexionReal = await verificarConexionReal(supabase)
  if (!conexionReal) {
    // Sin conexión: el índice local es lo único disponible — solo
    // nombre/teléfono/folio de quien ya se vio o se creó en este
    // equipo, nunca la clínica completa (ver lib/indicePacientesOffline.js).
    // `_disponibleOffline` avisa si además el expediente completo ya
    // está cacheado (se puede abrir) o no (habría que esperar a tener
    // internet) — nunca se inventa uno ni el otro.
    // La réplica de la clínica (si ya se sincronizó) cubre a
    // cualquier paciente, se haya abierto antes o no; el índice ligero
    // cubre además lo creado/visto en este equipo que la réplica
    // todavía no tiene (p. ej. un paciente creado offline hace un
    // momento, en esta misma sesión) — se combinan sin duplicar.
    const [deLaReplica, delIndice] = await Promise.all([
      buscarEnReplicaClinica(termino, { incluirArchivados }),
      buscarEnIndiceLocal(termino)
    ])
    const idsEnReplica = new Set(deLaReplica.map((p) => p.id))
    const soloEnIndice = delIndice.filter((p) => !idsEnReplica.has(p.id))
    const basicosDeReplica = deLaReplica.map((p) => ({ ...p, _basicoDisponible: true }))
    const delIndiceConDisponibilidad = await Promise.all(soloEnIndice.map(async (r) => ({
      ...r,
      _disponibleOffline: r.offline || (await hayExpedienteCacheado(r.id))
    })))
    return [...basicosDeReplica, ...delIndiceConDisponibilidad]
  }

  let query = supabase
    .from('v_pacientes_seguro')
    .select('id, nombre_completo, telefono, correo, fecha_nacimiento, archivado_en')
    .order('nombre_completo')
    .limit(50)

  if (!incluirArchivados) {
    query = query.is('archivado_en', null)
  }

  const terminoLimpio = sanitizarTerminoBusqueda(termino)
  if (terminoLimpio) {
    query = query.or(
      `nombre_completo.ilike.%${terminoLimpio}%,telefono.ilike.%${terminoLimpio}%`
    )
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function obtenerPaciente(id) {
  if (esIdOffline(id)) {
    // ¿Ya se sincronizó mientras tanto? Si sí, lo correcto es seguir
    // por el id REAL de aquí en adelante (es lo que exista en el
    // servidor) — se marca `_redirigidoA` para que quien llamó (la
    // pantalla del paciente) pueda actualizar la URL, en vez de seguir
    // usando un id que ya quedó obsoleto.
    const serverId = await resolverId(id)
    if (serverId !== id) {
      const real = await obtenerPaciente(serverId)
      return { ...real, _redirigidoA: serverId }
    }
    const local = await obtenerPacienteOfflineLocal(id)
    if (!local) throw new Error('Paciente no encontrado.')
    return { ...local, _offline: true }
  }

  try {
    const { datos } = await conCacheDeLectura(`paciente:${id}`, async () => {
      const { data, error } = await supabase
        .from('v_pacientes_seguro')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    })
    indexarPaciente({
      id: datos.id,
      nombre_completo: datos.nombre_completo,
      telefono: datos.telefono ?? null,
      numero_expediente: datos.numero_expediente ?? null,
      offline: false,
      actualizado_en: Date.now()
    }).catch(() => {})
    return datos
  } catch (err) {
    // Sin red y esta ficha nunca se abrió antes en este equipo (nada
    // en conCacheDeLectura): si el paciente ya está en la réplica
    // completa de la clínica (lib/pacientesReplica.js,
    // lib/clinicDataSync.js), se usan esos datos básicos — nombre,
    // teléfono, folio — aunque el resto del expediente (notas,
    // tratamientos, odontograma…) siga sin estar disponible hasta
    // tener internet. `_soloBasico` avisa de esa diferencia.
    const basico = await obtenerPacienteDeReplica(id).catch(() => null)
    if (basico) return { ...basico, _soloBasico: true }
    throw err
  }
}

// Sin conexión REAL (no solo navigator.onLine — ver lib/conectividadReal.js)
// crea el paciente localmente con un id temporal y lo encola; nunca
// intenta el insert directo, que solo generaría un error de red más.
// El resto del formulario (validación de CURP, duplicados) ya se
// evalúa aparte, antes de llegar aquí — ver pages/Pacientes.jsx.
export async function crearPaciente(paciente, { usuarioId, clinicaId, sucursalId } = {}) {
  const conexionReal = await verificarConexionReal(supabase)
  if (!conexionReal) {
    return crearPacienteOffline(paciente, { usuarioId, clinicaId, sucursalId })
  }

  const { data, error } = await supabase
    .from('pacientes')
    .insert(paciente)
    .select()
    .single()
  if (error) throw error

  // El expediente vacío y el odontograma se crean solos, vía triggers en
  // la BD — no hace falta insertarlos aquí.

  indexarPaciente({
    id: data.id,
    nombre_completo: data.nombre_completo,
    telefono: data.telefono ?? null,
    numero_expediente: data.numero_expediente ?? null,
    offline: false,
    actualizado_en: Date.now()
  }).catch(() => {})

  return data
}

// La versión SIN comprobación de conectividad — la usa el ejecutor de
// la cola (lib/procesadorColaOffline.js) para subir un paciente creado
// offline: ahí ya se SABE que hay conexión (se está sincronizando), y
// llamar a crearPaciente() otra vez reintentaría el heartbeat sin
// necesidad.
export async function crearPacienteEnServidor(paciente) {
  // upsert (no insert) por diseño: `paciente.id` ya viene fijado desde
  // que se creó offline (lib/pacientesOffline.js) precisamente para
  // que reintentar esto — por ejemplo si la respuesta se perdió pero
  // el insert sí se aplicó — nunca cree un paciente duplicado.
  const { data, error } = await supabase
    .from('pacientes')
    .upsert(paciente)
    .select()
    .single()
  if (error) throw error
  indexarPaciente({
    id: data.id,
    nombre_completo: data.nombre_completo,
    telefono: data.telefono ?? null,
    numero_expediente: data.numero_expediente ?? null,
    offline: false,
    actualizado_en: Date.now()
  }).catch(() => {})
  return data
}

// Si se pasa actualizadoEnEsperado, se agrega como condición extra del
// UPDATE (no reemplaza RLS, se suma a ella) — si alguien más ya
// modificó este paciente desde que se abrió el formulario, la
// condición no encuentra ninguna fila que coincida, y .single() lanza
// PGRST116 en vez de guardar encima de datos ya desactualizados.
export async function actualizarPacienteEnServidor(id, cambios, actualizadoEnEsperado) {
  let query = supabase.from('pacientes').update(cambios).eq('id', id)
  if (actualizadoEnEsperado) {
    query = query.eq('actualizado_en', actualizadoEnEsperado)
  }
  const { data, error } = await query.select().single()
  if (error) {
    if (error.code === 'PGRST116' && actualizadoEnEsperado) {
      throw new Error('CONFLICTO_CONCURRENCIA')
    }
    throw error
  }
  indexarPaciente({
    id: data.id,
    nombre_completo: data.nombre_completo,
    telefono: data.telefono ?? null,
    numero_expediente: data.numero_expediente ?? null,
    offline: false,
    actualizado_en: Date.now()
  }).catch(() => {})
  return data
}

// El ejecutor de la cola llama a actualizarPacienteEnServidor()
// directo (ya sabe que hay conexión, está sincronizando) — esta
// versión exportada es la que usa la pantalla de edición, y decide
// sola si hay que encolar.
export async function actualizarPaciente(id, cambios, actualizadoEnEsperado, { usuarioId, clinicaId, sucursalId } = {}) {
  const conexionReal = await verificarConexionReal(supabase)
  if (!conexionReal) {
    // Clave estable por paciente: editar la misma ficha varias veces
    // antes de reconectar reemplaza el cambio anterior en la cola —
    // solo importa el último estado, no cada paso intermedio. El
    // candado de concurrencia (actualizadoEnEsperado) sigue apuntando
    // al mismo valor porque el registro optimista de abajo nunca lo
    // toca — todavía no hay ningún cambio real aplicado en el servidor.
    const id_op = `actualizar_paciente_datos_${id}`
    await encolarOperacion({
      id: id_op,
      tipo: 'actualizar_paciente',
      entidad: 'pacientes',
      entidadId: id,
      payload: { id, cambios, actualizadoEnEsperado },
      creado_en: Date.now(),
      usuarioId: usuarioId ?? null,
      clinicaId: clinicaId ?? null,
      sucursalId: sucursalId ?? null,
      claveIdempotencia: id_op
    })
    // El paciente ya se vio antes (así llegó a esta pantalla), así que
    // esto siempre encuentra algo con qué mezclar el cambio — nunca
    // inventa datos que no estaban.
    const actual = await obtenerPaciente(id)
    const optimista = { ...actual, ...cambios, _pendiente: true }
    await actualizarCacheDeLectura(`paciente:${id}`, optimista)
    return optimista
  }
  return actualizarPacienteEnServidor(id, cambios, actualizadoEnEsperado)
}

// Reasignación de odontólogo responsable — separada de
// actualizarPaciente() a propósito: en la base, un trigger
// (fn_validar_reasignacion_paciente) bloquea este cambio específico si
// quien lo hace no es owner, aunque el resto de la fila sí se pudiera
// editar. Tener una función aparte deja claro en el código que esta
// acción tiene una regla de permisos distinta al resto del formulario.
async function hayExpedienteCacheado(id) {
  try {
    await obtenerPaciente(id)
    return true
  } catch {
    return false
  }
}

export async function reasignarPaciente(id, dentistaResponsableId) {
  const { data, error } = await supabase
    .from('pacientes')
    .update({ dentista_responsable_id: dentistaResponsableId })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function obtenerSaldo(pacienteId) {
  const { data, error } = await supabase
    .from('v_saldo_pacientes')
    .select('*')
    .eq('paciente_id', pacienteId)
    .maybeSingle()
  if (error) throw error
  return data ?? { total_tratamientos: 0, total_pagado: 0, saldo: 0 }
}

// Baja lógica: el paciente y toda su historia clínica se quedan intactos,
// solo se ocultan de las listas normales. Reversible con restaurarPaciente.
// Archivar y restaurar comparten UNA clave estable propia
// (`archivar_restaurar_paciente_${id}`) — nunca la misma que usa
// actualizarPaciente() para "datos generales" (`actualizar_paciente_datos_${id}`).
// Si compartieran clave, archivar justo después de editar el nombre
// sin conexión reemplazaría en la cola la instantánea completa del
// formulario por solo `{archivado_en}`, perdiendo la edición. Archivar
// y restaurar sí pueden compartir clave entre sí: uno después del otro
// sin conexión converge al mismo resultado neto (archivado o no) sin
// perder nada, archivarlos aparte sería un viaje de más.
async function establecerArchivadoEnServidor(id, archivadoEn) {
  const { error } = await supabase.from('pacientes').update({ archivado_en: archivadoEn }).eq('id', id)
  if (error) throw error
}

async function encolarArchivoPaciente(id, archivadoEn, { usuarioId, clinicaId, sucursalId } = {}) {
  const idOp = `archivar_restaurar_paciente_${id}`
  await encolarOperacion({
    id: idOp,
    tipo: 'actualizar_paciente',
    entidad: 'pacientes',
    entidadId: id,
    payload: { id, cambios: { archivado_en: archivadoEn } },
    dependeDe: [],
    creado_en: Date.now(),
    usuarioId: usuarioId ?? null,
    clinicaId: clinicaId ?? null,
    sucursalId: sucursalId ?? null,
    claveIdempotencia: idOp
  })
  // El paciente ya se vio antes (así se llegó a su ficha) — se refleja
  // el cambio en la caché de inmediato, igual que actualizarPaciente().
  const actual = await obtenerPaciente(id)
  await actualizarCacheDeLectura(`paciente:${id}`, { ...actual, archivado_en: archivadoEn, _pendiente: true })
}

export async function archivarPaciente(id, operador = {}) {
  const conexionReal = await verificarConexionReal(supabase)
  if (!conexionReal) {
    await encolarArchivoPaciente(id, new Date().toISOString(), operador)
    return
  }
  await establecerArchivadoEnServidor(id, new Date().toISOString())
}

export async function restaurarPaciente(id, operador = {}) {
  const conexionReal = await verificarConexionReal(supabase)
  if (!conexionReal) {
    await encolarArchivoPaciente(id, null, operador)
    return
  }
  await establecerArchivadoEnServidor(id, null)
}

// Alerta simple de posibles duplicados antes de guardar (fuzzy por nombre/telefono)
export async function buscarPosiblesDuplicados({ nombre_completo, telefono }) {
  const nombreLimpio = sanitizarTerminoBusqueda(nombre_completo)
  const telefonoLimpio = sanitizarTerminoBusqueda(telefono)
  const { data, error } = await supabase
    .from('pacientes')
    .select('id, nombre_completo, telefono')
    .or(`telefono.eq.${telefonoLimpio},nombre_completo.ilike.%${nombreLimpio}%`)
    .limit(5)
  if (error) throw error
  return data
}

// ------------------------------------------------------------
// Lista mejorada de pacientes (Fase 5): foto, folio, edad, última
// consulta, próxima cita, tratamiento activo, saldo, con filtros que
// SÍ afectan la paginación (no solo un post-filtro cosmético) y
// ordenamiento.
// ------------------------------------------------------------

const FILTROS_CRUZADOS = {
  con_saldo: async () => {
    const { data, error } = await supabase.from('v_saldo_pacientes').select('paciente_id').gt('saldo', 0)
    if (error) throw error
    return data.map((r) => r.paciente_id)
  },
  con_tratamiento: async () => {
    const { data, error } = await supabase.from('tratamientos').select('paciente_id').in('estado', ['planeado', 'en_progreso'])
    if (error) throw error
    return [...new Set(data.map((r) => r.paciente_id))]
  },
  con_cita: async () => {
    const { data, error } = await supabase
      .from('citas')
      .select('paciente_id')
      .gte('inicio', new Date().toISOString())
      .not('estado', 'in', '(cancelada,completada,no_asistio)')
    if (error) throw error
    return [...new Set(data.map((r) => r.paciente_id))]
  }
}

async function _buscarPacientesDetalladoReal({
  termino = '',
  filtroEstado = 'activos', // activos | archivados | todos
  filtroExtra = '', // '' | con_saldo | con_tratamiento | con_cita
  orden = 'nombre_completo.asc',
  pagina = 1,
  porPagina = 15
}) {
  let idsPermitidos = null
  if (filtroExtra && FILTROS_CRUZADOS[filtroExtra]) {
    idsPermitidos = await FILTROS_CRUZADOS[filtroExtra]()
    if (idsPermitidos.length === 0) return { pacientes: [], total: 0 }
  }

  let query = supabase
    .from('v_pacientes_seguro')
    .select('id, nombre_completo, numero_expediente, telefono, correo, fecha_nacimiento, archivado_en', { count: 'exact' })

  if (filtroEstado === 'activos') query = query.is('archivado_en', null)
  if (filtroEstado === 'archivados') query = query.not('archivado_en', 'is', null)
  if (idsPermitidos) query = query.in('id', idsPermitidos)
  const terminoLimpio = sanitizarTerminoBusqueda(termino)
  if (terminoLimpio) {
    query = query.or(
      `nombre_completo.ilike.%${terminoLimpio}%,telefono.ilike.%${terminoLimpio}%,correo.ilike.%${terminoLimpio}%,numero_expediente.ilike.%${terminoLimpio}%`
    )
  }

  const [campoOrden, direccion] = orden.split('.')
  query = query.order(campoOrden, { ascending: direccion !== 'desc' })

  const desde = (pagina - 1) * porPagina
  query = query.range(desde, desde + porPagina - 1)

  const { data: pacientes, error, count } = await query
  if (error) throw error
  if (pacientes.length === 0) return { pacientes: [], total: count ?? 0 }

  const ids = pacientes.map((p) => p.id)
  const ahora = new Date().toISOString()

  const [saldosRes, citasPasadasRes, citasFuturasRes, tratamientosRes] = await Promise.all([
    supabase.from('v_saldo_pacientes').select('paciente_id, saldo').in('paciente_id', ids),
    supabase.from('citas').select('paciente_id, inicio').in('paciente_id', ids).lt('inicio', ahora).order('inicio', { ascending: false }),
    supabase.from('citas').select('paciente_id, inicio').in('paciente_id', ids).gte('inicio', ahora).order('inicio', { ascending: true }),
    supabase.from('tratamientos').select('paciente_id, estado').in('paciente_id', ids).in('estado', ['planeado', 'en_progreso'])
  ])

  for (const r of [saldosRes, citasPasadasRes, citasFuturasRes, tratamientosRes]) {
    if (r.error) throw r.error
  }

  const saldoPorId = Object.fromEntries(saldosRes.data.map((s) => [s.paciente_id, Number(s.saldo)]))
  const ultimaConsultaPorId = {}
  for (const c of citasPasadasRes.data) {
    if (!ultimaConsultaPorId[c.paciente_id]) ultimaConsultaPorId[c.paciente_id] = c.inicio
  }
  const proximaCitaPorId = {}
  for (const c of citasFuturasRes.data) {
    if (!proximaCitaPorId[c.paciente_id]) proximaCitaPorId[c.paciente_id] = c.inicio
  }
  const tratamientoActivoPorId = new Set(tratamientosRes.data.map((t) => t.paciente_id))

  const enriquecidos = pacientes.map((p) => ({
    ...p,
    saldo: saldoPorId[p.id] ?? 0,
    ultima_consulta: ultimaConsultaPorId[p.id] ?? null,
    proxima_cita: proximaCitaPorId[p.id] ?? null,
    tratamiento_activo: tratamientoActivoPorId.has(p.id)
  }))

  return { pacientes: enriquecidos, total: count ?? 0 }
}

// Se guarda en caché por esta combinación exacta de filtros — así
// volver a la lista con la misma búsqueda que ya habías hecho, sin
// conexión, sí muestra algo en vez de una pantalla vacía. Una
// combinación distinta de filtros (otra búsqueda, otra página) que
// nunca se visitó sigue sin tener nada que mostrar, como es de
// esperarse.
export async function buscarPacientesDetallado(filtros) {
  const clave = `pacientes:${JSON.stringify(filtros)}`
  const { datos } = await conCacheDeLectura(clave, () => _buscarPacientesDetalladoReal(filtros))
  return datos
}
