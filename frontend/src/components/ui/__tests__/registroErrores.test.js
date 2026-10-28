// Registro de errores del navegador (migración 116). La seguridad REAL (solo superadmin lee; límite por hora) la prueba
// supabase/tests/registro_errores_test.sql; aquí, qué se envía y qué no.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ rpc: vi.fn(async () => ({ data: null, error: null })) }))
vi.mock('../../../lib/supabase', () => ({ supabase: { rpc: h.rpc } }))
import { _reiniciarRegistroErrores, instalarCapturaDeErrores, registrarErrorCliente, rutaSinIdentificadores } from '../../../lib/registroErrores.js'

const ID = '11111111-2222-3333-4444-555555555555'
beforeEach(() => {
  h.rpc.mockClear(); _reiniciarRegistroErrores()
  globalThis.window = { location: { pathname: `/pacientes/${ID}` } }
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
})

describe('registrarErrorCliente', () => {
  it('envía mensaje, pila y ruta SIN identificadores (privacidad)', () => {
    const e = new Error(`falló el paciente ${ID}`)
    registrarErrorCliente(e, 'contexto')
    const [nombre, p] = h.rpc.mock.calls[0]
    expect(nombre).toBe('fn_registrar_error_cliente')
    expect(p.p_ruta).toBe('/pacientes/:id')
    expect(p.p_mensaje).toBe('falló el paciente :id')
    expect(p.p_detalle).toContain('contexto')
    expect(p.p_detalle).not.toContain(ID)
  })
  it('no repite el mismo error y como máximo 10 por pestaña', () => {
    registrarErrorCliente(new Error('igual')); registrarErrorCliente(new Error('igual'))
    expect(h.rpc).toHaveBeenCalledTimes(1)
    for (let i = 0; i < 20; i++) registrarErrorCliente(new Error(`e${i}`))
    expect(h.rpc).toHaveBeenCalledTimes(10)
  })
  it('ignora ruido (red caída, ResizeObserver) y no envía sin conexión', () => {
    registrarErrorCliente(new TypeError('Failed to fetch'))
    registrarErrorCliente('ResizeObserver loop limit exceeded')
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true })
    registrarErrorCliente(new Error('real pero sin red'))
    expect(h.rpc).not.toHaveBeenCalled()
  })
  it('si el registro falla, no lanza', () => {
    h.rpc.mockImplementationOnce(() => { throw new Error('boom') })
    expect(() => registrarErrorCliente(new Error('x'))).not.toThrow()
  })
  it('rutaSinIdentificadores', () => {
    expect(rutaSinIdentificadores(`/consulta/${ID}`)).toBe('/consulta/:id')
  })
})

describe('instalarCapturaDeErrores', () => {
  it('escucha errores no capturados y promesas rechazadas', () => {
    const oyentes = {}
    instalarCapturaDeErrores({ addEventListener: (t, f) => { oyentes[t] = f } })
    oyentes.error({ error: new Error('no capturado') })
    oyentes.unhandledrejection({ reason: new Error('promesa') })
    expect(h.rpc.mock.calls.map((c) => c[1].p_mensaje)).toEqual(['no capturado', 'promesa'])
  })
})
