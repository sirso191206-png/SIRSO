import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'

const m = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../../../lib/supabase', () => ({ supabase: { rpc: m.rpc, from: vi.fn(), auth: {} } }))

import * as planes from '../../../../services/planes.js'
import { usePlanStore } from '../../../../store/usePlanStore.js'
import { useAuthStore } from '../../../../store/useAuthStore.js'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  m.rpc.mockReset()
  useAuthStore.setState({ perfil: { id: 'u1', clinica_id: 'c1', rol: 'owner' } })
  usePlanStore.getState().limpiar()
})

describe('services/planes — cada envoltorio llama a LA función correcta con LOS parámetros correctos', () => {
  const casos = [
    ['listarPlanes', () => planes.listarPlanes(), 'sa_listar_planes', undefined],
    ['funcionalidadesDePlan', () => planes.funcionalidadesDePlan('pro'), 'sa_funcionalidades_de_plan', { p_plan: 'pro' }],
    ['clinicasDePlan', () => planes.clinicasDePlan('pro'), 'sa_clinicas_de_plan', { p_plan: 'pro' }],
    ['guardarPlan', () => planes.guardarPlan({ codigo: 'x' }), 'sa_guardar_plan', { p: { codigo: 'x' } }],
    ['activarPlan', () => planes.activarPlan('pro', false), 'sa_activar_plan', { p_plan: 'pro', p_activo: false }],
    ['duplicarPlan', () => planes.duplicarPlan('pro', 'pro2', 'Pro 2'), 'sa_duplicar_plan', { p_origen: 'pro', p_nuevo: 'pro2', p_nombre: 'Pro 2' }],
    ['guardarFuncionalidadesDePlan', () => planes.guardarFuncionalidadesDePlan('pro', { pagos: true }), 'sa_set_plan_funcionalidades', { p_plan: 'pro', p_funcionalidades: { pagos: true } }],
    ['guardarFuncionalidad (sin aplicar a existentes por defecto)', () => planes.guardarFuncionalidad({ codigo: 'f' }, ['pro']), 'sa_guardar_funcionalidad', { p: { codigo: 'f' }, p_planes: ['pro'], p_aplicar_a_suscripciones: false }],
    ['historialPlanes', () => planes.historialPlanes(20), 'sa_historial_planes', { p_limite: 20 }],
    ['suscripcionDeClinica', () => planes.suscripcionDeClinica('c1'), 'sa_suscripcion_de_clinica', { p_clinica: 'c1' }],
    ['ajustarCondicionesClinica', () => planes.ajustarCondicionesClinica('c1', { max_pacientes: null }, { pagos: false }), 'sa_ajustar_condiciones_clinica', { p_clinica: 'c1', p_limites: { max_pacientes: null }, p_funcionalidades: { pagos: false } }],
    ['suspenderSuscripcion', () => planes.suspenderSuscripcion('c1', 'impago'), 'sa_suspender_suscripcion', { p_clinica: 'c1', p_motivo: 'impago' }],
    ['reactivarSuscripcion', () => planes.reactivarSuscripcion('c1'), 'sa_reactivar_suscripcion', { p_clinica: 'c1' }]
  ]
  for (const [nombre, llamar, rpcEsperada, params] of casos) {
    it(nombre, async () => {
      m.rpc.mockResolvedValue({ data: 'ok', error: null })
      expect(await llamar()).toBe('ok')
      expect(m.rpc).toHaveBeenCalledTimes(1)
      expect(m.rpc.mock.calls[0][0]).toBe(rpcEsperada)
      expect(m.rpc.mock.calls[0][1]).toEqual(params)
    })
  }

  it('asignarPlanClinica manda TODOS los datos y por defecto: sin precio propio, auto-renovación activa', async () => {
    m.rpc.mockResolvedValue({ data: { suscripcion_id: 's', excesos: [] }, error: null })
    await planes.asignarPlanClinica({ clinicaId: 'c1', plan: 'pro', modalidad: 'anual' })
    expect(m.rpc).toHaveBeenCalledWith('sa_asignar_plan_clinica', {
      p_clinica: 'c1', p_plan: 'pro', p_modalidad: 'anual', p_precio: null, p_fecha_inicio: null, p_fecha_fin: null, p_auto_renovacion: true
    })
  })

  it('un error de la base se PROPAGA tal cual (con su code/details para poder traducirlo), no se traga', async () => {
    const error = { code: '42501', message: 'No autorizado.' }
    m.rpc.mockResolvedValue({ data: null, error })
    await expect(planes.listarPlanes()).rejects.toBe(error)
  })
})

describe('mi suscripción: caché local y store', () => {
  const susc = { plan: { codigo: 'pro', nombre: 'Profesional' }, funcionalidades: [{ codigo: 'periodontograma', habilitada: false }] }

  it('con red: la lee y la guarda en caché', async () => {
    m.rpc.mockResolvedValue({ data: susc, error: null })
    const r = await planes.obtenerMiSuscripcion()
    expect(r.suscripcion).toEqual(susc)
    expect(r.deCache).toBe(false)
  })

  it('SIN red: usa la última guardada (el panel y el ocultamiento de menús siguen funcionando offline)', async () => {
    m.rpc.mockResolvedValueOnce({ data: susc, error: null })
    await planes.obtenerMiSuscripcion()
    m.rpc.mockResolvedValueOnce({ data: null, error: { message: 'TypeError: Failed to fetch' } })
    const r = await planes.obtenerMiSuscripcion()
    expect(r.suscripcion).toEqual(susc)
    expect(r.deCache).toBe(true)
  })

  it('sin red y SIN caché previa: falla (no inventa un plan)', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch' } })
    await expect(planes.obtenerMiSuscripcion()).rejects.toBeTruthy()
  })

  it('store.cargar guarda la suscripción; limpiar la borra', async () => {
    m.rpc.mockResolvedValue({ data: susc, error: null })
    await usePlanStore.getState().cargar()
    expect(usePlanStore.getState().suscripcion).toEqual(susc)
    expect(usePlanStore.getState().cargada).toBe(true)
    usePlanStore.getState().limpiar()
    expect(usePlanStore.getState().suscripcion).toBeNull()
    expect(usePlanStore.getState().cargada).toBe(false)
  })

  it('store.cargar sin red y sin caché NO lanza ni deja la app colgada: queda cargada con error y sin suscripción (no se oculta nada)', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch' } })
    await expect(usePlanStore.getState().cargar()).resolves.toBeUndefined()
    const s = usePlanStore.getState()
    expect(s.cargada).toBe(true)
    expect(s.cargando).toBe(false)
    expect(s.suscripcion).toBeNull()
    expect(s.error).toBeTruthy()
  })

  it('dos cargas simultáneas no duplican la petición (candado)', async () => {
    m.rpc.mockImplementation(() => new Promise((r) => setTimeout(() => r({ data: susc, error: null }), 10)))
    await Promise.all([usePlanStore.getState().cargar(), usePlanStore.getState().cargar()])
    expect(m.rpc).toHaveBeenCalledTimes(1)
  })
})
