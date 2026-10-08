// "+ Nuevo usuario" y "+ Nueva sucursal" desaparecen cuando el plan ya no permite agregar más.
// RECORDATORIO: ocultar el botón es solo interfaz; la base de datos rechaza el alta de más.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'

const m = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../../../lib/supabase', () => ({
  supabase: { rpc: m.rpc, from: vi.fn(() => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) })), auth: { onAuthStateChange: vi.fn() }, channel: vi.fn(), removeChannel: vi.fn() }
}))
// zustand 4.5 usa el estado INICIAL como snapshot de servidor; aquí hace falta el ACTUAL. Solo en esta prueba.
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

import { evaluarAlta, mensajeAlta } from '../../../../lib/planes.js'
import { usePlanStore } from '../../../../store/usePlanStore.js'
import { useAuthStore } from '../../../../store/useAuthStore.js'
import { Usuarios } from '../../../../pages/Usuarios.jsx'
import { Sucursales } from '../../../../pages/Sucursales.jsx'

const f = (codigo, habilitada) => ({ codigo, nombre: codigo, categoria: 'x', habilitada })
const susc = ({ usuarios, sucursales = 0, limUsuarios, limSucursales = 1, multisucursal = false, extra = {} }) => ({
  sin_suscripcion: false, plan: { codigo: 'p', nombre: 'Plan P' }, estado: 'activa', modalidad: 'mensual',
  limites: { pacientes: 500, usuarios: limUsuarios, sucursales: limSucursales, sesiones: 1 },
  uso: { pacientes: 10, usuarios, sucursales }, excesos: [],
  funcionalidades: [f('multisucursal', multisucursal), f('pagos', true)], ...extra
})

describe('evaluarAlta: ¿se puede agregar uno más?', () => {
  it('USUARIOS, Esencial (1 de 1: solo el principal) → no', () => {
    expect(evaluarAlta(susc({ usuarios: 1, limUsuarios: 1 }), 'usuarios')).toMatchObject({ puede: false, motivo: 'limite', usado: 1, limite: 1 })
  })
  it('USUARIOS, Profesional (hasta 3): con 1 y con 2 sí; con 3 no (el límite es inclusivo); con más (bajó de plan) tampoco', () => {
    expect(evaluarAlta(susc({ usuarios: 1, limUsuarios: 3 }), 'usuarios').puede).toBe(true)
    expect(evaluarAlta(susc({ usuarios: 2, limUsuarios: 3 }), 'usuarios').puede).toBe(true)
    expect(evaluarAlta(susc({ usuarios: 3, limUsuarios: 3 }), 'usuarios').puede).toBe(false)
    expect(evaluarAlta(susc({ usuarios: 5, limUsuarios: 3 }), 'usuarios').puede).toBe(false)
  })
  it('ilimitado (null) siempre puede', () => {
    expect(evaluarAlta(susc({ usuarios: 500, limUsuarios: null }), 'usuarios').puede).toBe(true)
  })
  it('SUCURSALES sin la funcionalidad multisucursal → no, aunque haya cupo (Esencial/Profesional)', () => {
    expect(evaluarAlta(susc({ usuarios: 1, limUsuarios: 3, sucursales: 0, limSucursales: 1, multisucursal: false }), 'sucursales'))
      .toMatchObject({ puede: false, motivo: 'funcionalidad' })
  })
  it('SUCURSALES con multisucursal (Clínica, hasta 3): con 0, 1 y 2 sí; con 3 no', () => {
    for (const u of [0, 1, 2]) expect(evaluarAlta(susc({ usuarios: 1, limUsuarios: 10, sucursales: u, limSucursales: 3, multisucursal: true }), 'sucursales').puede).toBe(true)
    expect(evaluarAlta(susc({ usuarios: 1, limUsuarios: 10, sucursales: 3, limSucursales: 3, multisucursal: true }), 'sucursales')).toMatchObject({ puede: false, motivo: 'limite' })
  })
  it('ante la duda NO oculta: sin suscripción, clínica heredada, datos faltantes', () => {
    expect(evaluarAlta(null, 'usuarios').puede).toBe(true)
    expect(evaluarAlta(undefined, 'sucursales').puede).toBe(true)
    expect(evaluarAlta({ sin_suscripcion: true, limites: { usuarios: 1 }, uso: { usuarios: 9 } }, 'usuarios').puede).toBe(true)
    expect(evaluarAlta({ sin_suscripcion: false, limites: {}, uso: {}, funcionalidades: [] }, 'usuarios').puede).toBe(true)
    expect(evaluarAlta({ sin_suscripcion: false, limites: { usuarios: 1 }, uso: {}, funcionalidades: [] }, 'usuarios').puede).toBe(true)
  })
})

