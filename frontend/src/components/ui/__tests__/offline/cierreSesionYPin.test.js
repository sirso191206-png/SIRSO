import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { crearQueryMock, ok } from './helpers/supabaseMock.js'

const HORA = 60 * 60 * 1000
const MIN = 60 * 1000
const PIN = '482915'
const RAPIDO = { iteraciones: 1000 }

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
  auth: { getSession: vi.fn(), refreshSession: vi.fn(), signOut: vi.fn(), onAuthStateChange: vi.fn() }
}))
const sesionesMock = vi.hoisted(() => ({ registrarSesion: vi.fn(), marcarSesionFinalizada: vi.fn() }))
vi.mock('../../../../lib/supabase', () => ({ supabase: supabaseMock, invocarFuncionAutenticada: vi.fn() }))
vi.mock('../../../../services/sesiones', () => sesionesMock)

import { useAuthStore } from '../../../../store/useAuthStore.js'
import { encolarOperacion, listarOperacionesPendientes, quitarOperacion } from '../../../../lib/colaOffline.js'
import { guardarMetadato, leerMetadato, conCacheDeLectura } from '../../../../lib/cacheLectura.js'
import { guardarPerfilOffline, leerPerfilOffline } from '../../../../lib/cacheAuth.js'
import { configurarPin, obtenerEstadoPin, obtenerPinDisponible } from '../../../../lib/pinOffline.js'
import { evaluarOperaciones, evaluarCierreDeSesion } from '../../../../lib/cierreSesion.js'

const ana = { id: 'u1', nombre: 'Ana Dentista', rol: 'dentista', clinica_id: 'c1' }
const luis = { id: 'u2', nombre: 'Luis Recepción', rol: 'recepcion', clinica_id: 'c1' }
const errorDeRed = { name: 'AuthRetryableFetchError', message: 'fetch failed', status: 0 }
const tokenRevocado = { name: 'AuthApiError', message: 'Invalid Refresh Token', status: 400 }

const ponerConexion = (enLinea) => Object.defineProperty(globalThis.navigator, 'onLine', { value: enLinea, configurable: true })
const sesionReal = (id = 'u1') => ({ access_token: 'jwt', refresh_token: 'r', user: { id } })

// Qué responde "Supabase" a la carga del perfil.
let servidor
function servidorPara(perfil, clinica = { nombre: 'Clínica Sonrisa', estado: 'activa' }) {
  servidor = { usuarios: ok(perfil), clinicas: ok(clinica) }
}

const op = (id, extra = {}) => ({
  id, tipo: 'crear_nota_clinica', entidad: 'notas_clinicas', entidadId: id,
  payload: { id }, creado_en: 1, ...extra
})

// Deja la app "con sesión real y con internet" para el usuario dado.
async function iniciarSesion(perfil = ana) {
  servidorPara(perfil)
  ponerConexion(true)
  await useAuthStore.getState().cargarPerfil(sesionReal(perfil.id))
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-27T10:00:00Z'))
  ponerConexion(true)
  servidorPara(ana)

  supabaseMock.from.mockReset()
  supabaseMock.from.mockImplementation((t) => crearQueryMock(t, (tabla) => servidor[tabla], []))
  Object.values(supabaseMock.auth).forEach((f) => f.mockReset())
  supabaseMock.auth.signOut.mockResolvedValue({ error: null })
  supabaseMock.auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe() {} } } })
  sesionesMock.registrarSesion.mockReset().mockResolvedValue({ id: 'ses1' })
  sesionesMock.marcarSesionFinalizada.mockReset().mockResolvedValue()
  vi.spyOn(console, 'error').mockImplementation(() => {})

  useAuthStore.setState({
    session: null, perfil: null, clinicaNombre: null, clinicaEstado: null, cargando: true,
    sesionActualId: null, connectionStatus: 'online', modoOffline: false, desbloqueoOffline: null
  })
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

