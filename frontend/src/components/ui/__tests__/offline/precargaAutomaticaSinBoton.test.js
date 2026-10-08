// Sin botón "Sincronizar mi día": el médico no hace nada. La precarga del día se dispara sola,
// se mantiene fresca y se reintenta si falla.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const m = vi.hoisted(() => ({ conexionReal: vi.fn(), sincronizarMiDia: vi.fn(), ultima: vi.fn() }))
vi.mock('../../../../lib/supabase', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), auth: { onAuthStateChange: vi.fn() } } }))
vi.mock('../../../../lib/conectividadReal', () => ({ verificarConexionReal: m.conexionReal }))
vi.mock('../../../../services/sincronizacionDia', () => ({
  sincronizarMiDia: m.sincronizarMiDia, obtenerUltimaSincronizacion: m.ultima
}))

import { precargaVigente, precargarSiHaceFalta, PRECARGA_VIGENCIA_MS, REVISION_PRECARGA_MS } from '../../../../hooks/usePrecargaAutomaticaDelDia.js'
import { REVISION_REPLICA_MS } from '../../../../hooks/useSincronizacionClinica.js'
import { programarRevisiones } from '../../../../lib/revisionPeriodica.js'

const AHORA = new Date(2026, 9, 6, 12, 0, 0)
const hace = (min) => new Date(AHORA.getTime() - min * 60 * 1000).toISOString()
const dentista = { id: 'd1', rol: 'dentista' }
const owner = { id: 'o1', rol: 'owner' }

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AHORA)
  Object.values(m).forEach((f) => f.mockReset())
  m.conexionReal.mockResolvedValue(true)
  m.sincronizarMiDia.mockResolvedValue({ sincronizadoEn: AHORA.toISOString() })
  m.ultima.mockResolvedValue(null)
})
afterEach(() => vi.useRealTimers())

describe('precargaVigente: cuándo lo guardado todavía sirve', () => {
  it('de hoy, de esta sucursal y reciente → vigente', () => {
    expect(precargaVigente({ sincronizadoEn: hace(10), sucursalId: 's1' }, 's1')).toBe(true)
    expect(precargaVigente({ sincronizadoEn: hace(10) }, undefined)).toBe(true)
  })
  it('con más de 30 min deja de ser vigente (se renueva sola; ya no es "una vez al día")', () => {
    expect(precargaVigente({ sincronizadoEn: hace(29), sucursalId: null }, undefined)).toBe(true)
    expect(precargaVigente({ sincronizadoEn: hace(31), sucursalId: null }, undefined)).toBe(false)
    expect(PRECARGA_VIGENCIA_MS).toBe(30 * 60 * 1000)
  })
  it('nunca precargada, de ayer (cambio de día con SIRO abierto) o con el reloj en el futuro → no vigente', () => {
    expect(precargaVigente(null, undefined)).toBe(false)
    expect(precargaVigente({ sincronizadoEn: new Date(2026, 9, 5, 23, 59).toISOString() }, undefined)).toBe(false)
    expect(precargaVigente({ sincronizadoEn: new Date(AHORA.getTime() + 5 * 60000).toISOString() }, undefined)).toBe(false)
  })
  it('cambiar de sucursal invalida lo precargado (otra sucursal = otras citas)', () => {
    expect(precargaVigente({ sincronizadoEn: hace(1), sucursalId: 's1' }, 's2')).toBe(false)
    expect(precargaVigente({ sincronizadoEn: hace(1), sucursalId: 's1' }, undefined)).toBe(false)
  })
  it('un registro de una versión anterior (sin sucursalId) cuenta como "sin sucursal"', () => {
    expect(precargaVigente({ sincronizadoEn: hace(1) }, undefined)).toBe(true)
    expect(precargaVigente({ sincronizadoEn: hace(1) }, 's1')).toBe(false)
  })
})