describe('mensajeAlta', () => {
  it('Esencial: explica que el plan incluye solo el usuario principal', () => {
    expect(mensajeAlta('usuarios', { motivo: 'limite', limite: 1 })).toBe('Tu plan incluye 1 usuario: el principal. Para agregar más, mejora tu plan.')
  })
  it('con tope mayor dice cuántos', () => {
    expect(mensajeAlta('usuarios', { motivo: 'limite', limite: 3 })).toMatch(/hasta 3 usuarios/)
    expect(mensajeAlta('sucursales', { motivo: 'limite', limite: 3 })).toMatch(/hasta 3 sucursales/)
  })
  it('sucursales sin la funcionalidad', () => {
    expect(mensajeAlta('sucursales', { motivo: 'funcionalidad' })).toBe('Tu plan no incluye sucursales. Para usarlas, mejora tu plan.')
  })
})

function conPlan(suscripcion, { rol = 'owner', superAdmin = false } = {}) {
  useAuthStore.setState({ perfil: { id: 'u1', clinica_id: 'c1', rol, es_super_admin: superAdmin } })
  usePlanStore.setState({ suscripcion, claveSuscripcion: 'u1:c1', cargada: true, cargando: false })
}
const pagina = (Pantalla) => renderToStaticMarkup(h(StaticRouter, { location: '/' }, h(Pantalla)))

beforeEach(() => {
  useAuthStore.setState({ perfil: null })
  usePlanStore.getState().limpiar()
  m.rpc.mockReset()
})

describe('pantalla de USUARIOS', () => {
  it('Esencial con su único usuario: NO hay "+ Nuevo usuario"; sí el motivo y "Mejorar plan"', () => {
    conPlan(susc({ usuarios: 1, limUsuarios: 1 }))
    const html = pagina(Usuarios)
    expect(html).not.toContain('+ Nuevo usuario')
    expect(html).toContain('Tu plan incluye 1 usuario: el principal.')
    expect(html).toContain('Mejorar plan')
  })
  it('Profesional con 2 de 3: SÍ hay botón; con 3 de 3 desaparece', () => {
    conPlan(susc({ usuarios: 2, limUsuarios: 3 }))
    expect(pagina(Usuarios)).toContain('+ Nuevo usuario')
    conPlan(susc({ usuarios: 3, limUsuarios: 3 }))
    const html = pagina(Usuarios)
    expect(html).not.toContain('+ Nuevo usuario')
    expect(html).toContain('hasta 3 usuarios')
  })
  it('al subir de plan el botón vuelve (Esencial → Profesional)', () => {
    conPlan(susc({ usuarios: 1, limUsuarios: 1 }))
    expect(pagina(Usuarios)).not.toContain('+ Nuevo usuario')
    conPlan(susc({ usuarios: 1, limUsuarios: 3 }))
    expect(pagina(Usuarios)).toContain('+ Nuevo usuario')
  })
  it('ilimitado, sin suscripción cargada, clínica heredada y superadmin: siempre hay botón', () => {
    conPlan(susc({ usuarios: 99, limUsuarios: null }))
    expect(pagina(Usuarios)).toContain('+ Nuevo usuario')
    useAuthStore.setState({ perfil: { id: 'u1', clinica_id: 'c1', rol: 'owner' } })
    usePlanStore.getState().limpiar()
    expect(pagina(Usuarios)).toContain('+ Nuevo usuario')
    conPlan({ sin_suscripcion: true, limites: { usuarios: 1 }, uso: { usuarios: 1 }, funcionalidades: [] })
    expect(pagina(Usuarios)).toContain('+ Nuevo usuario')
    conPlan(susc({ usuarios: 1, limUsuarios: 1 }), { superAdmin: true })
    expect(pagina(Usuarios)).toContain('+ Nuevo usuario')
  })
  it('el aislamiento sigue valiendo: la suscripción de OTRA cuenta no oculta ni muestra nada', () => {
    conPlan(susc({ usuarios: 1, limUsuarios: 1 }))
    usePlanStore.setState({ claveSuscripcion: 'otro:otra' })
    expect(pagina(Usuarios)).toContain('+ Nuevo usuario')
  })
})

