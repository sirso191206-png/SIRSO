// useOdontograma con un renderizador REAL de React: carga inicial vs. refresco, respuestas tardías de otro paciente,
// errores y reintentos. Esto es lo que antes destruía el <Canvas> 3D en cada guardado y podía pintar el odontograma
// del paciente anterior sobre el nuevo.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createElement as h } from 'react'
import TestRenderer, { act } from 'react-test-renderer'

const m = vi.hoisted(() => ({ obtener: vi.fn(), pendientes: vi.fn() }))
vi.mock('../../../lib/supabase', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), auth: { onAuthStateChange: vi.fn() }, channel: vi.fn(), removeChannel: vi.fn() } }))
vi.mock('../../../services/odontograma', () => ({
  obtenerOdontogramaCompleto: (...a) => m.obtener(...a), actualizarPiezaOdontograma: vi.fn(), actualizarCara: vi.fn(),
  construirCambiosPieza: (c) => c
}))
vi.mock('../../../lib/colaOffline', () => ({ encolarOperacion: vi.fn(), listarOperacionesPendientes: (...a) => m.pendientes(...a) }))
// Los reintentos se hacen de verdad, pero sin esperar los segundos de la espera creciente.
vi.mock('../../../lib/reintento', async (importar) => {
  const real = await importar()
  return { conReintentos: (op, o) => real.conReintentos(op, { ...o, esperar: async () => {} }) }
})

import { useOdontograma } from '../../../hooks/useOdontograma.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const piezasDe = (id) => [{ id: `${id}-11`, numero_pieza: '11', paciente_id: id, estado: 'sano', caras: [] }]
const diferido = () => { let ok, ko; const p = new Promise((a, b) => { ok = a; ko = b }); return { p, ok, ko } }
const vaciar = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

function montar(idInicial, opciones) {
  const vistos = []
  let ultimo
  function Sonda({ id }) { const v = useOdontograma(id, opciones); ultimo = v; vistos.push({ id, cargando: v.cargando, n: v.piezas.length, error: v.error }); return null }
  let r
  act(() => { r = TestRenderer.create(h(Sonda, { id: idInicial })) })
  return { vistos, get v() { return ultimo }, cambiar: (id) => act(() => { r.update(h(Sonda, { id })) }), desmontar: () => act(() => { r.unmount() }) }
}