// ════════════════════════════════════════════════════════════════════════
describe('Cerrar sesión con cambios pendientes — la regla (función pura)', () => {
  const online = { userId: 'u1', conectado: true }

  it('sin pendientes y con conexión: se puede', () => {
    expect(evaluarOperaciones({ operaciones: [], ...online })).toMatchObject({ permitido: true, motivo: null, pendientes: 0 })
  })

  it('con pendientes: NO, y cuenta cuántos hay y de qué', () => {
    const r = evaluarOperaciones({
      operaciones: [op('a'), op('b'), op('c', { entidad: 'recetas' })], ...online
    })
    expect(r).toMatchObject({ permitido: false, motivo: 'PENDIENTES', pendientes: 3, porEntidad: { notas_clinicas: 2, recetas: 1 } })
  })

  it('las operaciones con error TAMBIÉN bloquean (son cambios que no llegaron) y se cuentan aparte', () => {
    const r = evaluarOperaciones({ operaciones: [op('a', { estado: 'error' }), op('b')], ...online })
    expect(r).toMatchObject({ permitido: false, pendientes: 2, errores: 1 })
  })

  it('sin conexión y con pendientes: NO — se conservan en este equipo', () => {
    expect(evaluarOperaciones({ operaciones: [op('a')], userId: 'u1', conectado: false }))
      .toMatchObject({ permitido: false, motivo: 'PENDIENTES', conectado: false })
  })

  it('sin conexión y SIN pendientes: también NO (signOut sin red no puede revocar la sesión en el servidor)', () => {
    expect(evaluarOperaciones({ operaciones: [], userId: 'u1', conectado: false }))
      .toMatchObject({ permitido: false, motivo: 'SIN_CONEXION' })
  })

  it('los pendientes de OTRA cuenta no bloquean a esta persona (no podría subirlos)', () => {
    expect(evaluarOperaciones({ operaciones: [op('a', { usuarioId: 'u2' })], ...online }).permitido).toBe(true)
  })

  it('los pendientes propios y los sin dueño (anteriores a esta versión) sí bloquean', () => {
    expect(evaluarOperaciones({ operaciones: [op('a', { usuarioId: 'u1' })], ...online }).permitido).toBe(false)
    expect(evaluarOperaciones({ operaciones: [op('b')], ...online }).permitido).toBe(false)
  })

  it('si la cola no se puede LEER, bloquea: no se puede probar que esté vacía', async () => {
    globalThis.indexedDB = { open() { throw new Error('IndexedDB no disponible') } }
    expect(await evaluarCierreDeSesion({ userId: 'u1', conectado: true }))
      .toMatchObject({ permitido: false, motivo: 'COLA_ILEGIBLE' })
  })
})