describe('pantalla de SUCURSALES', () => {
  it('Esencial (sin multisucursal): NO hay "+ Nueva sucursal"; dice que el plan no las incluye', () => {
    conPlan(susc({ usuarios: 1, limUsuarios: 1, multisucursal: false }))
    const html = pagina(Sucursales)
    expect(html).not.toContain('+ Nueva sucursal')
    expect(html).toContain('Tu plan no incluye sucursales.')
    expect(html).toContain('Mejorar plan')
  })
  it('Profesional (límite 1 pero sin multisucursal): tampoco', () => {
    conPlan(susc({ usuarios: 2, limUsuarios: 3, sucursales: 0, limSucursales: 1, multisucursal: false }))
    expect(pagina(Sucursales)).not.toContain('+ Nueva sucursal')
  })
  it('Clínica (multisucursal, hasta 3): hay botón con 0, 1 y 2; con 3 desaparece y dice el límite', () => {
    for (const u of [0, 1, 2]) {
      conPlan(susc({ usuarios: 1, limUsuarios: 10, sucursales: u, limSucursales: 3, multisucursal: true }))
      expect(pagina(Sucursales)).toContain('+ Nueva sucursal')
    }
    conPlan(susc({ usuarios: 1, limUsuarios: 10, sucursales: 3, limSucursales: 3, multisucursal: true }))
    const html = pagina(Sucursales)
    expect(html).not.toContain('+ Nueva sucursal')
    expect(html).toContain('hasta 3 sucursales')
  })
  it('al darle multisucursal a un plan, el botón aparece', () => {
    conPlan(susc({ usuarios: 1, limUsuarios: 1, multisucursal: false }))
    expect(pagina(Sucursales)).not.toContain('+ Nueva sucursal')
    conPlan(susc({ usuarios: 1, limUsuarios: 1, sucursales: 0, limSucursales: 1, multisucursal: true }))
    expect(pagina(Sucursales)).toContain('+ Nueva sucursal')
  })
  it('sin suscripción cargada o clínica heredada: no se oculta', () => {
    useAuthStore.setState({ perfil: { id: 'u1', clinica_id: 'c1', rol: 'owner' } })
    expect(pagina(Sucursales)).toContain('+ Nueva sucursal')
    conPlan({ sin_suscripcion: true, limites: {}, uso: {}, funcionalidades: [f('multisucursal', false)] })
    expect(pagina(Sucursales)).toContain('+ Nueva sucursal')
  })
})

describe('el contador de uso se refresca tras un alta o baja (cargar con forzar)', () => {
  it('si ya hay una carga en curso, forzar pide OTRA al terminar (la primera pudo salir antes del cambio)', async () => {
    useAuthStore.setState({ perfil: { id: 'u1', clinica_id: 'c1', rol: 'owner' } })
    let resolver
    m.rpc.mockReturnValueOnce(new Promise((r) => { resolver = r }))
    m.rpc.mockResolvedValue({ data: susc({ usuarios: 2, limUsuarios: 3 }), error: null })
    const enVuelo = usePlanStore.getState().cargar()
    usePlanStore.getState().cargar({ forzar: true })   // se creó un usuario mientras tanto
    resolver({ data: susc({ usuarios: 1, limUsuarios: 3 }), error: null })
    await enVuelo
    expect(m.rpc).toHaveBeenCalledTimes(2)
    expect(usePlanStore.getState().suscripcion.uso.usuarios).toBe(2)
  })
  it('sin forzar, una carga simultánea sigue sin duplicar la petición', async () => {
    useAuthStore.setState({ perfil: { id: 'u1', clinica_id: 'c1', rol: 'owner' } })
    let resolver
    m.rpc.mockReturnValueOnce(new Promise((r) => { resolver = r }))
    const a = usePlanStore.getState().cargar()
    usePlanStore.getState().cargar()
    resolver({ data: susc({ usuarios: 1, limUsuarios: 3 }), error: null })
    await a
    expect(m.rpc).toHaveBeenCalledTimes(1)
  })
  it('limpiar() (cierre de sesión, cambio de cuenta) cancela la recarga pendiente', async () => {
    useAuthStore.setState({ perfil: { id: 'u1', clinica_id: 'c1', rol: 'owner' } })
    let resolver
    m.rpc.mockReturnValueOnce(new Promise((r) => { resolver = r }))
    const enVuelo = usePlanStore.getState().cargar()
    usePlanStore.getState().cargar({ forzar: true })
    usePlanStore.getState().limpiar()
    resolver({ data: susc({ usuarios: 1, limUsuarios: 3 }), error: null })
    await enVuelo
    expect(m.rpc).toHaveBeenCalledTimes(1)
    expect(usePlanStore.getState().suscripcion).toBeNull()
    // Y la bandera no se queda "colgada": la siguiente carga (otra cuenta) hace UNA sola petición.
    useAuthStore.setState({ perfil: { id: 'u2', clinica_id: 'c2', rol: 'owner' } })
    m.rpc.mockResolvedValue({ data: susc({ usuarios: 1, limUsuarios: 3 }), error: null })
    await usePlanStore.getState().cargar()
    expect(m.rpc).toHaveBeenCalledTimes(2)
  })
})
