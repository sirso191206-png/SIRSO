// Sesiones por dispositivo (migración 078): servicio, mensajes y la revisión que cierra la sesión local.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../../../lib/supabase', () => ({ supabase: { rpc: m.rpc, from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn(), auth: { onAuthStateChange: vi.fn() } } }))

import { listarSesionesReales, cerrarSesionRemota, obtenerEstadoMiSesion, describirDispositivo, mensajeSesionCerrada } from '../../../../services/sesiones.js'
import { revisarSesion, REVISION_SESION_MS } from '../../../../hooks/useEscucharCierreSesion.js'

beforeEach(() => m.rpc.mockReset())

describe('servicio de sesiones reales', () => {
  it('listarSesionesReales llama a mis_sesiones_activas y devuelve las filas', async () => {
    m.rpc.mockResolvedValue({ data: [{ id: 's1', es_actual: true, vigente: true }], error: null })
    expect(await listarSesionesReales()).toEqual([{ id: 's1', es_actual: true, vigente: true }])
    expect(m.rpc).toHaveBeenCalledWith('mis_sesiones_activas')
  })
  it('sin filas devuelve [] (no null)', async () => {
    m.rpc.mockResolvedValue({ data: null, error: null })
    expect(await listarSesionesReales()).toEqual([])
  })
  it('cerrarSesionRemota llama a cerrar_sesion_remota con el id de ESA sesión', async () => {
    m.rpc.mockResolvedValue({ data: null, error: null })
    await cerrarSesionRemota('sesion-ajena')
    expect(m.rpc).toHaveBeenCalledWith('cerrar_sesion_remota', { p_sesion_id: 'sesion-ajena' })
  })
  it('los errores de la base se propagan SIN modificar (no se disfrazan de éxito)', async () => {
    const err = { code: 'P0001', message: 'No se encontró esa sesión.' }
    m.rpc.mockResolvedValue({ data: null, error: err })
    await expect(cerrarSesionRemota('x')).rejects.toBe(err)
    await expect(listarSesionesReales()).rejects.toBe(err)
    await expect(obtenerEstadoMiSesion()).rejects.toBe(err)
  })
  it('obtenerEstadoMiSesion llama a mi_sesion_estado', async () => {
    m.rpc.mockResolvedValue({ data: { valida: true, motivo: 'activa' }, error: null })
    expect(await obtenerEstadoMiSesion()).toEqual({ valida: true, motivo: 'activa' })
    expect(m.rpc).toHaveBeenCalledWith('mi_sesion_estado')
  })
})

describe('describirDispositivo: se reconoce "cuál es cuál" desde el user_agent que guarda Supabase Auth', () => {
  const UA = {
    chromeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    edgeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 Edg/124.0',
    safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    safariIpad: 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
    firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
    safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
  }
  it('Chrome/Edge en Windows', () => {
    expect(describirDispositivo(UA.chromeWin)).toBe('Chrome · Windows')
    expect(describirDispositivo(UA.edgeWin)).toBe('Edge · Windows')
  })
  it('un iPhone o iPad es iOS, NO macOS (su user agent dice "like Mac OS X")', () => {
    expect(describirDispositivo(UA.safariIphone)).toBe('Safari · iOS')
    expect(describirDispositivo(UA.safariIpad)).toBe('Safari · iOS')
  })
  it('Android es Android, no Linux; Firefox en Linux y Safari en Mac', () => {
    expect(describirDispositivo(UA.chromeAndroid)).toBe('Chrome · Android')
    expect(describirDispositivo(UA.firefoxLinux)).toBe('Firefox · Linux')
    expect(describirDispositivo(UA.safariMac)).toBe('Safari · macOS')
  })
  it('sin user_agent no truena', () => {
    expect(describirDispositivo(null)).toBe('Dispositivo desconocido')
    expect(describirDispositivo(undefined)).toBe('Dispositivo desconocido')
    expect(describirDispositivo('')).toBe('Dispositivo desconocido')
  })
})

describe('mensajeSesionCerrada: qué ve la persona cuando la cierran', () => {
  it('cerrada desde otro dispositivo: lo dice y avisa que sus cambios se conservan', () => {
    const msg = mensajeSesionCerrada('revocada')
    expect(msg).toMatch(/cerró desde otro dispositivo/)
    expect(msg).toMatch(/cambios sin subir se conservan/)
  })
  it('excedida: dice cuántas sesiones permite el plan (singular y plural)', () => {
    expect(mensajeSesionCerrada('excedida', 1)).toMatch(/permite 1 sesión a la vez/)
    expect(mensajeSesionCerrada('excedida', 3)).toMatch(/permite 3 sesiones a la vez/)
  })
  it('sin límite conocido igual da un mensaje comprensible', () => {
    expect(mensajeSesionCerrada('excedida')).toMatch(/otro dispositivo/)
  })
})

describe('revisarSesion: cuándo se cierra la sesión local', () => {
  it('si el servidor dice que ya no es válida → cierra, con el motivo y el límite', async () => {
    const cerrar = vi.fn()
    const r = await revisarSesion(cerrar, async () => ({ valida: false, motivo: 'excedida', limite: 1 }))
    expect(r).toBe(true)
    expect(cerrar).toHaveBeenCalledWith('excedida', 1)
  })
  it('revocada desde otro dispositivo → cierra', async () => {
    const cerrar = vi.fn()
    expect(await revisarSesion(cerrar, async () => ({ valida: false, motivo: 'revocada' }))).toBe(true)
    expect(cerrar).toHaveBeenCalledWith('revocada', undefined)
  })
  it('si es válida NO cierra', async () => {
    const cerrar = vi.fn()
    expect(await revisarSesion(cerrar, async () => ({ valida: true, motivo: 'activa' }))).toBe(false)
    expect(cerrar).not.toHaveBeenCalled()
  })
  it('SIN RED NO cierra la sesión: SIRO trabaja offline y sin red no se puede saber', async () => {
    const cerrar = vi.fn()
    expect(await revisarSesion(cerrar, async () => { throw { message: 'TypeError: Failed to fetch' } })).toBe(false)
    expect(cerrar).not.toHaveBeenCalled()
  })
  it('si la función aún no existe en la base (migración sin aplicar) tampoco cierra nada', async () => {
    const cerrar = vi.fn()
    expect(await revisarSesion(cerrar, async () => { throw { code: 'PGRST202', message: 'function not found' } })).toBe(false)
    expect(cerrar).not.toHaveBeenCalled()
  })
  it('una respuesta vacía no se interpreta como "inválida"', async () => {
    const cerrar = vi.fn()
    expect(await revisarSesion(cerrar, async () => null)).toBe(false)
    expect(await revisarSesion(cerrar, async () => ({}))).toBe(false)
    expect(cerrar).not.toHaveBeenCalled()
  })
  it('se revisa cada minuto', () => expect(REVISION_SESION_MS).toBe(60000))
})
