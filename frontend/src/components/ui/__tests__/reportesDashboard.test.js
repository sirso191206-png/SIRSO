// Reportes del dashboard: filtros, rangos, exactitud y exportación. Todo dinámico, nada fijo.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { crearQueryMock, ok, fallo, llamada } from './offline/helpers/supabaseMock.js'

const m = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), registro: [], responder: null }))
vi.mock('../../../lib/supabase', () => ({ supabase: { from: m.from, rpc: m.rpc, auth: { onAuthStateChange: vi.fn() }, channel: vi.fn(), removeChannel: vi.fn() } }))

import {
  fechaLocal, validarRango, mesesDelPeriodo, limitesDeMeses, agruparPorMes, rangoRanking, clasificarEstadoCita, conPorcentajes,
  EXPORTACIONES, FILTROS_INICIALES, resumenFiltros, MAX_MESES_RANGO
} from '../../../lib/reportes.js'
import { aCsv } from '../../../lib/csv.js'
import * as dash from '../../../services/dashboard.js'
import { FiltrosReportes } from '../../dashboard/FiltrosReportes.jsx'

const AHORA = new Date(2026, 9, 15, 12, 0, 0) // 15 oct 2026

describe('fechaLocal / validarRango', () => {
  it('fechas válidas e inválidas (no acepta 30 de febrero ni mes 13)', () => {
    expect(fechaLocal('2026-10-15').getDate()).toBe(15)
    for (const malo of ['2026-02-30', '2026-13-01', '2026-00-10', '15/10/2026', '', null, undefined, '2026-1-5']) expect(fechaLocal(malo)).toBeNull()
    expect(fechaLocal('2028-02-29')).not.toBeNull() // bisiesto
    expect(fechaLocal('2026-02-29')).toBeNull()
  })
  it('rango: faltan fechas, invertido, demasiado largo; el mismo día y 24 meses exactos sí', () => {
    expect(validarRango('', '2026-10-01').ok).toBe(false)
    expect(validarRango('2026-10-01', '').mensaje).toMatch(/Elige las dos fechas/)
    expect(validarRango('2026-10-02', '2026-10-01').mensaje).toMatch(/no puede ser posterior/)
    expect(validarRango('2026-10-01', '2026-10-01').ok).toBe(true)
    expect(validarRango('2024-11-15', '2026-10-15').ok).toBe(true)   // 24 meses calendario
    const largo = validarRango('2024-10-01', '2026-10-15')           // 25 meses
    expect(largo.ok).toBe(false)
    expect(largo.mensaje).toMatch(new RegExp(`${MAX_MESES_RANGO} meses`))
  })
})

