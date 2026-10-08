import { supabase } from '../lib/supabase'
import { inicioDeHoy, finDeHoy, inicioDeMesActual, finDeMesActual, inicioDeSemanaLunes } from '../lib/fechas'
import { agruparPorMes, clasificarEstadoCita, conPorcentajes, limitesDeMeses, rangoRanking } from '../lib/reportes'

const ESTADOS_NO_ACTIVOS = 'cancelada,completada,no_asistio'

// ---------- Listas ----------

export async function obtenerCitasHoy() {
  const { data, error } = await supabase
    .from('citas')
    .select('*, paciente:pacientes(nombre_completo, telefono), dentista:usuarios(nombre)')
    .gte('inicio', inicioDeHoy().toISOString())
    .lt('inicio', finDeHoy().toISOString())
    .order('inicio')
  if (error) throw error
  return data
}

export async function obtenerProximasCitas(limite = 6) {
  const { data, error } = await supabase
    .from('citas')
    .select('*, paciente:pacientes(nombre_completo), dentista:usuarios(nombre)')
    .gte('inicio', new Date().toISOString())
    .not('estado', 'in', `(${ESTADOS_NO_ACTIVOS})`)
    .order('inicio')
    .limit(limite)
  if (error) throw error
  return data
}

export async function obtenerCitasSinConfirmar(limite = 6) {
  const { data, error } = await supabase
    .from('citas')
    .select('*, paciente:pacientes(nombre_completo)')
    .eq('estado', 'pendiente_confirmar')
    .gte('inicio', inicioDeHoy().toISOString())
    .order('inicio')
    .limit(limite)
  if (error) throw error
  return data
}

export async function obtenerTratamientosPendientes(limite = 6) {
  const { data, error } = await supabase
    .from('tratamientos')
    .select('*, paciente:pacientes(nombre_completo)')
    .in('estado', ['planeado', 'en_progreso'])
    .order('creado_en', { ascending: false })
    .limit(limite)
  if (error) throw error
  return data
}

export async function obtenerPagosRecientes(limite = 6) {
  const { data, error } = await supabase
    .from('pagos')
    .select('*, paciente:pacientes(nombre_completo)')
    .is('anulado_en', null) // un pago anulado no es un pago reciente
    .order('creado_en', { ascending: false })
    .limit(limite)
  if (error) throw error
  return data
}

// v_saldo_pacientes es una vista sin relación FK que PostgREST pueda
// "embeber" automáticamente, así que el nombre del paciente se junta
// aparte, en dos pasos.
export async function obtenerPacientesConSaldo(limite = 6) {
  const { data: saldos, error } = await supabase
    .from('v_saldo_pacientes')
    .select('paciente_id, saldo')
    .gt('saldo', 0)
    .order('saldo', { ascending: false })
    .limit(limite)
  if (error) throw error
  if (saldos.length === 0) return []

  const ids = saldos.map((s) => s.paciente_id)
  const { data: pacientes, error: errorPac } = await supabase
    .from('v_pacientes_seguro')
    .select('id, nombre_completo')
    .in('id', ids)
  if (errorPac) throw errorPac

  const nombrePorId = Object.fromEntries(pacientes.map((p) => [p.id, p.nombre_completo]))
  return saldos.map((s) => ({ ...s, nombre_completo: nombrePorId[s.paciente_id] ?? '—' }))
}

export async function obtenerActividadReciente(limite = 10) {
  const { data, error } = await supabase
    .from('auditoria')
    // Solo lo que se muestra: `detalle` guarda la fila completa del cambio (datos de pacientes) y no se pide.
    .select('id, creado_en, accion, entidad, usuario:usuarios(nombre)')
    .order('creado_en', { ascending: false })
    .limit(limite)
  if (error) throw error
  return data
}

// ---------- Contadores ----------

