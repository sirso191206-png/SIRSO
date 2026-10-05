import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'

const m = vi.hoisted(() => ({ rpc: vi.fn(), signOut: vi.fn() }))
vi.mock('../../../../lib/supabase', () => ({
  supabase: { rpc: m.rpc, from: vi.fn(), auth: { signOut: m.signOut, onAuthStateChange: vi.fn() } }
}))

import { usePlanStore } from '../../../../store/usePlanStore.js'
import { useAuthStore } from '../../../../store/useAuthStore.js'
import { obtenerMiSuscripcion } from '../../../../services/planes.js'

const RED = { message: 'TypeError: Failed to fetch' }
const comoUsuario = (id, clinica) => useAuthStore.setState({ perfil: { id, clinica_id: clinica, rol: 'owner' } })
const suscA = { plan: { codigo: 'x', nombre: 'Plan A' }, funcionalidades: [{ codigo: 'pagos', habilitada: false }] }
const suscB = { plan: { codigo: 'x', nombre: 'Plan B' }, funcionalidades: [{ codigo: 'pagos', habilitada: true }] }
const tic = (ms = 20) => new Promise((r) => setTimeout(r, ms))
const pendiente = () => { let resolver; const promesa = new Promise((r) => { resolver = r }); return { promesa, resolver } }

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  m.rpc.mockReset()
  m.signOut.mockReset().mockResolvedValue({ error: null })
  comoUsuario('uA', 'cA')
  usePlanStore.getState().limpiar()
})

describe('cargar()', () => {
  it('con red: guarda la suscripción, a quién pertenece, cuándo y que NO es caché', async () => {
    m.rpc.mockResolvedValue({ data: suscA, error: null })
    await usePlanStore.getState().cargar()
    const s = usePlanStore.getState()
    expect(s.suscripcion).toEqual(suscA)
    expect(s.claveSuscripcion).toBe('uA:cA')
    expect(s.esOffline).toBe(false)
    expect(s.cargada).toBe(true)
    expect(typeof s.ultimaActualizacion).toBe('number')
  })

  it('sin red CON snapshot: usa el último válido y lo marca esOffline (con la fecha original)', async () => {
    m.rpc.mockResolvedValue({ data: suscA, error: null })
    await usePlanStore.getState().cargar()
    const original = usePlanStore.getState().ultimaActualizacion
    await tic()
    m.rpc.mockResolvedValue({ data: null, error: RED })
    await usePlanStore.getState().cargar()
    const s = usePlanStore.getState()
    expect(s.suscripcion).toEqual(suscA)
    expect(s.esOffline).toBe(true)
    expect(s.ultimaActualizacion).toBe(original)
  })

  it('sin red y SIN snapshot: suscripción null (no inventa ningún plan), con el error y sin colgarse', async () => {
    m.rpc.mockResolvedValue({ data: null, error: RED })
    await expect(usePlanStore.getState().cargar()).resolves.toBeUndefined()
    const s = usePlanStore.getState()
    expect(s.suscripcion).toBeNull()
    expect(s.cargada).toBe(true)
    expect(s.cargando).toBe(false)
    expect(s.error).toBeTruthy()
  })

  it('un rechazo del servidor conserva lo ya cargado de ESTA identidad y deja el error visible', async () => {
    m.rpc.mockResolvedValue({ data: suscA, error: null })
    await usePlanStore.getState().cargar()
    m.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'No autorizado.' } })
    await usePlanStore.getState().cargar()
    expect(usePlanStore.getState().suscripcion).toEqual(suscA)
    expect(usePlanStore.getState().error).toBe('No autorizado.')
  })

  it('dos cargas simultáneas hacen UNA sola petición', async () => {
    const { promesa, resolver } = pendiente()
    m.rpc.mockReturnValue(promesa)
    const a = usePlanStore.getState().cargar()
    const b = usePlanStore.getState().cargar()
    resolver({ data: suscA, error: null })
    await Promise.all([a, b])
    expect(m.rpc).toHaveBeenCalledTimes(1)
  })

  it('un cambio de plan en el servidor se refleja al volver a cargar (no se queda con el anterior)', async () => {
    m.rpc.mockResolvedValue({ data: suscA, error: null })
    await usePlanStore.getState().cargar()
    expect(usePlanStore.getState().suscripcion.plan.nombre).toBe('Plan A')
    m.rpc.mockResolvedValue({ data: suscB, error: null })
    await usePlanStore.getState().cargar()
    expect(usePlanStore.getState().suscripcion.plan.nombre).toBe('Plan B')
  })

  it('limpiar() deja el estado vacío', async () => {
    m.rpc.mockResolvedValue({ data: suscA, error: null })
    await usePlanStore.getState().cargar()
    usePlanStore.getState().limpiar()
    expect(usePlanStore.getState()).toMatchObject({ suscripcion: null, claveSuscripcion: null, cargada: false, cargando: false, esOffline: false, ultimaActualizacion: null })
  })
})