describe('mesesDelPeriodo: el eje X sale de la fecha de HOY, no de una lista fija', () => {
  it('últimos 6 meses = May … Oct (el ejemplo del eje X)', () => {
    const ms = mesesDelPeriodo('6m', {}, AHORA)
    expect(ms.map((x) => x.etiqueta)).toEqual(['May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct'])
  })
  it('el período por omisión (desconocido) es 6 meses', () => {
    expect(mesesDelPeriodo('loquesea', {}, AHORA)).toHaveLength(6)
  })
  it('12 meses cruza el año: las etiquetas llevan el año para no confundir', () => {
    const ms = mesesDelPeriodo('12m', {}, AHORA)
    expect(ms).toHaveLength(12)
    expect(ms[0].etiqueta).toBe('Nov 25')
    expect(ms[11].etiqueta).toBe('Oct 26')
  })
  it('año actual = enero hasta el mes en curso, sin año en la etiqueta', () => {
    const ms = mesesDelPeriodo('anio', {}, AHORA)
    expect(ms.map((x) => x.etiqueta)).toEqual(['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct'])
    expect(mesesDelPeriodo('anio', {}, new Date(2026, 0, 31))).toHaveLength(1)
  })
  it('rango personalizado: desde el mes de la fecha inicial hasta el de la final', () => {
    expect(mesesDelPeriodo('rango', { desde: '2026-03-10', hasta: '2026-05-02' }, AHORA).map((x) => x.etiqueta)).toEqual(['Mar', 'Abr', 'May'])
    expect(mesesDelPeriodo('rango', { desde: '2025-11-30', hasta: '2026-02-01' }, AHORA).map((x) => x.etiqueta)).toEqual(['Nov 25', 'Dic 25', 'Ene 26', 'Feb 26'])
  })
  it('rango inválido → ninguna barra (y la pantalla muestra el motivo)', () => {
    expect(mesesDelPeriodo('rango', { desde: '2026-05-02', hasta: '2026-03-10' }, AHORA)).toEqual([])
    expect(mesesDelPeriodo('rango', { desde: '', hasta: '' }, AHORA)).toEqual([])
  })
  it('sin saltos ni duplicados cerca de fin de mes (31 de marzo, 31 de enero)', () => {
    for (const hoy of [new Date(2026, 2, 31), new Date(2026, 0, 31), new Date(2026, 11, 31)]) {
      const ms = mesesDelPeriodo('12m', {}, hoy)
      expect(new Set(ms.map((x) => x.clave)).size).toBe(12)
      for (let i = 1; i < ms.length; i++) expect(ms[i].inicio.getTime()).toBe(ms[i - 1].fin.getTime())
    }
  })
  it('cada mes es [inicio, fin) contiguo y limitesDeMeses cubre todo', () => {
    const ms = mesesDelPeriodo('6m', {}, AHORA)
    expect(limitesDeMeses(ms)).toEqual({ desde: new Date(2026, 4, 1), hasta: new Date(2026, 10, 1) })
    expect(limitesDeMeses([])).toBeNull()
  })
})

describe('agruparPorMes', () => {
  const ms = mesesDelPeriodo('6m', {}, AHORA)
  it('suma por mes, ignora lo fuera del rango y respeta el valor por fila (reembolsos restan)', () => {
    const filas = [
      { f: new Date(2026, 9, 1, 0, 0, 0).toISOString(), monto: 100 },   // 1 oct 00:00 local → Oct
      { f: new Date(2026, 8, 30, 23, 59, 59).toISOString(), monto: 50 }, // 30 sep 23:59 → Sep
      { f: new Date(2026, 9, 20).toISOString(), monto: -30 },
      { f: new Date(2025, 0, 1).toISOString(), monto: 999 },             // fuera
      { f: new Date(2026, 10, 1).toISOString(), monto: 999 }             // 1 nov: fuera
    ]
    const r = agruparPorMes(filas, 'f', ms, (x) => x.monto)
    expect(r.find((x) => x.mes === 'Oct').valor).toBe(70)
    expect(r.find((x) => x.mes === 'Sep').valor).toBe(50)
    expect(r.reduce((a, x) => a + x.valor, 0)).toBe(120)
    expect(r).toHaveLength(6)
  })
  it('sin filas: cada mes en 0 (la gráfica no se rompe)', () => {
    expect(agruparPorMes([], 'f', ms).every((x) => x.valor === 0)).toBe(true)
  })
})

describe('rangoRanking: mes, trimestre, año', () => {
  it('mes y año', () => {
    expect(rangoRanking('mes', AHORA)).toEqual({ desde: new Date(2026, 9, 1), hasta: new Date(2026, 10, 1) })
    expect(rangoRanking('anio', AHORA)).toEqual({ desde: new Date(2026, 0, 1), hasta: new Date(2027, 0, 1) })
  })
  it('trimestre: octubre → T4 (oct–dic); marzo → T1; abril → T2; diciembre cierra en enero del año siguiente', () => {
    expect(rangoRanking('trimestre', AHORA)).toEqual({ desde: new Date(2026, 9, 1), hasta: new Date(2027, 0, 1) })
    expect(rangoRanking('trimestre', new Date(2026, 2, 31))).toEqual({ desde: new Date(2026, 0, 1), hasta: new Date(2026, 3, 1) })
    expect(rangoRanking('trimestre', new Date(2026, 3, 1))).toEqual({ desde: new Date(2026, 3, 1), hasta: new Date(2026, 6, 1) })
    expect(rangoRanking('trimestre', new Date(2026, 11, 31))).toEqual({ desde: new Date(2026, 9, 1), hasta: new Date(2027, 0, 1) })
  })
  it('un período desconocido cae en "este mes"', () => {
    expect(rangoRanking('xyz', AHORA)).toEqual(rangoRanking('mes', AHORA))
  })
})

