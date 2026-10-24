// Formulario de plan del superadmin: guardar NO reenvía funcionalidades desactivadas del catálogo (082: roles,
// administracion_avanzada) — sa_set_plan_funcionalidades las rechaza y se perdía todo el guardado — y guarda los
// price de Stripe (114) solo si cambiaron.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'

const h = vi.hoisted(() => ({
  guardarPlan: vi.fn(async () => ({})), guardarFuncs: vi.fn(async () => {}), configurarStripe: vi.fn(async () => ({})),
  funcs: [], exito: vi.fn(), error: vi.fn(),
}))
vi.mock('../../../../services/planes', () => ({
  guardarPlan: h.guardarPlan,
  guardarFuncionalidadesDePlan: h.guardarFuncs,
  configurarStripePlan: h.configurarStripe,
  funcionalidadesDePlan: vi.fn(async () => h.funcs),
}))
vi.mock('../../../../store/useToastStore', () => ({ toastExito: h.exito, toastError: h.error }))

import { FormularioPlan } from '../../../planes/FormularioPlan.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const f = (codigo, extra = {}) => ({ codigo, nombre: codigo, categoria: 'clinica', aplicacion: 'interfaz', nucleo: false, activo: true, habilitada: true, ...extra })
const PLAN = {
  plan: 'p1', nombre: 'Plan 1', descripcion: '', precio_mensual: 100, precio_anual: 1000, moneda: 'MXN', permite_mensual: true, permite_anual: true,
  activo: true, visible: true, recomendado: false, orden: 1, max_pacientes: 10, max_usuarios: 1, limite_sucursales: 1, limite_sesiones_simultaneas: 1,
  max_almacenamiento_mb: null, stripe_price_mensual: 'price_M', stripe_price_anual: null,
}

async function montarYGuardar(cambiar) {
  let r
  await act(async () => { r = TestRenderer.create(React.createElement(FormularioPlan, { abierto: true, onCerrar: () => {}, plan: PLAN, pestanaInicial: 'precios' })) })
  if (cambiar) await act(async () => cambiar(r))
  const boton = r.root.findAll((n) => n.props.children === 'Guardar plan' && typeof n.props.onClick === 'function')[0]
  await act(async () => { await boton.props.onClick() })
  return r
}

beforeEach(() => {
  Object.values(h).forEach((v) => typeof v?.mockClear === 'function' && v.mockClear())
  h.funcs = [f('agenda', { nucleo: true }), f('recetas'), f('pagos', { habilitada: false }), f('roles', { activo: false }), f('administracion_avanzada', { activo: false, habilitada: false })]
})

describe('FormularioPlan — guardar', () => {
  it('no reenvía las funcionalidades desactivadas ni las del núcleo; manda las activas con su estado', async () => {
    await montarYGuardar()
    expect(h.error).not.toHaveBeenCalled()
    expect(h.guardarFuncs).toHaveBeenCalledWith('p1', { recetas: true, pagos: false })
  })
  it('sin cambios en los price de Stripe no llama a sa_configurar_stripe_plan', async () => {
    await montarYGuardar()
    expect(h.configurarStripe).not.toHaveBeenCalled()
  })
  it('con un price nuevo lo guarda (recortado; vacío = null)', async () => {
    await montarYGuardar((r) => {
      const inputs = r.root.findAll((n) => n.type === 'input' && n.props.placeholder === 'price_…')
      inputs[1].props.onChange({ target: { value: '  price_A  ' } })
    })
    expect(h.configurarStripe).toHaveBeenCalledWith('p1', 'price_M', 'price_A')
  })
})
