import { supabase } from '../lib/supabase'
import { capitalizarPrimeraLetra } from '../lib/texto'
import { inicioDeHoy, finDeHoy, inicioDeMesActual, finDeMesActual, inicioDeSemanaLunes } from '../lib/fechas'

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
    .select('*, usuario:usuarios(nombre)')
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

// ---------- Series para gráficas ----------

export async function obtenerIngresosPorMes(mesesAtras = 6) {
  const ahora = new Date()
  const desde = new Date(ahora.getFullYear(), ahora.getMonth() - (mesesAtras - 1), 1)
  const { data, error } = await supabase
    .from('pagos')
    .select('monto, tipo, creado_en')
    .gte('creado_en', desde.toISOString())
  if (error) throw error

  const meses = Array.from({ length: mesesAtras }, (_, i) => {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - (mesesAtras - 1 - i), 1)
    return { clave: `${d.getFullYear()}-${d.getMonth()}`, mes: capitalizarPrimeraLetra(d.toLocaleDateString('es-MX', { month: 'short' })), ingresos: 0 }
  })
  const porClave = Object.fromEntries(meses.map((m) => [m.clave, m]))

  for (const p of data) {
    const d = new Date(p.creado_en)
    const clave = `${d.getFullYear()}-${d.getMonth()}`
    if (porClave[clave]) {
      porClave[clave].ingresos += p.tipo === 'reembolso' ? -Number(p.monto) : Number(p.monto)
    }
  }
  return meses
}

export async function obtenerCitasPorSemana(semanasAtras = 8) {
  const inicioSemanaActual = inicioDeSemanaLunes(new Date())
  const desde = new Date(inicioSemanaActual)
  desde.setDate(desde.getDate() - (semanasAtras - 1) * 7)

  const { data, error } = await supabase
    .from('citas')
    .select('inicio')
    .gte('inicio', desde.toISOString())
  if (error) throw error

  const semanas = Array.from({ length: semanasAtras }, (_, i) => {
    const ini = new Date(inicioSemanaActual)
    ini.setDate(ini.getDate() - (semanasAtras - 1 - i) * 7)
    return { clave: ini.toISOString().slice(0, 10), semana: `${ini.getDate()}/${ini.getMonth() + 1}`, citas: 0 }
  })
  const porClave = Object.fromEntries(semanas.map((s) => [s.clave, s]))

  for (const c of data) {
    const clave = inicioDeSemanaLunes(new Date(c.inicio)).toISOString().slice(0, 10)
    if (porClave[clave]) porClave[clave].citas += 1
  }
  return semanas
}

export async function obtenerCitasCompletadasCanceladas() {
  const { data, error } = await supabase
    .from('citas')
    .select('estado')
    .gte('inicio', inicioDeMesActual().toISOString())
    .lt('inicio', finDeMesActual().toISOString())
  if (error) throw error

  const conteo = { completada: 0, cancelada: 0, no_asistio: 0 }
  for (const c of data) {
    if (c.estado in conteo) conteo[c.estado] += 1
  }
  return [
    { estado: 'Completadas', valor: conteo.completada, color: '#22C55E' },
    { estado: 'Canceladas', valor: conteo.cancelada, color: '#FCA5A5' },
    { estado: 'No asistió', valor: conteo.no_asistio, color: '#DC2626' }
  ]
}

// Se agrupa por `descripcion` tal cual — cuando exista un catálogo de
// tratamientos con categoría (fase futura), esto se puede agrupar mejor.
export async function obtenerTratamientosMasRealizados(limite = 5) {
  const { data, error } = await supabase.from('tratamientos').select('descripcion')
  if (error) throw error

  const conteo = {}
  for (const t of data) {
    conteo[t.descripcion] = (conteo[t.descripcion] ?? 0) + 1
  }
  return Object.entries(conteo)
    .map(([descripcion, cantidad]) => ({ descripcion, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, limite)
}

export async function obtenerPacientesNuevosPorMes(mesesAtras = 6) {
  const ahora = new Date()
  const desde = new Date(ahora.getFullYear(), ahora.getMonth() - (mesesAtras - 1), 1)
  const { data, error } = await supabase
    .from('v_pacientes_seguro')
    .select('creado_en')
    .gte('creado_en', desde.toISOString())
  if (error) throw error

  const meses = Array.from({ length: mesesAtras }, (_, i) => {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - (mesesAtras - 1 - i), 1)
    return { clave: `${d.getFullYear()}-${d.getMonth()}`, mes: capitalizarPrimeraLetra(d.toLocaleDateString('es-MX', { month: 'short' })), pacientes: 0 }
  })
  const porClave = Object.fromEntries(meses.map((m) => [m.clave, m]))

  for (const p of data) {
    const d = new Date(p.creado_en)
    const clave = `${d.getFullYear()}-${d.getMonth()}`
    if (porClave[clave]) porClave[clave].pacientes += 1
  }
  return meses
}