describe('estados de cita y porcentajes', () => {
  it('los 9 estados reales se clasifican; no asistió cuenta como cancelada; lo demás está pendiente', () => {
    expect(clasificarEstadoCita('completada')).toBe('completada')
    expect(clasificarEstadoCita('cancelada')).toBe('cancelada')
    expect(clasificarEstadoCita('no_asistio')).toBe('cancelada')
    for (const e of ['pendiente_confirmar', 'agendada', 'confirmada', 'en_espera', 'en_consulta', 'pausado']) expect(clasificarEstadoCita(e)).toBe('pendiente')
    expect(clasificarEstadoCita('algo_nuevo')).toBe('pendiente')
  })
  it('porcentajes enteros que SIEMPRE suman 100 (1/3 cada uno → 34, 33, 33)', () => {
    const r = conPorcentajes([{ valor: 1 }, { valor: 1 }, { valor: 1 }])
    expect(r.map((x) => x.porcentaje)).toEqual([34, 33, 33])
    for (const v of [[8, 1, 1], [7, 2, 1], [1, 1], [5, 0, 0], [3, 3, 3, 1], [99, 1], [1, 2, 4, 8, 16]]) {
      expect(conPorcentajes(v.map((valor) => ({ valor }))).reduce((a, x) => a + x.porcentaje, 0), JSON.stringify(v)).toBe(100)
    }
  })
  it('el ejemplo 80 / 10 / 10 sale exacto y sin datos todo es 0 (no NaN)', () => {
    expect(conPorcentajes([{ valor: 8 }, { valor: 1 }, { valor: 1 }]).map((x) => x.porcentaje)).toEqual([80, 10, 10])
    expect(conPorcentajes([{ valor: 0 }, { valor: 0 }, { valor: 0 }]).map((x) => x.porcentaje)).toEqual([0, 0, 0])
    expect(conPorcentajes([]).length).toBe(0)
  })
})

describe('exportación CSV de los reportes', () => {
  it('cada reporte tiene encabezados en español y el CSV sale correcto', () => {
    const csv = aCsv(EXPORTACIONES.ingresos.columnas, [{ mes: 'Oct', ingresos: 1840 }, { mes: 'Sep', ingresos: 0 }])
    expect(csv.split('\r\n')).toEqual(['\uFEFFMes,Ingresos netos (MXN)', 'Oct,1840.00', 'Sep,0.00'])
    const c2 = aCsv(EXPORTACIONES.citasDelMes.columnas, [{ estado: 'Completadas', valor: 8, porcentaje: 80 }])
    expect(c2).toContain('Completadas,8,80%')
  })
  it('un nombre de tratamiento malicioso NO ejecuta fórmulas en Excel', () => {
    const csv = aCsv(EXPORTACIONES.tratamientos.columnas, [{ descripcion: '=HYPERLINK("http://x","clic")', cantidad: 3 }, { descripcion: '@SUM(1)', cantidad: 1 }])
    expect(csv).toContain(`"'=HYPERLINK(""http://x"",""clic"")",3`)
    expect(csv).toContain("'@SUM(1),1")
  })
  it('los 5 reportes exportables existen', () => {
    expect(Object.keys(EXPORTACIONES).sort()).toEqual(['citasDelMes', 'citasPorSemana', 'ingresos', 'pacientesNuevos', 'tratamientos'])
    for (const e of Object.values(EXPORTACIONES)) { expect(e.archivo).toMatch(/^[a-z-]+$/); expect(e.columnas.length).toBeGreaterThan(1) }
  })
  it('resumenFiltros describe lo aplicado (va a la bitácora de exportaciones)', () => {
    expect(resumenFiltros(FILTROS_INICIALES)).toMatchObject({ periodo: '6m', odontologo: 'todos', sucursal: 'todas', estado_tratamiento: 'todos' })
    expect(resumenFiltros({ ...FILTROS_INICIALES, periodo: 'rango', desde: '2026-01-01', hasta: '2026-03-01', dentistaId: 'd1' })).toMatchObject({ periodo: '2026-01-01 a 2026-03-01', odontologo: 'd1' })
  })
})

