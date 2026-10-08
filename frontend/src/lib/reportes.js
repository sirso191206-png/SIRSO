// Reportes del dashboard: períodos, rangos, porcentajes y clasificación de estados. Todo puro (sin red) para
// poder probarlo a fondo. Los datos salen siempre de la base de la clínica del usuario.
export const PERIODOS_SERIE = [
  { valor: '6m', etiqueta: 'Últimos 6 meses' },
  { valor: '12m', etiqueta: 'Últimos 12 meses' },
  { valor: 'anio', etiqueta: 'Año actual' },
  { valor: 'rango', etiqueta: 'Rango personalizado' }
]
export const PERIODOS_RANKING = [
  { valor: 'mes', etiqueta: 'Este mes' },
  { valor: 'trimestre', etiqueta: 'Este trimestre' },
  { valor: 'anio', etiqueta: 'Este año' }
]
export const OPCIONES_SEMANAS = [4, 8, 12]
export const MAX_MESES_RANGO = 24
export const ESTADOS_TRATAMIENTO = [
  { valor: 'planeado', etiqueta: 'Planeado' }, { valor: 'aceptado', etiqueta: 'Aceptado' }, { valor: 'en_progreso', etiqueta: 'En progreso' },
  { valor: 'pausado', etiqueta: 'Pausado' }, { valor: 'completado', etiqueta: 'Completado' }, { valor: 'cancelado', etiqueta: 'Cancelado' }
]

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// "2026-10-15" → fecha LOCAL (sin el corrimiento de zona horaria de new Date('2026-10-15')). null si no es válida.
export function fechaLocal(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd ?? ''))
  if (!m) return null
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const f = new Date(a, mes - 1, d)
  return f.getFullYear() === a && f.getMonth() === mes - 1 && f.getDate() === d ? f : null
}

function mesesEntre(inicio, fin) {
  const total = (fin.getFullYear() - inicio.getFullYear()) * 12 + (fin.getMonth() - inicio.getMonth()) + 1
  return total
}

export function validarRango(desde, hasta) {
  const d = fechaLocal(desde)
  const h = fechaLocal(hasta)
  if (!d || !h) return { ok: false, mensaje: 'Elige las dos fechas.' }
  if (d > h) return { ok: false, mensaje: 'La fecha inicial no puede ser posterior a la final.' }
  if (mesesEntre(d, h) > MAX_MESES_RANGO) return { ok: false, mensaje: `El rango máximo es de ${MAX_MESES_RANGO} meses.` }
  return { ok: true, mensaje: '' }
}

// Lista de meses (inicio incluido, fin excluido) de un período. Rango inválido → [].
export function mesesDelPeriodo(periodo, { desde, hasta } = {}, ahora = new Date()) {
  const mesActual = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
  let inicio
  let fin = mesActual
  if (periodo === '12m') inicio = new Date(ahora.getFullYear(), ahora.getMonth() - 11, 1)
  else if (periodo === 'anio') inicio = new Date(ahora.getFullYear(), 0, 1)
  else if (periodo === 'rango') {
    if (!validarRango(desde, hasta).ok) return []
    const d = fechaLocal(desde)
    const h = fechaLocal(hasta)
    inicio = new Date(d.getFullYear(), d.getMonth(), 1)
    fin = new Date(h.getFullYear(), h.getMonth(), 1)
  } else inicio = new Date(ahora.getFullYear(), ahora.getMonth() - 5, 1)

  const cruzaAnios = inicio.getFullYear() !== fin.getFullYear()
  const meses = []
  for (let c = new Date(inicio); c <= fin; c = new Date(c.getFullYear(), c.getMonth() + 1, 1)) {
    meses.push({
      clave: `${c.getFullYear()}-${c.getMonth()}`,
      inicio: new Date(c),
      fin: new Date(c.getFullYear(), c.getMonth() + 1, 1),
      etiqueta: cruzaAnios ? `${MESES[c.getMonth()]} ${String(c.getFullYear()).slice(2)}` : MESES[c.getMonth()]
    })
  }
  return meses
}

// Rango [desde, hasta) que cubre todos los meses.
export function limitesDeMeses(meses) {
  if (!meses.length) return null
  return { desde: meses[0].inicio, hasta: meses[meses.length - 1].fin }
}