describe('useOdontograma', () => {
  beforeEach(() => { m.obtener.mockReset(); m.pendientes.mockReset().mockResolvedValue([]); vi.spyOn(console, 'error').mockImplementation(() => {}) })
  afterEach(() => vi.restoreAllMocks())

  it('carga inicial: "cargando" hasta que llegan las piezas', async () => {
    m.obtener.mockImplementation(async (id) => piezasDe(id))
    const s = montar('A')
    expect(s.v.cargando).toBe(true)
    await vaciar()
    expect(s.v.cargando).toBe(false)
    expect(s.v.piezas).toHaveLength(1)
    expect(s.v.error).toBeNull()
  })

  it('UN REFRESCO NO VUELVE A PONER "cargando" (antes cada guardado desmontaba el 3D completo)', async () => {
    m.obtener.mockImplementation(async (id) => piezasDe(id))
    const s = montar('A'); await vaciar()
    const hasta = s.vistos.length
    await act(async () => { await s.v.recargar() })
    await act(async () => { await s.v.recargar() })
    expect(s.vistos.slice(hasta).every((x) => x.cargando === false)).toBe(true)
    expect(s.v.piezas).toHaveLength(1)
    expect(m.obtener).toHaveBeenCalledTimes(3)
  })

  it('CAMBIO DE PACIENTE: se descartan al instante las piezas del anterior (nunca se muestra el odontograma de otra persona)', async () => {
    m.obtener.mockImplementation(async (id) => piezasDe(id))
    const s = montar('A'); await vaciar()
    expect(s.v.piezas[0].paciente_id).toBe('A')
    m.obtener.mockImplementation(() => new Promise(() => {})) // B tarda
    s.cambiar('B')
    expect(s.v.cargando).toBe(true)
    expect(s.v.piezas).toEqual([])
  })

  it('UNA RESPUESTA TARDÍA DEL PACIENTE ANTERIOR NO PISA AL NUEVO', async () => {
    const lentoA = diferido(), rapidoB = diferido()
    m.obtener.mockImplementation((id) => (id === 'A' ? lentoA.p : rapidoB.p))
    const s = montar('A'); s.cambiar('B')
    await act(async () => { rapidoB.ok(piezasDe('B')); await new Promise((r) => setTimeout(r, 0)) })
    expect(s.v.piezas[0].paciente_id).toBe('B')
    await act(async () => { lentoA.ok(piezasDe('A')); await new Promise((r) => setTimeout(r, 0)) }) // llega tarde
    expect(s.v.piezas[0].paciente_id).toBe('B')
    expect(s.v.cargando).toBe(false)
  })

  it('un refresco superado por otro más nuevo se ignora (gana el último)', async () => {
    const viejo = diferido(), nuevo = diferido()
    m.obtener.mockImplementationOnce(async (id) => piezasDe(id)).mockImplementationOnce(() => viejo.p).mockImplementationOnce(() => nuevo.p)
    const s = montar('A'); await vaciar()
    let p1, p2
    await act(async () => { p1 = s.v.recargar(); p2 = s.v.recargar(); nuevo.ok([{ ...piezasDe('A')[0], estado: 'caries' }]); await p2 })
    await act(async () => { viejo.ok([{ ...piezasDe('A')[0], estado: 'sano' }]); await p1 })
    expect(s.v.piezas[0].estado).toBe('caries')
  })

  it('un fallo de RED se reintenta (3 intentos) y, si sigue, queda un error legible — nunca "Cargando…" para siempre', async () => {
    m.obtener.mockRejectedValue(Object.assign(new TypeError('Failed to fetch')))
    const s = montar('A'); await vaciar(); await vaciar()
    expect(m.obtener).toHaveBeenCalledTimes(3)
    expect(s.v.cargando).toBe(false)
    expect(s.v.error).toMatch(/no hay conexión|tardó demasiado/i)
    expect(s.v.error).not.toMatch(/TypeError|Failed to fetch/)
    expect(s.v.piezas).toEqual([])
  })

  it('un 503 del servidor se reintenta y se recupera si el servicio vuelve', async () => {
    m.obtener.mockRejectedValueOnce({ message: 'Service Unavailable', status: 503 }).mockImplementation(async (id) => piezasDe(id))
    const s = montar('A'); await vaciar(); await vaciar()
    expect(m.obtener).toHaveBeenCalledTimes(2)
    expect(s.v.error).toBeNull()
    expect(s.v.piezas).toHaveLength(1)
  })

  it('un error DEFINITIVO (permisos) NO se reintenta', async () => {
    m.obtener.mockRejectedValue({ message: 'permission denied', code: '42501' })
    const s = montar('A'); await vaciar()
    expect(m.obtener).toHaveBeenCalledTimes(1)
    expect(s.v.error).toBe('No se pudo cargar el odontograma.')
  })

  it('si un REFRESCO falla, se conservan las piezas que ya se veían y se informa el error', async () => {
    m.obtener.mockImplementationOnce(async (id) => piezasDe(id)).mockRejectedValue({ message: 'permission denied', code: '42501' })
    const s = montar('A'); await vaciar()
    await act(async () => { await s.v.recargar() })
    expect(s.v.piezas).toHaveLength(1)
    expect(s.v.error).toMatch(/No se pudo cargar/)
    expect(s.v.cargando).toBe(false)
  })

  it('un refresco exitoso limpia el error', async () => {
    m.obtener.mockRejectedValueOnce({ message: 'x', code: '42501' }).mockImplementation(async (id) => piezasDe(id))
    const s = montar('A'); await vaciar()
    expect(s.v.error).toBeTruthy()
    await act(async () => { await s.v.recargar() })
    expect(s.v.error).toBeNull()
    expect(s.v.piezas).toHaveLength(1)
  })

  it('habilitado:false no pide nada; al habilitarse, sí (el padre comparte los datos con 2D y 3D)', async () => {
    m.obtener.mockImplementation(async (id) => piezasDe(id))
    let activo = false
    function Sonda() { useOdontograma('A', { habilitado: activo }); return null }
    let r; act(() => { r = TestRenderer.create(h(Sonda)) }); await vaciar()
    expect(m.obtener).not.toHaveBeenCalled()
    activo = true; await act(async () => { r.update(h(Sonda)); await new Promise((x) => setTimeout(x, 0)) })
    expect(m.obtener).toHaveBeenCalledTimes(1)
  })

  it('un paciente con id offline no consulta al servidor: muestra el odontograma en blanco con 32 piezas', async () => {
    const s = montar('offline-paciente-123'); await vaciar()
    expect(m.obtener).not.toHaveBeenCalled()
    expect(s.v.piezas).toHaveLength(32)
    expect(s.v.cargando).toBe(false)
  })

  it('si la pantalla se desmonta con una petición en vuelo, no pasa nada al llegar la respuesta', async () => {
    const d = diferido(); m.obtener.mockImplementation(() => d.p)
    const s = montar('A'); s.desmontar()
    await act(async () => { d.ok(piezasDe('A')); await new Promise((r) => setTimeout(r, 0)) })
    expect(console.error).not.toHaveBeenCalled()
  })
})