// ════════════════════════════════════════════════════════════════════════
describe('cerrarSesionSegura (store)', () => {
  // Deja algo en cada almacén local, para comprobar después qué se borró.
  async function poblarLocal() {
    await iniciarSesion(ana)
    await conCacheDeLectura('paciente:p1', async () => ({ nombre: 'Paciente 1' }))
    await guardarPerfilOffline({ userId: 'u1', perfil: ana })
    await configurarPin('u1', PIN, RAPIDO)
  }
  const localIntacto = async () => ({
    lectura: (await leerMetadato('usuario_dueno_de_la_cache')) !== null,
    perfil: (await leerPerfilOffline('u1')) !== null,
    pin: (await obtenerEstadoPin('u1')).configurado
  })

  it('con pendientes: BLOQUEA — no cierra, no toca signOut, no borra NADA', async () => {
    await poblarLocal()
    await encolarOperacion(op('n1', { usuarioId: 'u1' }))
    await encolarOperacion(op('n2', { usuarioId: 'u1' }))

    const r = await useAuthStore.getState().cerrarSesionSegura()

    expect(r.ok).toBe(false)
    expect(r.evaluacion).toMatchObject({ motivo: 'PENDIENTES', pendientes: 2 })
    expect(supabaseMock.auth.signOut).not.toHaveBeenCalled()
    expect(useAuthStore.getState().session).not.toBeNull()
    expect(await localIntacto()).toEqual({ lectura: true, perfil: true, pin: true })
    expect((await listarOperacionesPendientes()).map((o) => o.id)).toEqual(['n1', 'n2'])
  })

  it('con pendientes y SIN conexión: bloquea y la cola queda intacta en IndexedDB', async () => {
    await poblarLocal()
    await encolarOperacion(op('n1', { usuarioId: 'u1' }))
    ponerConexion(false)

    const r = await useAuthStore.getState().cerrarSesionSegura()

    expect(r.evaluacion).toMatchObject({ motivo: 'PENDIENTES', conectado: false })
    expect(supabaseMock.auth.signOut).not.toHaveBeenCalled()
    expect((await listarOperacionesPendientes())).toHaveLength(1)
  })

  it('sin pendientes pero SIN conexión: bloquea también', async () => {
    await poblarLocal()
    ponerConexion(false)
    const r = await useAuthStore.getState().cerrarSesionSegura()
    expect(r.evaluacion.motivo).toBe('SIN_CONEXION')
    expect(supabaseMock.auth.signOut).not.toHaveBeenCalled()
  })

  it('tras sincronizar (la cola queda vacía) YA se puede cerrar sesión', async () => {
    await poblarLocal()
    await encolarOperacion(op('n1', { usuarioId: 'u1' }))
    expect((await useAuthStore.getState().cerrarSesionSegura()).ok).toBe(false)

    await quitarOperacion('n1') // lo que hace el procesador al subirla
    expect((await useAuthStore.getState().cerrarSesionSegura()).ok).toBe(true)
  })

  it('al cerrar con la cola vacía: revoca en el servidor y BORRA caché clínica, perfil y PIN', async () => {
    await poblarLocal()
    const r = await useAuthStore.getState().cerrarSesionSegura()

    expect(r.ok).toBe(true)
    expect(supabaseMock.auth.signOut).toHaveBeenCalledTimes(1)
    expect(sesionesMock.marcarSesionFinalizada).not.toHaveBeenCalled() // no había sesionActualId
    expect(useAuthStore.getState()).toMatchObject({ session: null, perfil: null, modoOffline: false })
    expect(await localIntacto()).toEqual({ lectura: false, perfil: false, pin: false })
    await expect(conCacheDeLectura('paciente:p1', async () => { throw new Error('sin red') })).rejects.toThrow()
  })

  it('cerrar sesión NO borra los pendientes de OTRA cuenta que sigan en el equipo', async () => {
    await poblarLocal()
    await encolarOperacion(op('ajena', { usuarioId: 'u2' }))
    expect((await useAuthStore.getState().cerrarSesionSegura()).ok).toBe(true)
    expect((await listarOperacionesPendientes()).map((o) => o.id)).toEqual(['ajena'])
  })

  it('si signOut falla por red, igualmente queda cerrada la sesión local y limpia — sin lanzar error', async () => {
    await poblarLocal()
    supabaseMock.auth.signOut.mockResolvedValue({ error: errorDeRed })
    await expect(useAuthStore.getState().cerrarSesionSegura()).resolves.toMatchObject({ ok: true })
    expect(useAuthStore.getState().session).toBeNull()
    expect(await localIntacto()).toEqual({ lectura: false, perfil: false, pin: false })
  })
})

describe('logout() FORZADO (sesión revocada desde otro dispositivo, clínica suspendida)', () => {
  it('no se puede negar por pendientes — pero limpia lo local y CONSERVA la cola completa', async () => {
    await iniciarSesion(ana)
    await guardarPerfilOffline({ userId: 'u1', perfil: ana })
    await configurarPin('u1', PIN, RAPIDO)
    await encolarOperacion(op('n1', { usuarioId: 'u1' }))
    await encolarOperacion(op('ajena', { usuarioId: 'u2' }))

    await useAuthStore.getState().logout()

    expect(useAuthStore.getState().session).toBeNull()
    expect((await leerPerfilOffline('u1'))).toBeNull()
    expect((await obtenerEstadoPin('u1')).configurado).toBe(false)
    expect((await listarOperacionesPendientes()).map((o) => o.id).sort()).toEqual(['ajena', 'n1'])
  })

  it('cierra el registro de la sesión en el servidor cuando existe', async () => {
    await iniciarSesion(ana)
    useAuthStore.setState({ sesionActualId: 'ses1' })
    await useAuthStore.getState().logout()
    expect(sesionesMock.marcarSesionFinalizada).toHaveBeenCalledWith('ses1')
  })
})

