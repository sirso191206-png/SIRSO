// Onboarding: los pasos salen de datos REALES de la clínica.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { crearQueryMock, ok, fallo, llamada } from './offline/helpers/supabaseMock.js'

const m = vi.hoisted(() => ({ from: vi.fn(), registro: [], responder: null }))
vi.mock('../../../lib/supabase', () => ({ supabase: { from: m.from, rpc: vi.fn(), auth: { onAuthStateChange: vi.fn() }, channel: vi.fn(), removeChannel: vi.fn() } }))
vi.mock('zustand', async (importarOriginal) => {
  const real = await importarOriginal()
  return { ...real, create: (inicial) => { const api = real.createStore(inicial); api.getServerState = api.getState; const hook = (sel, eq) => real.useStore(api, sel, eq); Object.assign(hook, api); return hook } }
})

import { calcularPasos, progresoOnboarding, claveOnboardingOculto, puedeVerOnboarding } from '../../../lib/onboarding.js'
import { obtenerDatosOnboarding } from '../../../services/onboarding.js'
import { OnboardingClinica, PanelPrimerosPasos } from '../../onboarding/OnboardingClinica.jsx'
import { useAuthStore } from '../../../store/useAuthStore.js'
import { usePlanStore } from '../../../store/usePlanStore.js'

const completa = { direccion: 'Calle 1', telefono: '5512345678', logo_url: 'https://x/logo.png' }
const perfilCompleto = { id: 'u1', cedula_profesional: '1234567', firma_png: 'data:image/png;base64,xx' }
const ids = (pasos) => pasos.map((p) => p.id)
const hechos = (pasos) => pasos.filter((p) => p.hecho).map((p) => p.id)

describe('calcularPasos', () => {
  it('clínica recién creada: los 6 pasos, todos pendientes', () => {
    const p = calcularPasos({ clinica: {}, perfil: {}, totales: { pacientes: 0, citas: 0, usuarios: 1 } })
    expect(ids(p)).toEqual(['datos_clinica', 'logo', 'datos_profesionales', 'usuarios', 'paciente', 'cita'])
    expect(hechos(p)).toEqual([])
  })
  it('todo hecho: 6 de 6 y completo', () => {
    const p = calcularPasos({ clinica: completa, perfil: perfilCompleto, totales: { pacientes: 3, citas: 2, usuarios: 3 } })
    expect(hechos(p)).toEqual(ids(p))
    expect(progresoOnboarding(p)).toEqual({ hechos: 6, total: 6, porcentaje: 100, completo: true })
  })
  it('el domicilio y el teléfono hacen falta los DOS; espacios en blanco no cuentan', () => {
    expect(hechos(calcularPasos({ clinica: { direccion: 'Calle 1' }, perfil: {} }))).not.toContain('datos_clinica')
    expect(hechos(calcularPasos({ clinica: { direccion: '   ', telefono: '5512345678' }, perfil: {} }))).not.toContain('datos_clinica')
    expect(hechos(calcularPasos({ clinica: { direccion: 'Calle 1', telefono: '55' }, perfil: {} }))).toContain('datos_clinica')
  })
  it('si se borra el logo el paso vuelve a estar pendiente (se calcula de los datos, no de un recuerdo)', () => {
    expect(hechos(calcularPasos({ clinica: completa, perfil: {} }))).toContain('logo')
    expect(hechos(calcularPasos({ clinica: { ...completa, logo_url: null }, perfil: {} }))).not.toContain('logo')
  })
  it('datos profesionales: hacen falta la cédula Y la firma', () => {
    expect(hechos(calcularPasos({ clinica: {}, perfil: { cedula_profesional: '123' } }))).not.toContain('datos_profesionales')
    expect(hechos(calcularPasos({ clinica: {}, perfil: { firma_png: 'x' } }))).not.toContain('datos_profesionales')
    expect(hechos(calcularPasos({ clinica: {}, perfil: perfilCompleto }))).toContain('datos_profesionales')
  })
  it('equipo: hace falta más de un usuario; si el plan permite solo uno, el paso NO se ofrece', () => {
    expect(hechos(calcularPasos({ clinica: {}, perfil: {}, totales: { usuarios: 1 } }))).not.toContain('usuarios')
    expect(hechos(calcularPasos({ clinica: {}, perfil: {}, totales: { usuarios: 2 } }))).toContain('usuarios')
    expect(ids(calcularPasos({ clinica: {}, perfil: {}, puedeAgregarUsuarios: false }))).not.toContain('usuarios')
  })
  it('sin la función de agenda en el plan no se pide agendar una cita', () => {
    expect(ids(calcularPasos({ clinica: {}, perfil: {}, incluyeAgenda: false }))).not.toContain('cita')
    expect(ids(calcularPasos({ clinica: {}, perfil: {}, incluyeAgenda: false, puedeAgregarUsuarios: false }))).toEqual(['datos_clinica', 'logo', 'datos_profesionales', 'paciente'])
  })
  it('no se ofrecen pasos de funciones que SIRO no tiene (horarios de atención)', () => {
    const textos = JSON.stringify(calcularPasos({ clinica: {}, perfil: {} })).toLowerCase()
    for (const prohibido of ['horario', 'whatsapp', 'inventario']) expect(textos).not.toContain(prohibido)
  })
  it('sin ningún dato no truena', () => {
    expect(() => calcularPasos()).not.toThrow()
    expect(calcularPasos().length).toBeGreaterThan(0)
  })
  it('pacientes y citas se cuentan por mayor que cero', () => {
    const p = calcularPasos({ clinica: {}, perfil: {}, totales: { pacientes: 1, citas: 0 } })
    expect(hechos(p)).toContain('paciente')
    expect(hechos(p)).not.toContain('cita')
  })
})

