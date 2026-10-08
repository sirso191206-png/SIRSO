// Sucursales se oculta (menú y pantalla) cuando el plan no la incluye y la clínica no tiene ninguna.
// Solo interfaz: la base de datos rechaza crear sucursales sin la funcionalidad.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'

const m = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    rpc: m.rpc, auth: { onAuthStateChange: vi.fn(), getSession: vi.fn() }, channel: vi.fn(() => ({ on: () => ({ subscribe: () => ({}) }) })), removeChannel: vi.fn(),
    from: vi.fn(() => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }), eq: () => Promise.resolve({ data: [], error: null }) }) }))
  }
}))
vi.mock('zustand', async (importarOriginal) => {
  const real = await importarOriginal()
  return {
    ...real,
    create: (inicial) => {
      const api = real.createStore(inicial)
      api.getServerState = api.getState
      const hook = (selector, igualdad) => real.useStore(api, selector, igualdad)
      Object.assign(hook, api)
      return hook
    }
  }
})

import { puedeVerSucursales } from '../../../../lib/planes.js'
import { usePlanStore } from '../../../../store/usePlanStore.js'
import { useAuthStore } from '../../../../store/useAuthStore.js'
import { RutaSucursales } from '../../../planes/RutaSucursales.jsx'
import { Sidebar } from '../../../layout/Sidebar.jsx'

const f = (codigo, habilitada) => ({ codigo, nombre: `Func ${codigo}`, categoria: 'x', habilitada })
const susc = ({ multisucursal, sucursales = 0, extra = {} }) => ({
  sin_suscripcion: false, plan: { codigo: 'p', nombre: 'Plan P' }, estado: 'activa', modalidad: 'mensual',
  limites: { pacientes: 500, usuarios: 3, sucursales: 1, sesiones: 1 }, uso: { pacientes: 1, usuarios: 1, sucursales },
  excesos: [], funcionalidades: [f('multisucursal', multisucursal), f('agenda', true), f('citas', true), f('pagos', true), f('caja', true), f('tratamientos', true), f('estadisticas', true)], ...extra
})
function conPlan(suscripcion, { superAdmin = false } = {}) {
  useAuthStore.setState({ perfil: { id: 'u1', clinica_id: 'c1', rol: 'owner', nombre: 'Dueño', es_super_admin: superAdmin }, clinicaNombre: 'Clínica X', session: { user: { id: 'u1' } } })
  usePlanStore.setState({ suscripcion, claveSuscripcion: 'u1:c1', cargada: true, cargando: false })
}
const render = (el) => renderToStaticMarkup(h(StaticRouter, { location: '/' }, el))

beforeEach(() => {
  useAuthStore.setState({ perfil: null })
  usePlanStore.getState().limpiar()
  m.rpc.mockReset()
})

describe('puedeVerSucursales', () => {
  it('el plan la incluye → sí, tenga o no sucursales', () => {
    expect(puedeVerSucursales(susc({ multisucursal: true, sucursales: 0 }))).toBe(true)
    expect(puedeVerSucursales(susc({ multisucursal: true, sucursales: 3 }))).toBe(true)
  })
  it('el plan NO la incluye y no hay ninguna sucursal → no (se oculta)', () => {
    expect(puedeVerSucursales(susc({ multisucursal: false, sucursales: 0 }))).toBe(false)
  })
  it('el plan NO la incluye pero la clínica ya tiene sucursales (bajó de plan) → sí: conserva el acceso para verlas y desactivarlas', () => {
    expect(puedeVerSucursales(susc({ multisucursal: false, sucursales: 1 }))).toBe(true)
  })
  it('ante la duda NO oculta: sin suscripción, clínica heredada, funcionalidad desconocida', () => {
    expect(puedeVerSucursales(null)).toBe(true)
    expect(puedeVerSucursales(undefined)).toBe(true)
    expect(puedeVerSucursales({ sin_suscripcion: true, funcionalidades: [f('multisucursal', false)], uso: { sucursales: 0 } })).toBe(true)
    expect(puedeVerSucursales({ sin_suscripcion: false, funcionalidades: [], uso: { sucursales: 0 } })).toBe(true)
  })
})

describe('menú lateral REAL: la entrada "Sucursales"', () => {
  it('plan sin sucursales y sin ninguna creada (Esencial) → NO aparece; el resto del menú sí', () => {
    conPlan(susc({ multisucursal: false, sucursales: 0 }))
    const html = render(h(Sidebar))
    expect(html).not.toContain('Sucursales')
    expect(html).toContain('Usuarios')
    expect(html).toContain('Configuración')
  })
  it('plan con sucursales (Clínica) → aparece', () => {
    conPlan(susc({ multisucursal: true, sucursales: 0 }))
    expect(render(h(Sidebar))).toContain('Sucursales')
  })
  it('al subir de plan la entrada vuelve; al bajar sin sucursales desaparece', () => {
    conPlan(susc({ multisucursal: false }))
    expect(render(h(Sidebar))).not.toContain('Sucursales')
    conPlan(susc({ multisucursal: true }))
    expect(render(h(Sidebar))).toContain('Sucursales')
    conPlan(susc({ multisucursal: false }))
    expect(render(h(Sidebar))).not.toContain('Sucursales')
  })
  it('bajó de plan pero ya tiene sucursales → sigue visible (no se le esconde lo que usa)', () => {
    conPlan(susc({ multisucursal: false, sucursales: 2 }))
    expect(render(h(Sidebar))).toContain('Sucursales')
  })
  it('sin suscripción cargada, el superadmin y la suscripción de OTRA cuenta: no se oculta', () => {
    useAuthStore.setState({ perfil: { id: 'u1', clinica_id: 'c1', rol: 'owner', nombre: 'D' }, clinicaNombre: 'C', session: { user: { id: 'u1' } } })
    expect(render(h(Sidebar))).toContain('Sucursales')
    conPlan(susc({ multisucursal: false }), { superAdmin: true })
    expect(render(h(Sidebar))).toContain('Sucursales')
    conPlan(susc({ multisucursal: false }))
    usePlanStore.setState({ claveSuscripcion: 'otro:otra' })
    expect(render(h(Sidebar))).toContain('Sucursales')
  })
})

describe('ruta /sucursales (protección de UX)', () => {
  const Pantalla = () => h('p', null, 'PANTALLA SUCURSALES')
  it('plan sin sucursales y sin ninguna: muestra "no disponible en tu plan" con "Mejorar plan", no la pantalla', () => {
    conPlan(susc({ multisucursal: false, sucursales: 0 }))
    const html = render(h(RutaSucursales, null, h(Pantalla)))
    expect(html).not.toContain('PANTALLA SUCURSALES')
    expect(html).toContain('Esta funcionalidad no está disponible en tu plan.')
    expect(html).toContain('Mejorar plan')
    expect(html).toContain('Func multisucursal')
  })
  it('con la funcionalidad, o con sucursales ya creadas, o sin plan cargado: entra', () => {
    conPlan(susc({ multisucursal: true }))
    expect(render(h(RutaSucursales, null, h(Pantalla)))).toContain('PANTALLA SUCURSALES')
    conPlan(susc({ multisucursal: false, sucursales: 1 }))
    expect(render(h(RutaSucursales, null, h(Pantalla)))).toContain('PANTALLA SUCURSALES')
    useAuthStore.setState({ perfil: { id: 'u1', clinica_id: 'c1', rol: 'owner' } })
    usePlanStore.getState().limpiar()
    expect(render(h(RutaSucursales, null, h(Pantalla)))).toContain('PANTALLA SUCURSALES')
  })
})