// ════════════════════════════════════════════════════════════════════════
describe('Un equipo, varias personas: la caché no se filtra entre cuentas', () => {
  it('al iniciar sesión otra persona, lo guardado por la anterior se borra antes de usarse', async () => {
    await iniciarSesion(ana)
    await conCacheDeLectura('paciente:p1', async () => ({ nombre: 'Paciente de Ana' }))

    // La sesión de Ana murió sin cerrar (no pasó por logout); Luis inicia sesión.
    await iniciarSesion(luis)

    ponerConexion(false)
    await expect(conCacheDeLectura('paciente:p1', async () => { throw new Error('sin red') })).rejects.toThrow()
  })

  it('la misma persona conserva su caché entre recargas de perfil (no se borra a cada renovación de token)', async () => {
    await iniciarSesion(ana)
    await conCacheDeLectura('paciente:p1', async () => ({ nombre: 'Paciente 1' }))
    await useAuthStore.getState().cargarPerfil(sesionReal('u1'))
    await useAuthStore.getState().cargarPerfil(sesionReal('u1'))

    const r = await conCacheDeLectura('paciente:p1', async () => { throw new Error('sin red') })
    expect(r.datos).toEqual({ nombre: 'Paciente 1' })
  })

  it('el PIN de la persona anterior desaparece cuando otra inicia sesión con internet', async () => {
    await iniciarSesion(ana)
    await configurarPin('u1', PIN, RAPIDO)
    await iniciarSesion(luis)
    expect(await obtenerPinDisponible()).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════════════════
describe('Arranque offline con PIN', () => {
  // Estado de partida: Ana inició sesión con internet y activó un PIN.
  async function anaConPin(opciones = {}) {
    await iniciarSesion(ana)
    await guardarPerfilOffline({ userId: 'u1', perfil: ana, clinicaNombre: 'Clínica Sonrisa', clinicaEstado: 'activa' })
    await configurarPin('u1', PIN, { ...RAPIDO, ...opciones })
    useAuthStore.setState({ session: null, perfil: null, clinicaNombre: null, clinicaEstado: null, cargando: true })
  }
  // Se recarga la app SIN internet y con el token de Supabase ya vencido.
  async function reabrirSinInternet() {
    ponerConexion(false)
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: null }, error: errorDeRed })
    await useAuthStore.getState().init()
  }

  it('con PIN vigente, sin internet y token vencido: ofrece desbloquear (no manda a iniciar sesión)', async () => {
    await anaConPin()
    await reabrirSinInternet()

    const s = useAuthStore.getState()
    expect(s.desbloqueoOffline).toMatchObject({ userId: 'u1', nombre: 'Ana Dentista' })
    expect(s.session).toBeNull() // todavía NO hay sesión: falta el PIN
    expect(s.perfil).toBeNull()
    expect(s.cargando).toBe(false)
  })

  it('sin PIN configurado: no ofrece nada — a iniciar sesión, como antes', async () => {
    await iniciarSesion(ana)
    await guardarPerfilOffline({ userId: 'u1', perfil: ana })
    useAuthStore.setState({ session: null, perfil: null, cargando: true })
    await reabrirSinInternet()
    expect(useAuthStore.getState().desbloqueoOffline).toBeNull()
  })

  it('CON internet y sin sesión: el PIN no entra en juego — se inicia sesión con contraseña (no sustituye a Supabase Auth)', async () => {
    await anaConPin()
    ponerConexion(true)
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    await useAuthStore.getState().init()

    expect(useAuthStore.getState().desbloqueoOffline).toBeNull()
    expect(useAuthStore.getState().session).toBeNull()
  })

  it('con internet y un token que el SERVIDOR rechazó: tampoco se ofrece el PIN', async () => {
    await anaConPin()
    ponerConexion(true)
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: null }, error: tokenRevocado })
    await useAuthStore.getState().init()
    expect(useAuthStore.getState().desbloqueoOffline).toBeNull()
  })

  it('un wifi "conectado" que no sale a internet (navigator.onLine=true pero la red falla) SÍ ofrece el PIN', async () => {
    await anaConPin()
    ponerConexion(true)
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: null }, error: errorDeRed })
    await useAuthStore.getState().init()
    expect(useAuthStore.getState().desbloqueoOffline).not.toBeNull()
  })

  it('con una sesión válida de Supabase, arranca normal: sin pantalla de PIN y sin modo offline', async () => {
    await anaConPin()
    ponerConexion(true)
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: sesionReal('u1') }, error: null })
    await useAuthStore.getState().init()

    expect(useAuthStore.getState()).toMatchObject({ desbloqueoOffline: null, modoOffline: false, connectionStatus: 'online' })
    expect(useAuthStore.getState().session.access_token).toBe('jwt')
  })

  it('un PIN vencido no se ofrece: hay que conectarse', async () => {
    await anaConPin({ duracionHoras: 8 })
    vi.setSystemTime(Date.now() + 9 * HORA)
    await reabrirSinInternet()
    expect(useAuthStore.getState().desbloqueoOffline).toBeNull()
  })

  describe('desbloquear', () => {
    beforeEach(async () => { await anaConPin(); await reabrirSinInternet() })

    it('con el PIN correcto abre una sesión offline con la identidad guardada — y SIN ningún token', async () => {
      expect(await useAuthStore.getState().desbloquearConPin(PIN)).toEqual({ ok: true })

      const s = useAuthStore.getState()
      expect(s).toMatchObject({ modoOffline: true, connectionStatus: 'offline', desbloqueoOffline: null, cargando: false })
      expect(s.perfil).toEqual(ana)
      expect(s.clinicaNombre).toBe('Clínica Sonrisa')
      expect(s.session).toEqual({ offline: true, user: { id: 'u1' } })
      expect(JSON.stringify(s.session)).not.toMatch(/token|jwt/i)
    })

    it('con un PIN incorrecto NO abre nada, y dice cuántos intentos quedan', async () => {
      const r = await useAuthStore.getState().desbloquearConPin('000111')
      expect(r).toMatchObject({ ok: false, motivo: 'PIN_INCORRECTO', intentosRestantes: 4 })
      expect(useAuthStore.getState().session).toBeNull()
      expect(useAuthStore.getState().modoOffline).toBe(false)
      expect(useAuthStore.getState().desbloqueoOffline).not.toBeNull() // puede reintentar
    })

    it('tras demasiados errores el PIN se revoca y la oferta desaparece: solo queda iniciar sesión con contraseña', async () => {
      for (let i = 0; i < 10; i++) {
        await useAuthStore.getState().desbloquearConPin('000111')
        vi.setSystemTime(Date.now() + 16 * MIN)
      }
      expect(useAuthStore.getState().desbloqueoOffline).toBeNull()
      expect(useAuthStore.getState().session).toBeNull()
      expect((await obtenerEstadoPin('u1')).configurado).toBe(false)
    })

    it('el bloqueo temporal se respeta: ni el PIN correcto entra mientras dura', async () => {
      for (let i = 0; i < 5; i++) await useAuthStore.getState().desbloquearConPin('000111')
      const r = await useAuthStore.getState().desbloquearConPin(PIN)
      expect(r).toMatchObject({ ok: false, motivo: 'BLOQUEADO_TEMPORAL' })
      expect(useAuthStore.getState().session).toBeNull()
    })

    it('una clínica que estaba suspendida al guardar sigue suspendida offline', async () => {
      await guardarPerfilOffline({ userId: 'u1', perfil: ana, clinicaNombre: 'Clínica Sonrisa', clinicaEstado: 'suspendida' })
      await useAuthStore.getState().desbloquearConPin(PIN)
      expect(useAuthStore.getState().clinicaEstado).toBe('suspendida')
    })

    it('un evento "sin sesión" del cliente de Supabase no tira la sesión offline recién desbloqueada', async () => {
      const escuchar = supabaseMock.auth.onAuthStateChange.mock.calls.at(-1)[0]
      await useAuthStore.getState().desbloquearConPin(PIN)

      escuchar('SIGNED_OUT', null)
      expect(useAuthStore.getState().session).toEqual({ offline: true, user: { id: 'u1' } })
    })
  })

  it('sin oferta de desbloqueo, desbloquearConPin no hace nada', async () => {
    expect(await useAuthStore.getState().desbloquearConPin(PIN)).toEqual({ ok: false, motivo: 'NO_DISPONIBLE' })
    expect(useAuthStore.getState().session).toBeNull()
  })

  it('sin modo offline, un evento "sin sesión" SÍ cierra la sesión (comportamiento normal intacto)', async () => {
    await anaConPin()
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: sesionReal('u1') }, error: null })
    await useAuthStore.getState().init()
    const escuchar = supabaseMock.auth.onAuthStateChange.mock.calls.at(-1)[0]

    escuchar('SIGNED_OUT', null)
    expect(useAuthStore.getState().session).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════════════════
