import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { crearQueryMock, ok, sinRed } from './helpers/supabaseMock.js'

const supabaseMock = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('../../../../lib/supabase', () => ({ supabase: supabaseMock }))

import { conCacheDeLectura } from '../../../../lib/cacheLectura.js'
import { obtenerPaciente, buscarPacientesDetallado } from '../../../../services/pacientes.js'
import { obtenerExpediente, obtenerNotasClinicas, obtenerDiagnosticosFrecuentes } from '../../../../services/expedientes.js'
import { obtenerOdontogramaCompleto } from '../../../../services/odontograma.js'
import { obtenerPeriodontogramaCompleto } from '../../../../services/periodontograma.js'
import { obtenerCitaPorId } from '../../../../services/citas.js'
import { obtenerTratamientos } from '../../../../services/tratamientos.js'
import { obtenerRecetas } from '../../../../services/recetas.js'
import { obtenerSignosVitales } from '../../../../services/signosVitales.js'

// `red` controla lo que responde "Supabase": con internet devuelve
// datos; sin internet, un fallo de red — exactamente lo que ve el
// navegador cuando se corta la señal.
let red
function conInternet(data, extra) { red = () => ok(data, extra) }
function sinInternet() { red = () => sinRed() }

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  supabaseMock.from.mockReset()
  supabaseMock.from.mockImplementation((tabla) => crearQueryMock(tabla, () => red(), []))
})

describe('conCacheDeLectura — el mecanismo', () => {
  it('con internet devuelve el dato fresco y lo marca como NO proveniente de caché', async () => {
    const r = await conCacheDeLectura('k', async () => ({ a: 1 }))
    expect(r).toEqual({ datos: { a: 1 }, deCache: false, guardadoEn: null })
  })

  it('sin internet devuelve lo último guardado y AVISA que viene de caché', async () => {
    await conCacheDeLectura('k', async () => ({ a: 1 }))
    const r = await conCacheDeLectura('k', async () => { throw new Error('Failed to fetch') })

    expect(r.datos).toEqual({ a: 1 })
    expect(r.deCache).toBe(true)
    expect(typeof r.guardadoEn).toBe('number')
  })

  it('sin internet y sin nada guardado, falla de verdad — no inventa datos (sección 25)', async () => {
    await expect(conCacheDeLectura('nunca-visto', async () => { throw new Error('Failed to fetch') }))
      .rejects.toThrow('Failed to fetch')
  })

  it('una lista sigue siendo una lista al volver de caché (no se le mezclan campos)', async () => {
    await conCacheDeLectura('lista', async () => [1, 2, 3])
    const r = await conCacheDeLectura('lista', async () => { throw new Error('x') })
    expect(Array.isArray(r.datos)).toBe(true)
    expect(r.datos).toEqual([1, 2, 3])
  })

  it('cada clave es independiente: lo guardado de un paciente no se sirve para otro', async () => {
    await conCacheDeLectura('paciente:A', async () => ({ nombre: 'Ana' }))
    await expect(conCacheDeLectura('paciente:B', async () => { throw new Error('x') })).rejects.toThrow()
  })

  it('una lectura exitosa posterior REEMPLAZA lo guardado (no se queda con datos viejos)', async () => {
    await conCacheDeLectura('k', async () => ({ v: 1 }))
    await conCacheDeLectura('k', async () => ({ v: 2 }))
    const r = await conCacheDeLectura('k', async () => { throw new Error('x') })
    expect(r.datos).toEqual({ v: 2 })
  })
})

// Una fila por servicio clínico del flujo de consulta (sección 4).
const SERVICIOS = [
  ['paciente (#3)',        () => obtenerPaciente('p1'),              { id: 'p1', nombre_completo: 'Ana Pérez' }],
  ['expediente (#4)',      () => obtenerExpediente('p1'),            { id: 'e1', alergias: ['penicilina'] }],
  ['notas clínicas',       () => obtenerNotasClinicas('e1'),         [{ id: 'n1', contenido: 'Revisión' }]],
  ['odontograma (#5)',     () => obtenerOdontogramaCompleto('p1'),   [{ id: 'd11', numero_pieza: 11, caras: [] }]],
  ['periodontograma (#6)', () => obtenerPeriodontogramaCompleto('p1'), [{ id: 'q11', numero_pieza: 11, sitios: [] }]],
  ['cita (#7)',            () => obtenerCitaPorId('c1'),             { id: 'c1', motivo_consulta: 'Dolor' }],
  ['tratamientos',         () => obtenerTratamientos('p1'),          [{ id: 't1', descripcion: 'Resina' }]],
  ['recetas',              () => obtenerRecetas('p1'),               [{ id: 'r1', medicamentos: [] }]],
  ['signos vitales',       () => obtenerSignosVitales('p1'),         [{ id: 's1', peso: 70 }]]
]

describe('Leer sin internet lo que ya se vio con internet (pruebas #3–#7)', () => {
  it.each(SERVICIOS)('%s: tras perder la red, devuelve exactamente lo último que se vio', async (_n, leer, datos) => {
    conInternet(datos)
    const conRed = await leer()
    expect(conRed).toEqual(datos)

    sinInternet()
    const sinRedResultado = await leer()
    expect(sinRedResultado).toEqual(datos)
  })

  it.each(SERVICIOS)('%s: sin haberlo visto nunca y sin internet, falla — no inventa nada', async (_n, leer) => {
    sinInternet()
    await expect(leer()).rejects.toBeTruthy()
  })

  it('diagnósticos frecuentes: conserva la transformación (únicos, sin nulos) al volver de caché', async () => {
    conInternet([{ diagnostico: 'Caries' }, { diagnostico: 'Caries' }, { diagnostico: 'Gingivitis' }])
    expect(await obtenerDiagnosticosFrecuentes()).toEqual(['Caries', 'Gingivitis'])

    sinInternet()
    expect(await obtenerDiagnosticosFrecuentes()).toEqual(['Caries', 'Gingivitis'])
  })
})

describe('Lista de pacientes: la caché es por combinación exacta de filtros', () => {
  it('la búsqueda ya hecha sí se ve sin internet; una distinta que nunca se hizo, no', async () => {
    conInternet([], { count: 0 })
    const A = { termino: 'ana', filtroEstado: 'activos', pagina: 1 }
    await buscarPacientesDetallado(A)

    sinInternet()
    expect(await buscarPacientesDetallado(A)).toEqual({ pacientes: [], total: 0 })
    await expect(buscarPacientesDetallado({ ...A, termino: 'luis' })).rejects.toBeTruthy()
  })
})