describe('servicios del dashboard: qué piden a la base', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(AHORA)
    m.registro.length = 0
    m.responder = () => ok([])
    m.from.mockReset().mockImplementation((t) => crearQueryMock(t, (tabla, ops) => m.responder(tabla, ops), m.registro))
    m.rpc.mockReset().mockResolvedValue({ data: [], error: null })
  })
  afterEach(() => vi.useRealTimers())
  const eqs = (ops) => ops.filter(([n]) => n === 'eq').map(([, a]) => a)

  it('LOS PAGOS ANULADOS NO SON INGRESO: ingresos del día/mes y pagos recientes los excluyen (igual que el saldo y el corte de caja)', async () => {
    await dash.obtenerIngresos(new Date(2026, 9, 1), new Date(2026, 10, 1))
    await dash.obtenerPagosRecientes()
    for (const r of m.registro) expect(llamada(r.operaciones, 'is')[1]).toEqual(['anulado_en', null])
    expect(m.registro).toHaveLength(2)
  })
  it('ingresos del período: suma neta (reembolsos restan)', async () => {
    m.responder = () => ok([{ monto: '1000', tipo: 'pago' }, { monto: '200', tipo: 'reembolso' }, { monto: '50', tipo: 'anticipo' }])
    expect(await dash.obtenerIngresos(new Date(2026, 9, 1), new Date(2026, 10, 1))).toBe(850)
  })
  it('ingresos por mes: pide de la 1.ª fecha al fin del último mes, sin anulados, y respeta la sucursal', async () => {
    const meses = mesesDelPeriodo('6m', {}, AHORA)
    await dash.obtenerIngresosPorMes({ meses, sucursalId: 's1' })
    const ops = m.registro[0].operaciones
    expect(m.registro[0].tabla).toBe('pagos')
    expect(llamada(ops, 'gte')[1]).toEqual(['creado_en', new Date(2026, 4, 1).toISOString()])
    expect(llamada(ops, 'lt')[1]).toEqual(['creado_en', new Date(2026, 10, 1).toISOString()])
    expect(llamada(ops, 'is')[1]).toEqual(['anulado_en', null])
    expect(eqs(ops)).toEqual([['sucursal_id', 's1']])
  })
  it('ingresos por mes sin sucursal no agrega filtro; sin meses (rango inválido) NO consulta', async () => {
    await dash.obtenerIngresosPorMes({ meses: mesesDelPeriodo('6m', {}, AHORA) })
    expect(eqs(m.registro[0].operaciones)).toEqual([])
    m.registro.length = 0
    expect(await dash.obtenerIngresosPorMes({ meses: [] })).toEqual([])
    expect(await dash.obtenerPacientesNuevosPorMes({ meses: [] })).toEqual([])
    expect(m.registro).toHaveLength(0)
  })
  it('ingresos por mes: el eje X y los montos salen de los datos (1,840 en octubre; 0 en el resto)', async () => {
    m.responder = () => ok([{ monto: '1840', tipo: 'pago', creado_en: new Date(2026, 9, 5).toISOString() }])
    const r = await dash.obtenerIngresosPorMes({ meses: mesesDelPeriodo('6m', {}, AHORA) })
    expect(r.map((x) => x.mes)).toEqual(['May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct'])
    expect(r.map((x) => x.ingresos)).toEqual([0, 0, 0, 0, 0, 1840])
  })
  it('MÁS DE 1,000 FILAS: lee por lotes y NO trunca (2,500 pagos de 10 → 25,000)', async () => {
    const todos = Array.from({ length: 2500 }, (_, i) => ({ monto: '10', tipo: 'pago', creado_en: new Date(2026, 9, 1 + (i % 28)).toISOString() }))
    m.responder = (t, ops) => { const [a, b] = llamada(ops, 'range')[1]; return ok(todos.slice(a, b + 1)) }
    const r = await dash.obtenerIngresosPorMes({ meses: mesesDelPeriodo('6m', {}, AHORA) })
    expect(r.at(-1).ingresos).toBe(25000)
    const rangos = m.registro.map((x) => llamada(x.operaciones, 'range')[1])
    expect(rangos).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })
  it('leerTodo: se detiene al recibir un lote incompleto, propaga errores y tiene tope', async () => {
    m.responder = () => ok(Array.from({ length: 1000 }, () => ({})))
    const filas = await dash.leerTodo(() => m.from('citas').select('x'))
    expect(filas.length).toBe(50000) // tope de seguridad: 50 lotes
    m.responder = () => ok(Array.from({ length: 999 }, () => ({})))
    expect((await dash.leerTodo(() => m.from('citas').select('x'))).length).toBe(999)
    m.responder = () => fallo('boom')
    await expect(dash.leerTodo(() => m.from('citas').select('x'))).rejects.toMatchObject({ message: 'boom' })
  })
  it('citas por semana: filtra por odontólogo y sucursal, y separa completadas / canceladas / pendientes', async () => {
    const lunes = new Date(2026, 9, 12, 9) // lunes 12 oct 2026 (semana en curso)
    m.responder = () => ok([
      { inicio: lunes.toISOString(), estado: 'completada' }, { inicio: lunes.toISOString(), estado: 'completada' },
      { inicio: lunes.toISOString(), estado: 'cancelada' }, { inicio: lunes.toISOString(), estado: 'no_asistio' },
      { inicio: lunes.toISOString(), estado: 'confirmada' }, { inicio: new Date(2025, 0, 1).toISOString(), estado: 'completada' }
    ])
    const r = await dash.obtenerCitasPorSemana({ semanas: 4, dentistaId: 'd1', sucursalId: 's1' })
    expect(r).toHaveLength(4)
    expect(r.at(-1)).toMatchObject({ completadas: 2, canceladas: 2, pendientes: 1 })
    expect(r.slice(0, 3).every((s) => s.completadas + s.canceladas + s.pendientes === 0)).toBe(true)
    expect(eqs(m.registro[0].operaciones)).toEqual([['dentista_id', 'd1'], ['sucursal_id', 's1']])
  })
  it('citas del mes: porcentajes que suman 100 y las cuentas salen de los datos', async () => {
    m.responder = () => ok([...Array(8).fill({ estado: 'completada' }), { estado: 'cancelada' }, { estado: 'agendada' }])
    const r = await dash.obtenerCitasDelMes()
    expect(r.map((x) => [x.estado, x.valor, x.porcentaje])).toEqual([['Completadas', 8, 80], ['Canceladas', 1, 10], ['Pendientes', 1, 10]])
  })
  it('citas del mes sin datos: ceros y 0 % (no NaN)', async () => {
    const r = await dash.obtenerCitasDelMes()
    expect(r.every((x) => x.valor === 0 && x.porcentaje === 0)).toBe(true)
  })
  it('tratamientos: manda período, estado y odontólogo a la función SQL (nulos si no hay filtro) y convierte la cantidad', async () => {
    m.rpc.mockResolvedValue({ data: [{ descripcion: 'Limpieza dental', cantidad: '12' }], error: null })
    expect(await dash.obtenerTratamientosMasRealizados({ periodo: 'trimestre', estado: 'completado', dentistaId: 'd1', limite: 5 })).toEqual([{ descripcion: 'Limpieza dental', cantidad: 12 }])
    expect(m.rpc).toHaveBeenLastCalledWith('fn_tratamientos_mas_realizados', {
      p_limite: 5, p_desde: new Date(2026, 9, 1).toISOString(), p_hasta: new Date(2027, 0, 1).toISOString(), p_estado: 'completado', p_dentista: 'd1'
    })
    await dash.obtenerTratamientosMasRealizados()
    expect(m.rpc).toHaveBeenLastCalledWith('fn_tratamientos_mas_realizados', expect.objectContaining({ p_estado: null, p_dentista: null, p_desde: new Date(2026, 9, 1).toISOString() }))
  })
  it('un error de la base se propaga (la pantalla muestra un mensaje; no cifras falsas)', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: 'rls' } })
    await expect(dash.obtenerTratamientosMasRealizados()).rejects.toMatchObject({ message: 'rls' })
    m.responder = () => fallo('boom')
    await expect(dash.obtenerCitasDelMes()).rejects.toMatchObject({ message: 'boom' })
  })
  it('pacientes nuevos: cuenta los creados en cada mes desde la vista segura de la clínica', async () => {
    m.responder = () => ok([{ creado_en: new Date(2026, 9, 3).toISOString() }, { creado_en: new Date(2026, 9, 9).toISOString() }, { creado_en: new Date(2026, 7, 9).toISOString() }])
    const r = await dash.obtenerPacientesNuevosPorMes({ meses: mesesDelPeriodo('6m', {}, AHORA) })
    expect(m.registro[0].tabla).toBe('v_pacientes_seguro')
    expect(r.find((x) => x.mes === 'Oct').pacientes).toBe(2)
    expect(r.find((x) => x.mes === 'Ago').pacientes).toBe(1)
    expect(r.reduce((a, x) => a + x.pacientes, 0)).toBe(3)
  })
})

