// Odontograma 2D en pantallas táctiles: la pieza entera es el área de toque y sus caras se eligen en una vista ampliada.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createElement as h } from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { OdontogramaSvg } from '../OdontogramaSvg'
import { ModalDienteTactil } from '../ModalDienteTactil'
import { FILA_SUPERIOR, FILA_INFERIOR } from '../constantesOdontograma'

const pieza = (numero, estado = 'sano') => ({ id: `p${numero}`, numero_pieza: String(numero), estado, caras: [] })
const porNumero = Object.fromEntries([...FILA_SUPERIOR, ...FILA_INFERIOR].map((n) => [n, pieza(n)]))

function conPuntero(grueso) {
  globalThis.window = { matchMedia: () => ({ matches: grueso, addEventListener: () => {}, removeEventListener: () => {} }) }
}
afterEach(() => { delete globalThis.window })

describe('odontograma 2D táctil', () => {
  it('con el dedo: cada pieza tiene un área de toque que la selecciona entera, sin encimarse con la vecina', () => {
    conPuntero(true)
    const onSeleccionarDiente = vi.fn()
    let r
    act(() => { r = TestRenderer.create(h(OdontogramaSvg, { porNumero, onClickCara: vi.fn(), onClickDiente: vi.fn(), onSeleccionarDiente })) })
    const areas = r.root.findAll((n) => n.type === 'rect' && n.props.role === 'button')
    expect(areas).toHaveLength(32)
    // Separación: el área de una pieza termina antes de que empiece la siguiente (misma fila).
    const fila = areas.slice(0, 16).map((a) => [a.props.x, a.props.x + a.props.width])
    for (let i = 1; i < fila.length; i++) expect(fila[i][0]).toBeGreaterThan(fila[i - 1][1])
    act(() => { areas[0].props.onClick() })
    expect(onSeleccionarDiente).toHaveBeenCalledWith(porNumero[FILA_SUPERIOR[0]])
    // Más ancho mínimo en táctil (cada pieza ≈ 50 px) sin cambiar la proporción del dibujo.
    expect(r.root.findByType('svg').props.className).toContain('min-w-[880px]')
    expect(r.root.findByType('svg').props.viewBox).toBe('0 0 700 230')
  })

  it('con mouse: sin capas de toque; las caras y el número siguen funcionando como antes', () => {
    conPuntero(false)
    const onClickCara = vi.fn()
    let r
    act(() => { r = TestRenderer.create(h(OdontogramaSvg, { porNumero, onClickCara, onClickDiente: vi.fn(), onSeleccionarDiente: vi.fn() })) })
    expect(r.root.findAll((n) => n.type === 'rect' && n.props.role === 'button')).toHaveLength(0)
    const cara = r.root.findAll((n) => n.type === 'polygon')[0]
    act(() => { cara.props.onClick() })
    expect(onClickCara).toHaveBeenCalledTimes(1)
  })

  it('la vista ampliada tiene 5 caras grandes que se eligen con el dedo (o con teclado)', () => {
    const onElegirCara = vi.fn()
    let r
    act(() => { r = TestRenderer.create(h(ModalDienteTactil, { pieza: pieza(16), onCerrar: vi.fn(), onElegirCara, onEstadoGeneral: vi.fn() })) })
    const caras = r.root.findAll((n) => n.type === 'g' && n.props.role === 'button')
    expect(caras).toHaveLength(5)
    act(() => { caras.find((c) => /Oclusal/i.test(c.props['aria-label'])).props.onClick() })
    expect(onElegirCara).toHaveBeenCalledWith('oclusal')
    act(() => { caras[0].props.onKeyDown({ key: 'Enter', preventDefault() {} }) })
    expect(onElegirCara).toHaveBeenCalledTimes(2)
  })

  it('una pieza ausente no ofrece caras, solo su estado general', () => {
    let r
    act(() => { r = TestRenderer.create(h(ModalDienteTactil, { pieza: pieza(18, 'ausente'), onCerrar: vi.fn(), onElegirCara: vi.fn(), onEstadoGeneral: vi.fn() })) })
    expect(r.root.findAll((n) => n.type === 'g' && n.props.role === 'button')).toHaveLength(0)
  })
})
