// La suscripción cacheada pertenece a UN usuario en UNA clínica. Nunca se entrega a otra
// identidad, aunque compartan el navegador. La caché solo cubre la falta de RED.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'

const m = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../../../lib/supabase', () => ({ supabase: { rpc: m.rpc, from: vi.fn(), auth: {} } }))

import { obtenerMiSuscripcion } from '../../../../services/planes.js'
import { useAuthStore } from '../../../../store/useAuthStore.js'
import { claveCacheSuscripcion, identidadSuscripcion } from '../../../../lib/planes.js'
import { limpiarDatosLocalesDeSesion } from '../../../../lib/cierreSesion.js'

const RED = { message: 'TypeError: Failed to fetch' }
const comoUsuario = (id, clinica) => useAuthStore.setState({ perfil: { id, clinica_id: clinica, rol: 'owner' } })
const suscA = { plan: { codigo: 'x', nombre: 'Plan de A' }, funcionalidades: [] }
const suscB = { plan: { codigo: 'x', nombre: 'Plan de B' }, funcionalidades: [] }
const conRed = (datos) => m.rpc.mockResolvedValue({ data: datos, error: null })
const sinRed = () => m.rpc.mockResolvedValue({ data: null, error: RED })

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  m.rpc.mockReset()
  comoUsuario('uA', 'cA')
})

describe('clave de caché: siro:mi-suscripcion:<usuario>:<clínica>', () => {
  it('formato exacto', () => {
    expect(claveCacheSuscripcion('u1', 'c1')).toBe('siro:mi-suscripcion:u1:c1')
  })
  it('identidad = usuario + clínica; sin alguno de los dos no hay identidad', () => {
    expect(identidadSuscripcion({ id: 'u', clinica_id: 'c' })).toBe('u:c')
    expect(identidadSuscripcion({ id: 'u' })).toBeNull()
    expect(identidadSuscripcion({ clinica_id: 'c' })).toBeNull()
    expect(identidadSuscripcion(null)).toBeNull()
  })
})

describe('sin conexión: usa el último snapshot de ESTA identidad', () => {
  it('guarda al leer con red y lo recupera sin red (con la marca de cuándo se guardó)', async () => {
    conRed(suscA)
    const fresca = await obtenerMiSuscripcion()
    expect(fresca).toMatchObject({ suscripcion: suscA, deCache: false })
    await new Promise((r) => setTimeout(r, 20)) // la escritura a caché no se espera
    sinRed()
    const guardada = await obtenerMiSuscripcion()
    expect(guardada.suscripcion).toEqual(suscA)
    expect(guardada.deCache).toBe(true)
    expect(guardada.guardadoEn).toBe(fresca.guardadoEn)
  })

  it('un snapshot nuevo REEMPLAZA al viejo', async () => {
    conRed({ ...suscA, v: 1 })
    await obtenerMiSuscripcion()
    await new Promise((r) => setTimeout(r, 20))
    conRed({ ...suscA, v: 2 })
    await obtenerMiSuscripcion()
    await new Promise((r) => setTimeout(r, 20))
    sinRed()
    expect((await obtenerMiSuscripcion()).suscripcion.v).toBe(2)
  })

  it('sin red y SIN snapshot: falla (no inventa un plan)', async () => {
    sinRed()
    await expect(obtenerMiSuscripcion()).rejects.toMatchObject(RED)
  })
})

describe('AISLAMIENTO entre cuentas y clínicas', () => {
  const guardarComoA = async () => {
    conRed(suscA)
    await obtenerMiSuscripcion()
    await new Promise((r) => setTimeout(r, 20))
  }

  it('el usuario B en el mismo navegador NO recibe la suscripción del usuario A (misma clínica)', async () => {
    await guardarComoA()
    comoUsuario('uB', 'cA')
    sinRed()
    await expect(obtenerMiSuscripcion()).rejects.toMatchObject(RED)
  })

  it('el MISMO usuario en OTRA clínica NO recibe la suscripción de la primera', async () => {
    await guardarComoA()
    comoUsuario('uA', 'cB')
    sinRed()
    await expect(obtenerMiSuscripcion()).rejects.toMatchObject(RED)
  })

  it('cada identidad conserva SU snapshot: A y B, cada uno con el suyo, sin mezclarse', async () => {
    await guardarComoA()
    comoUsuario('uB', 'cB')
    conRed(suscB)
    await obtenerMiSuscripcion()
    await new Promise((r) => setTimeout(r, 20))
    sinRed()
    expect((await obtenerMiSuscripcion()).suscripcion.plan.nombre).toBe('Plan de B')
    comoUsuario('uA', 'cA')
    expect((await obtenerMiSuscripcion()).suscripcion.plan.nombre).toBe('Plan de A')
  })

  it('sin sesión (sin perfil) NO se guarda ni se lee ninguna caché', async () => {
    useAuthStore.setState({ perfil: null })
    conRed(suscA)
    await obtenerMiSuscripcion()
    await new Promise((r) => setTimeout(r, 20))
    comoUsuario('uA', 'cA')
    sinRed()
    await expect(obtenerMiSuscripcion()).rejects.toMatchObject(RED)
  })
})

describe('la caché solo cubre la RED — un rechazo del servidor se propaga SIN modificar', () => {
  it('un error autoritativo (no autorizado) NO se tapa con el plan viejo guardado, y es el MISMO objeto', async () => {
    await (async () => { conRed(suscA); await obtenerMiSuscripcion(); await new Promise((r) => setTimeout(r, 20)) })()
    const rechazo = { code: '42501', message: 'No autorizado.', details: null, hint: null }
    m.rpc.mockResolvedValue({ data: null, error: rechazo })
    await expect(obtenerMiSuscripcion()).rejects.toBe(rechazo)
  })

  it('un error de plan (PT402/PT403) tampoco se convierte en caché ni se altera', async () => {
    const err = { code: 'PT402', details: 'PLAN_LIMIT_REACHED', message: 'x' }
    m.rpc.mockResolvedValue({ data: null, error: err })
    await expect(obtenerMiSuscripcion()).rejects.toBe(err)
  })
})

describe('cerrar sesión limpia la caché de suscripción', () => {
  it('limpiarDatosLocalesDeSesion (lo que corre en logout) borra la suscripción guardada', async () => {
    conRed(suscA)
    await obtenerMiSuscripcion()
    await new Promise((r) => setTimeout(r, 20))
    await limpiarDatosLocalesDeSesion()
    sinRed()
    await expect(obtenerMiSuscripcion()).rejects.toMatchObject(RED)
  })

  it('cambiar de cuenta en el equipo (asegurarCacheDeEsteUsuario) también la borra, aunque la clave fuera la misma', async () => {
    conRed(suscA)
    await obtenerMiSuscripcion()
    await new Promise((r) => setTimeout(r, 20))
    const { asegurarCacheDeEsteUsuario } = await import('../../../../lib/cierreSesion.js')
    await asegurarCacheDeEsteUsuario('uA')       // dueño actual
    await asegurarCacheDeEsteUsuario('otra-cuenta') // entra otra persona
    sinRed()
    await expect(obtenerMiSuscripcion()).rejects.toMatchObject(RED)
  })
})