export async function contarPacientesAtendidosHoy(dentistaId) {
  let query = supabase
    .from('citas')
    .select('paciente_id')
    .eq('estado', 'completada')
    .gte('inicio', inicioDeHoy().toISOString())
    .lt('inicio', finDeHoy().toISOString())
  if (dentistaId) query = query.eq('dentista_id', dentistaId)
  const { data, error } = await query
  if (error) throw error
  return new Set(data.map((c) => c.paciente_id)).size
}

export async function contarPacientesEnEspera(dentistaId) {
  let query = supabase
    .from('citas')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'en_espera')
    .gte('inicio', inicioDeHoy().toISOString())
    .lt('inicio', finDeHoy().toISOString())
  if (dentistaId) query = query.eq('dentista_id', dentistaId)
  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}

export async function contarCitasPendientesConfirmar(dentistaId) {
  let query = supabase
    .from('citas')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'pendiente_confirmar')
    .gte('inicio', inicioDeHoy().toISOString())
  if (dentistaId) query = query.eq('dentista_id', dentistaId)
  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}

export async function contarTratamientosActivos() {
  const { count, error } = await supabase
    .from('tratamientos')
    .select('id', { count: 'exact', head: true })
    .in('estado', ['planeado', 'en_progreso'])
  if (error) throw error
  return count ?? 0
}

// ---------- Dinero ----------

export async function obtenerIngresos(desde, hasta) {
  const { data, error } = await supabase
    .from('pagos')
    .select('monto, tipo')
    .is('anulado_en', null) // los pagos anulados NO son ingreso (el saldo del paciente y el corte de caja ya los excluyen)
    .gte('creado_en', desde.toISOString())
    .lt('creado_en', hasta.toISOString())
  if (error) throw error
  return data.reduce((acc, p) => acc + (p.tipo === 'reembolso' ? -Number(p.monto) : Number(p.monto)), 0)
}

export async function sumaSaldosPendientes() {
  const { data, error } = await supabase
    .from('v_saldo_pacientes')
    .select('saldo')
    .gt('saldo', 0)
  if (error) throw error
  return data.reduce((acc, r) => acc + Number(r.saldo), 0)
}

// ---------- Series para gráficas (respetan los filtros) ----------

const TAMANO_LOTE = 1000   // PostgREST devuelve como máximo 1000 filas por petición
const TOPE_FILAS = 50000

// Trae TODAS las filas de una consulta, de a lote. Sin esto, una clínica con más de 1000 pagos o citas en el
// período vería ingresos y conteos TRUNCADOS en silencio. `construir()` debe devolver una consulta ordenada.
export async function leerTodo(construir) {
  const filas = []
  for (let desde = 0; desde < TOPE_FILAS; desde += TAMANO_LOTE) {
    const { data, error } = await construir().range(desde, desde + TAMANO_LOTE - 1)
    if (error) throw error
    filas.push(...data)
    if (data.length < TAMANO_LOTE) break
  }
  return filas
}

// Ingresos netos por mes (reembolsos restan; los anulados no cuentan). El sucursal filtra; el odontólogo no aplica
// porque el pago lo registra recepción/owner, no el odontólogo.
export async function obtenerIngresosPorMes({ meses = [], sucursalId } = {}) {
  const lim = limitesDeMeses(meses)
  if (!lim) return []
  const filas = await leerTodo(() => {
    let q = supabase.from('pagos').select('monto, tipo, creado_en')
      .is('anulado_en', null)
      .gte('creado_en', lim.desde.toISOString()).lt('creado_en', lim.hasta.toISOString())
      .order('creado_en')
    if (sucursalId) q = q.eq('sucursal_id', sucursalId)
    return q
  })
  return agruparPorMes(filas, 'creado_en', meses, (p) => (p.tipo === 'reembolso' ? -Number(p.monto) : Number(p.monto)))
    .map(({ mes, valor }) => ({ mes, ingresos: valor }))
}