describe('puedeVerOnboarding: solo el propietario', () => {
  it('owner sí; dentista, recepción, asistente, superadmin y sin sesión no', () => {
    expect(puedeVerOnboarding({ rol: 'owner' })).toBe(true)
    for (const p of [{ rol: 'dentista' }, { rol: 'recepcion' }, { rol: 'asistente' }, { rol: 'owner', es_super_admin: true }, { rol: undefined }, null, undefined]) expect(puedeVerOnboarding(p)).toBe(false)
  })
})

describe('progresoOnboarding', () => {
  it('porcentaje y conteo', () => {
    const p = calcularPasos({ clinica: completa, perfil: perfilCompleto, totales: { pacientes: 0, citas: 0, usuarios: 1 } })
    expect(progresoOnboarding(p)).toMatchObject({ hechos: 3, total: 6, porcentaje: 50, completo: false })
  })
  it('sin pasos no cuenta como completo (no se oculta por error)', () => {
    expect(progresoOnboarding([])).toMatchObject({ total: 0, completo: false })
  })
  it('la clave de "ocultar" es por usuario (otra persona del mismo navegador la sigue viendo)', () => {
    expect(claveOnboardingOculto('a')).not.toBe(claveOnboardingOculto('b'))
    expect(claveOnboardingOculto('abc')).toBe('siro:onboarding-oculto:abc')
  })
})

describe('servicio', () => {
  beforeEach(() => {
    m.registro.length = 0
    m.responder = (t) => (t === 'clinicas' ? ok({ id: 'c1', nombre: 'Mi clínica' }) : ok(null, { count: 4 }))
    m.from.mockReset().mockImplementation((t) => crearQueryMock(t, (tabla, ops) => m.responder(tabla, ops), m.registro))
  })
  it('trae la clínica y cuenta pacientes y citas con consultas de solo conteo (head), sin traer filas', async () => {
    const r = await obtenerDatosOnboarding('c1')
    expect(r).toEqual({ clinica: { id: 'c1', nombre: 'Mi clínica' }, totales: { pacientes: 4, citas: 4 } })
    for (const reg of m.registro.filter((x) => x.tabla !== 'clinicas')) expect(llamada(reg.operaciones, 'select')[1][1]).toEqual({ count: 'exact', head: true })
    expect(m.registro.map((x) => x.tabla).sort()).toEqual(['citas', 'clinicas', 'pacientes'])
  })
  it('un error de la base se propaga (el componente lo silencia)', async () => {
    m.responder = () => fallo('boom')
    await expect(obtenerDatosOnboarding('c1')).rejects.toBeDefined()
  })
})

describe('panel visual', () => {
  const html = (pasos, p = {}) => renderToStaticMarkup(h(StaticRouter, { location: '/' }, h(PanelPrimerosPasos, { pasos, onOcultar: () => {}, ...p })))
  it('muestra el avance "N de M", la barra y el botón para ocultar', () => {
    const r = html(calcularPasos({ clinica: completa, perfil: perfilCompleto, totales: { pacientes: 0, citas: 0, usuarios: 1 } }))
    expect(r).toContain('3 de 6 completados')
    expect(r).toContain('aria-valuenow="50"')
    expect(r).toContain('Ocultar esta guía')
    expect(r).toContain('Bienvenido a SIRO')
  })
  it('los pendientes llevan su explicación y enlace; los hechos van tachados y sin enlace', () => {
    const r = html(calcularPasos({ clinica: completa, perfil: {}, totales: { pacientes: 1, citas: 0, usuarios: 1 } }))
    expect(r).toContain('href="/agenda"')
    expect(r).toContain('Desde la Agenda, con el botón &quot;Nueva cita&quot;')
    expect(r).toContain('line-through')
    expect(r.match(/data-hecho="si"/g).length).toBe(3)
    expect(r).not.toContain('href="/pacientes"') // ya hay un paciente: ese paso está hecho
  })
  it('el paso de datos profesionales explica dónde está (no tiene enlace porque vive en el menú del nombre)', () => {
    const r = html(calcularPasos({ clinica: completa, perfil: {}, totales: {} }))
    expect(r).toContain('Datos profesionales')
    expect(r).toContain('abajo a la izquierda')
  })
})

describe('contenedor: solo el propietario, y nunca estorba', () => {
  const render = () => renderToStaticMarkup(h(StaticRouter, { location: '/' }, h(OnboardingClinica)))
  beforeEach(() => { useAuthStore.setState({ perfil: null }); usePlanStore.getState().limpiar() })
  it('dentista, recepción, asistente, superadmin y sin sesión: nada', () => {
    for (const perfil of [{ id: 'u', clinica_id: 'c', rol: 'dentista' }, { id: 'u', clinica_id: 'c', rol: 'recepcion' }, { id: 'u', clinica_id: 'c', rol: 'asistente' }, { id: 'u', clinica_id: 'c', rol: 'owner', es_super_admin: true }, null]) {
      useAuthStore.setState({ perfil })
      expect(render()).toBe('')
    }
  })
  it('el propietario antes de que lleguen los datos: nada (sin parpadeos)', () => {
    useAuthStore.setState({ perfil: { id: 'u', clinica_id: 'c', rol: 'owner' } })
    expect(render()).toBe('')
  })
})
