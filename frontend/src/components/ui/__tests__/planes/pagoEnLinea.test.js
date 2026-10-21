// Pago en línea con Stripe (migración 114): servicios y pantalla del owner. La lógica de cobro REAL (precio desde la base,
// idempotencia, renovación, cancelación) la prueban supabase/tests/cobro_stripe_test.sql y _shared/stripe-logica.test.ts.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { MemoryRouter } from 'react-router-dom'

const h = vi.hoisted(() => ({ rpc: vi.fn(), invocar: vi.fn(), cargarPlan: vi.fn() }))
vi.mock('../../../../lib/supabase', () => ({ supabase: { rpc: h.rpc, from: vi.fn(), auth: {} }, invocarFuncionAutenticada: h.invocar }))
vi.mock('../../../../store/usePlanStore', () => {
  const usePlanStore = (sel) => sel({ cargar: h.cargarPlan })
  return { usePlanStore }
})

import { abrirPortalDePago, iniciarPagoEnLinea, obtenerMiCobro } from '../../../../services/planes.js'
import { PagoEnLinea } from '../../../planes/PagoEnLinea.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const texto = (r) => JSON.stringify(r.toJSON())
const plan = (codigo, nombre, mensual, anual) => ({ codigo, nombre, precio_mensual: 100, precio_anual: 1000, moneda: 'MXN', pago_mensual: mensual, pago_anual: anual })
const cobroBase = { disponible: true, tiene_cliente: false, pago_automatico: false, suspendida: false, planes: [plan('a', 'Plan A', true, true), plan('b', 'Plan B', true, false), plan('c', 'Plan C', false, false)], pagos: [] }

async function montar(cobro, ruta = '/configuracion') {
  h.rpc.mockResolvedValue({ data: cobro, error: null })
  let r
  await act(async () => { r = TestRenderer.create(React.createElement(MemoryRouter, { initialEntries: [ruta] }, React.createElement(PagoEnLinea))) })
  return r
}

beforeEach(() => {
  h.rpc.mockReset(); h.invocar.mockReset(); h.cargarPlan.mockReset()
  globalThis.window = globalThis.window ?? {}
  window.location = { assign: vi.fn() }
})

describe('services/planes — pago en línea', () => {
  it('obtenerMiCobro llama a mi_cobro', async () => {
    h.rpc.mockResolvedValue({ data: { disponible: true }, error: null })
    expect(await obtenerMiCobro()).toEqual({ disponible: true })
    expect(h.rpc).toHaveBeenCalledWith('mi_cobro', undefined)
  })
  it('iniciarPagoEnLinea manda SOLO plan y modalidad (el precio lo decide el servidor) y exige una URL de checkout.stripe.com', async () => {
    h.invocar.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_1' })
    expect(await iniciarPagoEnLinea('a', 'mensual')).toBe('https://checkout.stripe.com/c/pay/cs_1')
    expect(h.invocar).toHaveBeenCalledWith('stripe-checkout', { body: { plan: 'a', modalidad: 'mensual' } })
    h.invocar.mockResolvedValue({ url: 'https://malicioso.example/pay' })
    await expect(iniciarPagoEnLinea('a', 'mensual')).rejects.toThrow(/válida/)
  })
  it('configurarStripePlan (superadmin) llama a sa_configurar_stripe_plan', async () => {
    h.rpc.mockResolvedValue({ data: { plan: 'a' }, error: null })
    const { configurarStripePlan } = await import('../../../../services/planes.js')
    await configurarStripePlan('a', 'price_M', null)
    expect(h.rpc).toHaveBeenCalledWith('sa_configurar_stripe_plan', { p_plan: 'a', p_price_mensual: 'price_M', p_price_anual: null })
  })
  it('abrirPortalDePago exige una URL de billing.stripe.com', async () => {
    h.invocar.mockResolvedValue({ url: 'https://billing.stripe.com/p/session/1' })
    expect(await abrirPortalDePago()).toBe('https://billing.stripe.com/p/session/1')
    expect(h.invocar).toHaveBeenCalledWith('stripe-portal', { body: {} })
    h.invocar.mockResolvedValue({ url: 'javascript:alert(1)' })
    await expect(abrirPortalDePago()).rejects.toThrow(/portal/)
  })
})

describe('pantalla PagoEnLinea', () => {
  it('sin planes pagables ni cliente de Stripe no se muestra nada', async () => {
    const r = await montar({ ...cobroBase, disponible: false })
    expect(r.toJSON()).toBeNull()
  })
  it('lista solo las modalidades que se pueden pagar en línea (precios de la base) y paga la elegida', async () => {
    h.invocar.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_9' })
    const r = await montar(cobroBase)
    const opciones = r.root.findAllByType('option').map((o) => o.props.value)
    expect(opciones).toEqual(['a|mensual', 'a|anual', 'b|mensual'])
    await act(async () => { r.root.findByType('select').props.onChange({ target: { value: 'b|mensual' } }) })
    const boton = r.root.findAllByType('button').find((b) => texto({ toJSON: () => b.props.children }).includes('Pagar con tarjeta'))
    await act(async () => { await boton.props.onClick() })
    expect(h.invocar).toHaveBeenCalledWith('stripe-checkout', { body: { plan: 'b', modalidad: 'mensual' } })
    expect(window.location.assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_9')
  })
  it('con pago automático activo no ofrece volver a pagar; ofrece Administrar pago e historial con recibo', async () => {
    const r = await montar({ ...cobroBase, tiene_cliente: true, pago_automatico: true,
      pagos: [{ estado: 'pagado', monto: 100, moneda: 'MXN', periodo_inicio: '2026-10-01', periodo_fin: '2026-11-01', url_comprobante: 'https://invoice.stripe.com/i/1', fecha: '2026-10-01T10:00:00Z' }] })
    const t = texto(r)
    expect(t).not.toContain('Pagar con tarjeta')
    expect(t).toContain('Administrar pago')
    expect(t).toContain('Historial de pagos')
    expect(r.root.findByType('a').props.rel).toBe('noopener noreferrer')
  })
  it('clínica suspendida: sin botones de pago', async () => {
    const t = texto(await montar({ ...cobroBase, tiene_cliente: true, suspendida: true }))
    expect(t).not.toContain('Pagar con tarjeta')
    expect(t).not.toContain('Administrar pago')
    expect(t).toContain('suspendida')
  })
  it('un error de Stripe se muestra y no redirige', async () => {
    h.invocar.mockRejectedValue(new Error('Ese plan no está disponible.'))
    const r = await montar(cobroBase)
    const boton = r.root.findAllByType('button').find((b) => texto({ toJSON: () => b.props.children }).includes('Pagar con tarjeta'))
    await act(async () => { await boton.props.onClick() })
    expect(texto(r)).toContain('Ese plan no está disponible.')
    expect(window.location.assign).not.toHaveBeenCalled()
  })
  it('al volver de Stripe con ?pago=exito avisa y vuelve a leer el plan', async () => {
    vi.useFakeTimers()
    const r = await montar(cobroBase, '/configuracion?pago=exito')
    expect(texto(r)).toContain('Pago recibido')
    await act(async () => { vi.advanceTimersByTime(4100) })
    expect(h.cargarPlan).toHaveBeenCalled()
    vi.useRealTimers()
  })
})
