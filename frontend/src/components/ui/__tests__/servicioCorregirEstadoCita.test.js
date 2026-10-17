// Servicio corregirEstadoCita (migración 094): requiere conexión, devuelve el mensaje del servidor en los rechazos de negocio y trata los errores técnicos aparte.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const m = vi.hoisted(() => ({ rpc: vi.fn(), sesion: true }))
vi.mock('../../../lib/supabase', () => ({ supabase: { rpc: (...a) => m.rpc(...a), from: vi.fn(), auth: { getSession: async () => ({ data: { session: m.sesion ? { access_token: 't', expires_at: Math.floor(Date.now() / 1000) + 3600 } : null } }), onAuthStateChange: vi.fn() }, channel: vi.fn(), removeChannel: vi.fn() } }))

import { corregirEstadoCita, CODIGOS_CORRECCION } from '../../../services/citas.js'
import { ErrorDeDatos, esErrorDeDatosDefinitivo, clasificarErrorDeDatos } from '../../../lib/erroresDatos.js'

const entrada = { citaId: 'c1', estado: 'agendada', motivo: 'Se finalizó por error: era otro paciente' }
beforeEach(() => { m.rpc.mockReset(); m.sesion = true; Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true }) })
afterEach(() => { Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true }) })

describe('corregirEstadoCita', () => {
  it('llama a fn_corregir_estado_cita UNA vez con los parámetros correctos (nunca un UPDATE directo)', async () => {
    m.rpc.mockResolvedValue({ data: { ok: true, antes: 'completada', despues: 'agendada' }, error: null })
    expect(await corregirEstadoCita(entrada)).toEqual({ ok: true, antes: 'completada', despues: 'agendada' })
    expect(m.rpc).toHaveBeenCalledTimes(1); expect(m.rpc).toHaveBeenCalledWith('fn_corregir_estado_cita', { p_cita: 'c1', p_estado: 'agendada', p_motivo: entrada.motivo })
  })
  it('SIN conexión no se llama a nada y el mensaje lo explica (es un cambio de historial: no se encola a ciegas)', async () => {
    Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true })
    const e = await corregirEstadoCita(entrada).catch((x) => x); expect(m.rpc).not.toHaveBeenCalled(); expect(e.codigo).toBe('SIN_CONEXION'); expect(e.message).toMatch(/requiere conexión/)
  })
  it.each(CODIGOS_CORRECCION)('el rechazo de negocio %s llega con el MENSAJE del servidor y su código', async (hint) => {
    m.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', hint, message: `mensaje del servidor para ${hint}` } })
    const e = await corregirEstadoCita(entrada).catch((x) => x); expect(e.codigo).toBe(hint); expect(e.message).toBe(`mensaje del servidor para ${hint}`)
  })
  it('un error TÉCNICO no se muestra tal cual: se clasifica (permisos → SIN_PERMISO; red → SIN_CONEXION) y no filtra texto de la base', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied for table citas' } })
    const e = await corregirEstadoCita(entrada).catch((x) => x); expect(e).toBeInstanceOf(ErrorDeDatos); expect(e.message).not.toMatch(/permission denied|citas/i)
    m.rpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } })
    expect((await corregirEstadoCita(entrada).catch((x) => x)).codigo).toBe('SIN_CONEXION')
  })
  it('la lista de códigos del frontend coincide con los de la función SQL de la migración 094', async () => {
    const { readFileSync } = await import('node:fs')
    const sql = readFileSync(new URL('../../../../../supabase/migrations/094_sirso_correccion_citas_completadas.sql', import.meta.url), 'utf8')
    const enFn = sql.slice(sql.indexOf('create or replace function fn_corregir_estado_cita'))
    const hints = new Set([...enFn.matchAll(/hint = '([A-Z_]+)'/g)].map((x) => x[1]))
    for (const c of hints) expect(CODIGOS_CORRECCION, `el código ${c} del SQL no está en el frontend`).toContain(c)
    for (const c of CODIGOS_CORRECCION) expect([...hints], `el código ${c} del frontend no existe en el SQL`).toContain(c)
  })
  it('el cambio DIRECTO de estado bloqueado por la base (CORREGIR_ESTADO_REQUIERE_MOTIVO) se clasifica como error de integridad DEFINITIVO con una instrucción clara', () => {
    const e = clasificarErrorDeDatos({ code: 'P0001', hint: 'CORREGIR_ESTADO_REQUIERE_MOTIVO', message: 'x' }, { haySesion: true })
    expect(e.codigo).toBe('INTEGRIDAD_DATOS'); expect(e.message).toMatch(/Corregir consulta/); expect(esErrorDeDatosDefinitivo(e)).toBe(true)
  })
})