describe('Volver la conexión: Supabase Auth manda, el PIN nunca lo sustituye', () => {
  async function desbloqueada() {
    await iniciarSesion(ana)
    await guardarPerfilOffline({ userId: 'u1', perfil: ana })
    await configurarPin('u1', PIN, RAPIDO)
    await encolarOperacion(op('n1', { usuarioId: 'u1' }))
    useAuthStore.setState({ session: null, perfil: null, cargando: true })
    ponerConexion(false)
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: null }, error: errorDeRed })
    await useAuthStore.getState().init()
    await useAuthStore.getState().desbloquearConPin(PIN)
    expect(useAuthStore.getState().modoOffline).toBe(true)
  }

  it('si el servidor renueva la sesión: se pasa a sesión REAL, con token, y sale del modo offline', async () => {
    await desbloqueada()
    ponerConexion(true)
    servidorPara(ana)
    supabaseMock.auth.refreshSession.mockResolvedValue({ data: { session: sesionReal('u1') }, error: null })

    expect(await useAuthStore.getState().reanudarSesionOnline()).toEqual({ ok: true })

    const s = useAuthStore.getState()
    expect(s.modoOffline).toBe(false)
    expect(s.connectionStatus).toBe('online')
    expect(s.session.access_token).toBe('jwt') // ahora sí es la sesión de Supabase
    expect(s.sesionActualId).toBe('ses1')
    expect(supabaseMock.auth.refreshSession).toHaveBeenCalledTimes(1)
  })

  it('si aún no hay red de verdad: sigue offline, sin perder la sesión desbloqueada', async () => {
    await desbloqueada()
    supabaseMock.auth.refreshSession.mockResolvedValue({ data: { session: null }, error: errorDeRed })

    expect(await useAuthStore.getState().reanudarSesionOnline()).toEqual({ ok: false, motivo: 'SIN_RED' })
    expect(useAuthStore.getState()).toMatchObject({ modoOffline: true, session: { offline: true, user: { id: 'u1' } } })
  })

  it('si el servidor RECHAZA la sesión: termina el modo offline, se revoca el PIN y se va a iniciar sesión — la cola se conserva', async () => {
    await desbloqueada()
    ponerConexion(true)
    supabaseMock.auth.refreshSession.mockResolvedValue({ data: { session: null }, error: tokenRevocado })

    expect(await useAuthStore.getState().reanudarSesionOnline()).toEqual({ ok: false, motivo: 'SESION_INVALIDA' })

    expect(useAuthStore.getState()).toMatchObject({ session: null, perfil: null, modoOffline: false })
    expect((await obtenerEstadoPin('u1')).configurado).toBe(false)
    expect((await listarOperacionesPendientes()).map((o) => o.id)).toEqual(['n1'])
  })

  it('un token de Supabase que ya no existe (sin refresh token) también termina la sesión offline', async () => {
    await desbloqueada()
    supabaseMock.auth.refreshSession.mockResolvedValue({ data: { session: null }, error: { name: 'AuthSessionMissingError', message: 'Auth session missing!' } })
    expect((await useAuthStore.getState().reanudarSesionOnline()).motivo).toBe('SESION_INVALIDA')
  })

  it('fuera del modo offline no toca Supabase', async () => {
    await iniciarSesion(ana)
    expect(await useAuthStore.getState().reanudarSesionOnline()).toEqual({ ok: true })
    expect(supabaseMock.auth.refreshSession).not.toHaveBeenCalled()
  })
})