// Citas por semana separadas en completadas / canceladas (incluye "no asistió") / pendientes.
export async function obtenerCitasPorSemana({ semanas = 8, dentistaId, sucursalId } = {}) {
  const inicioSemanaActual = inicioDeSemanaLunes(new Date())
  const desde = new Date(inicioSemanaActual)
  desde.setDate(desde.getDate() - (semanas - 1) * 7)

  const filas = await leerTodo(() => {
    let q = supabase.from('citas').select('inicio, estado').gte('inicio', desde.toISOString()).order('inicio')
    if (dentistaId) q = q.eq('dentista_id', dentistaId)
    if (sucursalId) q = q.eq('sucursal_id', sucursalId)
    return q
  })

  const lista = Array.from({ length: semanas }, (_, i) => {
    const ini = new Date(inicioSemanaActual)
    ini.setDate(ini.getDate() - (semanas - 1 - i) * 7)
    return { clave: ini.toISOString().slice(0, 10), semana: `${ini.getDate()}/${ini.getMonth() + 1}`, completadas: 0, canceladas: 0, pendientes: 0 }
  })
  const porClave = Object.fromEntries(lista.map((s) => [s.clave, s]))
  for (const c of filas) {
    const semana = porClave[inicioDeSemanaLunes(new Date(c.inicio)).toISOString().slice(0, 10)]
    if (!semana) continue
    const tipo = clasificarEstadoCita(c.estado)
    if (tipo === 'completada') semana.completadas += 1
    else if (tipo === 'cancelada') semana.canceladas += 1
    else semana.pendientes += 1
  }
  return lista
}

// Citas del mes en curso: completadas / canceladas / pendientes, con porcentaje (suman 100).
export async function obtenerCitasDelMes({ dentistaId, sucursalId } = {}) {
  const filas = await leerTodo(() => {
    let q = supabase.from('citas').select('estado')
      .gte('inicio', inicioDeMesActual().toISOString()).lt('inicio', finDeMesActual().toISOString()).order('inicio')
    if (dentistaId) q = q.eq('dentista_id', dentistaId)
    if (sucursalId) q = q.eq('sucursal_id', sucursalId)
    return q
  })
  const conteo = { completada: 0, cancelada: 0, pendiente: 0 }
  for (const c of filas) conteo[clasificarEstadoCita(c.estado)] += 1
  return conPorcentajes([
    { estado: 'Completadas', valor: conteo.completada, color: '#22C55E' },
    { estado: 'Canceladas', valor: conteo.cancelada, color: '#FCA5A5' },
    { estado: 'Pendientes', valor: conteo.pendiente, color: '#94A3B8' }
  ])
}

// El conteo se hace en SQL (fn_tratamientos_mas_realizados, migración 083) y SECURITY INVOKER: lo cuenta cada quien
// sobre lo que RLS le deja ver. Se agrupa por `descripcion` tal cual.
export async function obtenerTratamientosMasRealizados({ periodo = 'mes', estado, dentistaId, limite = 5 } = {}) {
  const { desde, hasta } = rangoRanking(periodo)
  const { data, error } = await supabase.rpc('fn_tratamientos_mas_realizados', {
    p_limite: limite, p_desde: desde.toISOString(), p_hasta: hasta.toISOString(), p_estado: estado || null, p_dentista: dentistaId || null
  })
  if (error) throw error
  // count(*) en Postgres es bigint: PostgREST lo manda como texto.
  return data.map((d) => ({ descripcion: d.descripcion, cantidad: Number(d.cantidad) }))
}

export async function obtenerPacientesNuevosPorMes({ meses = [] } = {}) {
  const lim = limitesDeMeses(meses)
  if (!lim) return []
  const filas = await leerTodo(() => supabase.from('v_pacientes_seguro').select('creado_en')
    .gte('creado_en', lim.desde.toISOString()).lt('creado_en', lim.hasta.toISOString()).order('creado_en'))
  return agruparPorMes(filas, 'creado_en', meses).map(({ mes, valor }) => ({ mes, pacientes: valor }))
}
