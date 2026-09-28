import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { crearQueryMock, ok, sinRed } from './helpers/supabaseMock.js'

const supabaseMock = vi.hoisted(() => ({ from: vi.fn(), auth: {} }))
vi.mock('../../../../lib/supabase', () => ({ supabase: supabaseMock, invocarFuncionAutenticada: vi.fn() }))
vi.mock('../../../../services/sesiones', () => ({ registrarSesion: vi.fn(), marcarSesionFinalizada: vi.fn() }))

import { guardarPerfilOffline, leerPerfilOffline } from '../../../../lib/cacheAuth.js'
import { useAuthStore } from '../../../../store/useAuthStore.js'

const HORA = 60 * 60 * 1000
const perfilAna = { id: 'u1', nombre: 'Ana Dentista', rol: 'dentista', clinica_id: 'c1' }

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-27T10:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('cacheAuth — perfil local para arrancar sin Supabase (sección 3)', () => {
  it('guarda y recupera el perfil y la clínica', async () => {
    await guardarPerfilOffline({ userId: 'u1', perfil: perfilAna, clinicaNombre: 'Clínica Sonrisa', clinicaEstado: 'activa' })
    const r = await leerPerfilOffline('u1')

    expect(r.perfil).toEqual(perfilAna)
    expect(r.clinicaNombre).toBe('Clínica Sonrisa')
    expect(r.clinicaEstado).toBe('activa')
    expect(r.lastSyncedAt).toBe(Date.now())
  })

  it('devuelve null si nunca se guardó nada — no inventa un perfil', async () => {
    expect(await leerPerfilOffline('desconocido')).toBeNull()
  })

  it('no mezcla usuarios: el perfil de una persona no se le sirve a otra', async () => {
    await guardarPerfilOffline({ userId: 'u1', perfil: perfilAna })
    expect(await leerPerfilOffline('u2')).toBeNull()
  })

  it('a las 23 h 59 min todavía sirve; pasadas las 24 h se trata como si no existiera (sección 19)', async () => {
    await guardarPerfilOffline({ userId: 'u1', perfil: perfilAna })

    vi.setSystemTime(Date.now() + 24 * HORA - 60 * 1000)
    expect(await leerPerfilOffline('u1')).not.toBeNull()

    vi.setSystemTime(Date.now() + 2 * 60 * 1000) // ya son 24 h + 1 min
    expect(await leerPerfilOffline('u1')).toBeNull()
  })

  it('el registro guardado contiene SOLO perfil/clínica/fecha — ninguna credencial (sección 18)', async () => {
    await guardarPerfilOffline({
      userId: 'u1', perfil: perfilAna, clinicaNombre: 'X', clinicaEstado: 'activa',
      password: 'secreta', access_token: 'jwt', refresh_token: 'r' // por si algún llamador se equivoca
    })
    const r = await leerPerfilOffline('u1')

    expect(Object.keys(r).sort()).toEqual(['clinicaEstado', 'clinicaNombre', 'lastSyncedAt', 'perfil', 'userId'])
    expect(JSON.stringify(r)).not.toMatch(/secreta|jwt|refresh_token|password/)
  })
})

describe('useAuthStore.cargarPerfil — el arranque no depende de Supabase (sección 2, prueba #2)', () => {
  const session = { user: { id: 'u1' } }
  let servidor // qué responde Supabase por tabla; null = sin red

  beforeEach(() => {
    useAuthStore.setState({ session: null, perfil: null, clinicaNombre: null, clinicaEstado: null, connectionStatus: 'online', cargando: true })
    servidor = { usuarios: ok(perfilAna), clinicas: ok({ nombre: 'Clínica Sonrisa', estado: 'activa' }) }
    supabaseMock.from.mockReset()
    supabaseMock.from.mockImplementation((tabla) =>
      crearQueryMock(tabla, () => (servidor ? servidor[tabla] : sinRed()), []))
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  const esperarGuardadoLocal = () =>
    vi.waitFor(async () => { expect(await leerPerfilOffline('u1')).not.toBeNull() })

  it('con internet: carga el perfil, marca "online" y deja una copia local', async () => {
    await useAuthStore.getState().cargarPerfil(session)

    const s = useAuthStore.getState()
    expect(s.perfil).toEqual(perfilAna)
    expect(s.connectionStatus).toBe('online')
    expect(s.clinicaNombre).toBe('Clínica Sonrisa')
    await esperarGuardadoLocal()
  })

  it('sin internet, con sesión previa: la app SÍ arranca con el perfil guardado y marca "offline"', async () => {
    await useAuthStore.getState().cargarPerfil(session)
    await esperarGuardadoLocal()

    // Se corta internet y se "recarga" la app:
    useAuthStore.setState({ perfil: null, clinicaNombre: null, clinicaEstado: null, cargando: true })
    servidor = null
    await useAuthStore.getState().cargarPerfil(session)

    const s = useAuthStore.getState()
    expect(s.perfil).toEqual(perfilAna)
    expect(s.clinicaNombre).toBe('Clínica Sonrisa')
    expect(s.clinicaEstado).toBe('activa')
    expect(s.connectionStatus).toBe('offline')
    expect(s.cargando).toBe(false) // no se queda cargando para siempre
  })

  it('sin internet y sin nada guardado: NO inventa un perfil — queda null para exigir reconexión', async () => {
    servidor = null
    await useAuthStore.getState().cargarPerfil(session)

    const s = useAuthStore.getState()
    expect(s.perfil).toBeNull()
    expect(s.connectionStatus).toBe('offline')
    expect(s.cargando).toBe(false)
  })

  it('sin internet pero con el perfil guardado VENCIDO (>24 h): exige reconectar, no usa datos viejos', async () => {
    await useAuthStore.getState().cargarPerfil(session)
    await esperarGuardadoLocal()

    vi.setSystemTime(Date.now() + 25 * HORA)
    useAuthStore.setState({ perfil: null })
    servidor = null
    await useAuthStore.getState().cargarPerfil(session)

    expect(useAuthStore.getState().perfil).toBeNull()
  })

  it('una clínica que estaba suspendida al guardar sigue apareciendo suspendida offline (no se "cuela")', async () => {
    servidor.clinicas = ok({ nombre: 'Clínica Sonrisa', estado: 'suspendida' })
    await useAuthStore.getState().cargarPerfil(session)
    await esperarGuardadoLocal()

    useAuthStore.setState({ clinicaEstado: null })
    servidor = null
    await useAuthStore.getState().cargarPerfil(session)

    expect(useAuthStore.getState().clinicaEstado).toBe('suspendida')
  })
})