// Suma `valor(fila)` en el mes de `fila[campo]`. Devuelve un arreglo paralelo a `meses`.
export function agruparPorMes(filas, campo, meses, valor = () => 1) {
  const porClave = Object.fromEntries(meses.map((m) => [m.clave, 0]))
  for (const f of filas) {
    const d = new Date(f[campo])
    const clave = `${d.getFullYear()}-${d.getMonth()}`
    if (clave in porClave) porClave[clave] += valor(f)
  }
  return meses.map((m) => ({ mes: m.etiqueta, valor: porClave[m.clave] }))
}

// Ranking: [desde, hasta) del mes, trimestre o año en curso.
export function rangoRanking(periodo, ahora = new Date()) {
  const a = ahora.getFullYear()
  const m = ahora.getMonth()
  if (periodo === 'trimestre') {
    const t = Math.floor(m / 3) * 3
    return { desde: new Date(a, t, 1), hasta: new Date(a, t + 3, 1) }
  }
  if (periodo === 'anio') return { desde: new Date(a, 0, 1), hasta: new Date(a + 1, 0, 1) }
  return { desde: new Date(a, m, 1), hasta: new Date(a, m + 1, 1) }
}

// completada | cancelada (incluye "no asistió") | pendiente (todo lo demás: agendada, confirmada, en espera…).
export function clasificarEstadoCita(estado) {
  if (estado === 'completada') return 'completada'
  if (estado === 'cancelada' || estado === 'no_asistio') return 'cancelada'
  return 'pendiente'
}

// Porcentajes enteros que SIEMPRE suman 100 (método del mayor resto). Sin datos, todos 0.
export function conPorcentajes(items, clave = 'valor') {
  const total = items.reduce((a, i) => a + Number(i[clave] || 0), 0)
  if (total <= 0) return items.map((i) => ({ ...i, porcentaje: 0 }))
  const crudos = items.map((i) => (Number(i[clave] || 0) * 100) / total)
  const pisos = crudos.map(Math.floor)
  let faltan = 100 - pisos.reduce((a, b) => a + b, 0)
  const orden = crudos.map((c, idx) => ({ idx, resto: c - Math.floor(c) })).sort((x, y) => y.resto - x.resto || x.idx - y.idx)
  for (let k = 0; k < faltan; k++) pisos[orden[k].idx] += 1
  return items.map((i, idx) => ({ ...i, porcentaje: pisos[idx] }))
}

export const FILTROS_INICIALES = {
  periodo: '6m', desde: '', hasta: '', semanas: 8, dentistaId: '', sucursalId: '', periodoRanking: 'mes', estadoTratamiento: ''
}

// Descripción de los filtros aplicados (va en el CSV y en la bitácora de exportación).
export function resumenFiltros(f) {
  return {
    periodo: f.periodo === 'rango' ? `${f.desde} a ${f.hasta}` : f.periodo,
    semanas: f.semanas, odontologo: f.dentistaId || 'todos', sucursal: f.sucursalId || 'todas',
    ranking: f.periodoRanking, estado_tratamiento: f.estadoTratamiento || 'todos'
  }
}

// Qué se exporta de cada gráfica (CSV). Solo datos agregados de la clínica del usuario.
export const EXPORTACIONES = {
  ingresos: { archivo: 'ingresos-por-mes', columnas: [{ titulo: 'Mes', valor: (f) => f.mes }, { titulo: 'Ingresos netos (MXN)', valor: (f) => Number(f.ingresos).toFixed(2) }] },
  citasPorSemana: { archivo: 'citas-por-semana', columnas: [
    { titulo: 'Semana (inicia el lunes)', valor: (f) => f.semana }, { titulo: 'Completadas', valor: (f) => f.completadas },
    { titulo: 'Canceladas', valor: (f) => f.canceladas }, { titulo: 'Pendientes', valor: (f) => f.pendientes }] },
  citasDelMes: { archivo: 'citas-del-mes', columnas: [
    { titulo: 'Estado', valor: (f) => f.estado }, { titulo: 'Citas', valor: (f) => f.valor }, { titulo: 'Porcentaje', valor: (f) => `${f.porcentaje}%` }] },
  tratamientos: { archivo: 'tratamientos-mas-realizados', columnas: [{ titulo: 'Tratamiento', valor: (f) => f.descripcion }, { titulo: 'Cantidad', valor: (f) => f.cantidad }] },
  pacientesNuevos: { archivo: 'pacientes-nuevos-por-mes', columnas: [{ titulo: 'Mes', valor: (f) => f.mes }, { titulo: 'Pacientes nuevos', valor: (f) => f.pacientes }] }
}