describe('cambio de cuenta o de clínica: la suscripción anterior se descarta SOLA', () => {
  it('cambiar de CLÍNICA limpia el store de inmediato', async () => {
    m.rpc.mockResolvedValue({ data: suscA, error: null })
    await usePlanStore.getState().cargar()
    comoUsuario('uA', 'cB')
    expect(usePlanStore.getState().suscripcion).toBeNull()
    expect(usePlanStore.getState().claveSuscripcion).toBeNull()
  })

  it('cambiar de USUARIO limpia el store de inmediato', async () => {
    m.rpc.mockResolvedValue({ data: suscA, error: null })
    await usePlanStore.getState().cargar()
    comoUsuario('uB', 'cA')
    expect(usePlanStore.getState().suscripcion).toBeNull()
  })

  it('recargar el perfil SIN cambiar de identidad no tira la suscripción', async () => {
    m.rpc.mockResolvedValue({ data: suscA, error: null })
    await usePlanStore.getState().cargar()
    useAuthStore.setState({ perfil: { id: 'uA', clinica_id: 'cA', rol: 'dentista', nombre: 'cambió el nombre' } })
    expect(usePlanStore.getState().suscripcion).toEqual(suscA)
  })

  it('la nueva clínica carga SU suscripción, con otra clave de caché', async () => {
    m.rpc.mockResolvedValue({ data: suscA, error: null })
    await usePlanStore.getState().cargar()
    comoUsuario('uA', 'cB')
    m.rpc.mockResolvedValue({ data: suscB, error: null })
    await usePlanStore.getState().cargar()
    expect(usePlanStore.getState().suscripcion).toEqual(suscB)
    expect(usePlanStore.getState().claveSuscripcion).toBe('uA:cB')
  })

  it('CARRERA: la respuesta TARDÍA de la cuenta anterior se DESCARTA y nunca se muestra en la nueva', async () => {
    const lenta = pendiente()
    m.rpc.mockReturnValueOnce(lenta.promesa)
    const carga = usePlanStore.getState().cargar() // pide como A
    comoUsuario('uB', 'cB') // mientras tanto cambia la identidad
    lenta.resolver({ data: suscA, error: null }) // llega la respuesta de A
    await carga
    expect(usePlanStore.getState().suscripcion).toBeNull() // no se aplicó
    // y la carga de la nueva identidad sí funciona (el candado no quedó atascado)
    m.rpc.mockResolvedValue({ data: suscB, error: null })
    await usePlanStore.getState().cargar()
    expect(usePlanStore.getState().suscripcion).toEqual(suscB)
  })

  it('CARRERA: un fallo tardío de la identidad anterior tampoco pisa el estado de la nueva', async () => {
    const lenta = pendiente()
    m.rpc.mockReturnValueOnce(lenta.promesa)
    const carga = usePlanStore.getState().cargar()
    comoUsuario('uB', 'cB')
    m.rpc.mockResolvedValue({ data: suscB, error: null })
    const cargaB = usePlanStore.getState().cargar()
    lenta.resolver({ data: null, error: { code: '42501', message: 'viejo' } })
    await Promise.all([carga, cargaB])
    expect(usePlanStore.getState().suscripcion).toEqual(suscB)
    expect(usePlanStore.getState().error).toBeNull()
  })
})

describe('cerrar sesión (logout real de useAuthStore)', () => {
  it('limpia la suscripción en memoria Y la caché, y el siguiente usuario no ve nada de la cuenta anterior', async () => {
    m.rpc.mockResolvedValue({ data: suscA, error: null })
    await usePlanStore.getState().cargar()
    await tic()
    expect(usePlanStore.getState().suscripcion).toEqual(suscA)

    await useAuthStore.getState().logout()

    expect(useAuthStore.getState().perfil).toBeNull()
    expect(usePlanStore.getState().suscripcion).toBeNull()
    expect(usePlanStore.getState().claveSuscripcion).toBeNull()

    // Entra OTRA persona, sin red: no recibe nada de la anterior.
    comoUsuario('uZ', 'cZ')
    m.rpc.mockResolvedValue({ data: null, error: RED })
    await expect(obtenerMiSuscripcion()).rejects.toMatchObject(RED)
    // ...ni siquiera si la que entra es la MISMA cuenta de antes: la caché ya no existe.
    comoUsuario('uA', 'cA')
    await expect(obtenerMiSuscripcion()).rejects.toMatchObject(RED)
  })

  it('una respuesta que llega DESPUÉS de cerrar sesión no resucita la suscripción', async () => {
    const lenta = pendiente()
    m.rpc.mockReturnValueOnce(lenta.promesa)
    const carga = usePlanStore.getState().cargar()
    await useAuthStore.getState().logout()
    lenta.resolver({ data: suscA, error: null })
    await carga
    expect(usePlanStore.getState().suscripcion).toBeNull()
  })
})