describe('precargarSiHaceFalta: lo que ocurre sin que nadie pulse nada', () => {
  it('sin conexión REAL no hace nada (y no lanza)', async () => {
    m.conexionReal.mockResolvedValue(false)
    expect(await precargarSiHaceFalta({ perfil: dentista })).toBe('sin_conexion')
    expect(m.sincronizarMiDia).not.toHaveBeenCalled()
  })
  it('primera vez: precarga el día. El dentista solo con SUS citas; owner/recepción, las de toda la clínica', async () => {
    expect(await precargarSiHaceFalta({ perfil: dentista, sucursalId: 's1' })).toBe('hecha')
    expect(m.sincronizarMiDia).toHaveBeenLastCalledWith({ dentistaId: 'd1', perfil: dentista, sucursalId: 's1' })
    await precargarSiHaceFalta({ perfil: owner })
    expect(m.sincronizarMiDia).toHaveBeenLastCalledWith({ dentistaId: undefined, perfil: owner, sucursalId: undefined })
  })
  it('si lo guardado es reciente NO repite el trabajo (revisar cada pocos minutos es barato)', async () => {
    m.ultima.mockResolvedValue({ sincronizadoEn: hace(5), sucursalId: null })
    expect(await precargarSiHaceFalta({ perfil: dentista })).toBe('vigente')
    expect(m.sincronizarMiDia).not.toHaveBeenCalled()
  })
  it('si pasaron más de 30 min lo RENUEVA solo: las citas nuevas de la mañana quedan guardadas', async () => {
    m.ultima.mockResolvedValue({ sincronizadoEn: hace(45), sucursalId: null })
    expect(await precargarSiHaceFalta({ perfil: dentista })).toBe('hecha')
    expect(m.sincronizarMiDia).toHaveBeenCalledTimes(1)
  })
  it('al cambiar de sucursal precarga la nueva aunque la anterior fuera reciente', async () => {
    m.ultima.mockResolvedValue({ sincronizadoEn: hace(1), sucursalId: 's1' })
    expect(await precargarSiHaceFalta({ perfil: dentista, sucursalId: 's2' })).toBe('hecha')
  })
  it('si falla NO lanza ni alarma, y como no se marcó como hecha la siguiente revisión lo reintenta', async () => {
    m.sincronizarMiDia.mockRejectedValueOnce(new Error('Sin conexión: no se pudo traer información actualizada.'))
    await expect(precargarSiHaceFalta({ perfil: dentista })).resolves.toBe('fallo')
    expect(await precargarSiHaceFalta({ perfil: dentista })).toBe('hecha')
    expect(m.sincronizarMiDia).toHaveBeenCalledTimes(2)
  })
  it('un fallo al leer lo guardado se trata como "nunca precargada" y precarga', async () => {
    m.ultima.mockRejectedValue(new Error('IndexedDB'))
    expect(await precargarSiHaceFalta({ perfil: dentista })).toBe('hecha')
  })
})

describe('programarRevisiones: el reloj que mantiene todo al día', () => {
  function docFalso(visible = true) {
    const oyentes = {}
    return {
      visibilityState: visible ? 'visible' : 'hidden',
      addEventListener: (e, f) => { oyentes[e] = f }, removeEventListener: (e) => { delete oyentes[e] },
      emitir: (e) => oyentes[e]?.(), oyentes
    }
  }
  it('revisa cada intervalo, sin que nadie haga nada', () => {
    const intentar = vi.fn(); const doc = docFalso()
    programarRevisiones(intentar, { intervaloMs: REVISION_PRECARGA_MS, doc })
    vi.advanceTimersByTime(REVISION_PRECARGA_MS * 3)
    expect(intentar).toHaveBeenCalledTimes(3)
  })
  it('revisa al volver a la pestaña (visible) y NO cuando se oculta', () => {
    const intentar = vi.fn(); const doc = docFalso()
    programarRevisiones(intentar, { intervaloMs: 60000, doc })
    doc.visibilityState = 'hidden'; doc.emitir('visibilitychange')
    expect(intentar).not.toHaveBeenCalled()
    doc.visibilityState = 'visible'; doc.emitir('visibilitychange')
    expect(intentar).toHaveBeenCalledTimes(1)
  })
  it('al cancelar (cerrar sesión / perder conexión) se detiene todo: ni reloj ni oyentes', () => {
    const intentar = vi.fn(); const doc = docFalso()
    const detener = programarRevisiones(intentar, { intervaloMs: 1000, doc })
    detener()
    vi.advanceTimersByTime(10000); doc.emitir('visibilitychange')
    expect(intentar).not.toHaveBeenCalled()
    expect(Object.keys(doc.oyentes)).toHaveLength(0)
  })
  it('sin documento (entorno sin DOM) no falla', () => {
    expect(() => programarRevisiones(vi.fn(), { intervaloMs: 1000, doc: null })()).not.toThrow()
  })
  it('las cadencias: día cada 5 min, réplica de pacientes/agenda cada 10 min', () => {
    expect(REVISION_PRECARGA_MS).toBe(5 * 60 * 1000)
    expect(REVISION_REPLICA_MS).toBe(10 * 60 * 1000)
  })
})