describe('barra de filtros', () => {
  const html = (p) => renderToStaticMarkup(h(FiltrosReportes, { filtros: FILTROS_INICIALES, onCambiar: () => {}, onLimpiar: () => {}, ...p }))
  it('muestra período, semanas, ranking de tratamientos (con los 6 estados reales) y "Limpiar filtros"', () => {
    const r = html({})
    for (const t of ['Últimos 6 meses', 'Últimos 12 meses', 'Año actual', 'Rango personalizado', 'Últimas 8 semanas', 'Este trimestre', 'Limpiar filtros']) expect(r).toContain(t)
    for (const e of ['Planeado', 'Aceptado', 'En progreso', 'Pausado', 'Completado', 'Cancelado']) expect(r).toContain(e)
  })
  it('el rango personalizado muestra las dos fechas; si no, no', () => {
    expect(html({})).not.toContain('type="date"')
    const r = html({ filtros: { ...FILTROS_INICIALES, periodo: 'rango', desde: '2026-01-01', hasta: '2026-02-01' } })
    expect(r.match(/type="date"/g)).toHaveLength(2)
  })
  it('odontólogo solo para quien puede elegirlo; sucursal solo si hay más de una', () => {
    expect(html({ puedeElegirDentista: false, dentistas: [{ id: 'd', nombre: 'Dra. Ana' }] })).not.toContain('Odontólogo')
    const r = html({ puedeElegirDentista: true, dentistas: [{ id: 'd', nombre: 'Dra. Ana' }] })
    expect(r).toContain('Odontólogo')
    expect(r).toContain('Dra. Ana')
    expect(html({ sucursales: [{ id: 's', nombre: 'Matriz' }] })).not.toContain('Sucursal')
    expect(html({ sucursales: [{ id: 's', nombre: 'Matriz' }, { id: 't', nombre: 'Norte' }] })).toContain('Norte')
  })
  it('un rango inválido muestra el motivo como alerta; sin error no hay alerta', () => {
    expect(html({ errorRango: 'La fecha inicial no puede ser posterior a la final.' })).toContain('role="alert"')
    expect(html({})).not.toContain('role="alert"')
  })
  it('avisa qué filtro no aplica a qué gráfica (no se promete lo que no se hace)', () => {
    expect(html({})).toMatch(/no aplica a ingresos.*no aplica a pacientes nuevos/)
  })
})