// ════════════════════════════════════════════════════════════════════════
describe('Gestionar el PIN: solo con sesión REAL y con internet', () => {
  it('con sesión real e internet: activa el PIN y deja guardado el perfil con el que armar la sesión offline', async () => {
    await iniciarSesion(ana)
    const r = await useAuthStore.getState().configurarPinOffline(PIN, 24)

    expect(r.ok).toBe(true)
    expect((await obtenerEstadoPin('u1'))).toMatchObject({ configurado: true, duracionHoras: 24 })
    expect((await leerPerfilOffline('u1')).perfil).toEqual(ana)
  })

  it('SIN internet no se puede crear, cambiar ni revocar el PIN', async () => {
    await iniciarSesion(ana)
    await configurarPin('u1', PIN, RAPIDO)
    ponerConexion(false)

    for (const r of [
      await useAuthStore.getState().configurarPinOffline('719304'),
      await useAuthStore.getState().cambiarPinOffline(PIN, '719304'),
      await useAuthStore.getState().revocarPinOffline()
    ]) expect(r).toEqual({ ok: false, motivo: 'REQUIERE_CONEXION' })
    expect((await obtenerEstadoPin('u1')).configurado).toBe(true) // y sigue intacto
  })

  it('desde una sesión offline (ya desbloqueada con PIN) tampoco: no se puede crear otro PIN ni revocar', async () => {
    useAuthStore.setState({ session: { offline: true, user: { id: 'u1' } }, perfil: ana, modoOffline: true })
    ponerConexion(true) // aunque haya red, la sesión aún no es real

    for (const r of [
      await useAuthStore.getState().configurarPinOffline(PIN),
      await useAuthStore.getState().cambiarPinOffline(PIN, '719304'),
      await useAuthStore.getState().revocarPinOffline()
    ]) expect(r).toEqual({ ok: false, motivo: 'REQUIERE_SESION_REAL' })
  })

  it('sin sesión no se puede gestionar', async () => {
    expect(await useAuthStore.getState().configurarPinOffline(PIN)).toEqual({ ok: false, motivo: 'REQUIERE_SESION_REAL' })
  })

  it('cambiar exige el PIN actual', async () => {
    await iniciarSesion(ana)
    await configurarPin('u1', PIN, RAPIDO)
    expect((await useAuthStore.getState().cambiarPinOffline('000111', '719304')).motivo).toBe('PIN_INCORRECTO')
    expect((await useAuthStore.getState().cambiarPinOffline(PIN, '719304')).ok).toBe(true)
  })

  it('revocar (olvidé mi PIN) funciona con sesión real e internet, sin pedir el PIN', async () => {
    await iniciarSesion(ana)
    await configurarPin('u1', PIN, RAPIDO)
    expect(await useAuthStore.getState().revocarPinOffline()).toEqual({ ok: true })
    expect((await obtenerEstadoPin('u1')).configurado).toBe(false)
  })

  it('cada validación con internet desliza la vigencia: 7 h + 7 h con un PIN de 8 h sigue valiendo', async () => {
    await iniciarSesion(ana)
    await configurarPin('u1', PIN, { ...RAPIDO, duracionHoras: 8 })
    vi.setSystemTime(Date.now() + 7 * HORA)
    await useAuthStore.getState().cargarPerfil(sesionReal('u1')) // vuelve a validar con el servidor
    await new Promise((r) => setTimeout(r, 0))

    vi.setSystemTime(Date.now() + 7 * HORA)
    expect(await obtenerPinDisponible()).not.toBeNull()
  })
})
