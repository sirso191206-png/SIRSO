// Servicios de la migración 090 (completar una consulta pendiente, listarlas) y el hook que las expone.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createElement as h } from 'react'
import TestRenderer, { act } from 'react-test-renderer'

const m = vi.hoisted(() => ({ rpc: vi.fn(), listar: vi.fn() }))
vi.mock('../../../lib/supabase', () => ({ supabase: { rpc: (...a) => m.rpc(...a), from: vi.fn(), auth: { onAuthStateChange: vi.fn() }, channel: vi.fn(), removeChannel: vi.fn() } }))

import { completarConsultaPendiente, listarConsultasSinNota } from '../../../services/consultas.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
beforeEach(() => { m.rpc.mockReset(); vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => vi.restoreAllMocks())

describe('completarConsultaPendiente', () => {
  const datos = { citaId: 'c1', nota: { id: 'n1', contenido: 'SECRETO clínico' }, seguimiento: { id: 's1', inicio: 'a', fin: 'b' } }
  it('llama a fn_completar_consulta_pendiente UNA vez con los parámetros correctos (sin tocar tablas)', async () => {
    m.rpc.mockResolvedValue({ data: { ok: true, ya_existia: false }, error: null })
    expect(await completarConsultaPendiente(datos)).toEqual({ ok: true, ya_existia: false })
    expect(m.rpc).toHaveBeenCalledTimes(1); expect(m.rpc).toHaveBeenCalledWith('fn_completar_consulta_pendiente', { p_cita: 'c1', p_nota: datos.nota, p_seguimiento: datos.seguimiento })
  })
  it('lo opcional viaja como null', async () => {
    m.rpc.mockResolvedValue({ data: { ok: true }, error: null }); await completarConsultaPendiente({ citaId: 'c1', nota: datos.nota })
    expect(m.rpc).toHaveBeenCalledWith('fn_completar_consulta_pendiente', { p_cita: 'c1', p_nota: datos.nota, p_seguimiento: null })
  })
  it('un rechazo conocido llega con el MENSAJE del servidor y su código', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', hint: 'CONSULTA_YA_TIENE_NOTA', message: 'La cita ya tiene una nota clínica; no se creó otra.' } })
    const e = await completarConsultaPendiente(datos).catch((x) => x)
    expect(e.codigo).toBe('CONSULTA_YA_TIENE_NOTA'); expect(e.message).toBe('La cita ya tiene una nota clínica; no se creó otra.')
  })
  it('un error técnico NO se muestra tal cual, y el registro de diagnóstico NO contiene datos clínicos', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied for table notas_clinicas' } })
    const e = await completarConsultaPendiente(datos).catch((x) => x)
    expect(e.message).not.toMatch(/notas_clinicas|permission denied|42501/); expect(JSON.stringify(console.error.mock.calls)).not.toContain('SECRETO'); expect(JSON.stringify(console.error.mock.calls)).toContain('c1')
  })
})

describe('listarConsultasSinNota', () => {
  it('llama a fn_consultas_sin_nota con la ventana de días y devuelve la lista (vacía si no hay datos)', async () => {
    m.rpc.mockResolvedValue({ data: [{ cita_id: 'c1' }], error: null }); expect(await listarConsultasSinNota(60)).toEqual([{ cita_id: 'c1' }]); expect(m.rpc).toHaveBeenCalledWith('fn_consultas_sin_nota', { p_dias: 60 })
    m.rpc.mockResolvedValue({ data: null, error: null }); expect(await listarConsultasSinNota()).toEqual([]); expect(m.rpc).toHaveBeenLastCalledWith('fn_consultas_sin_nota', { p_dias: 30 })
  })
  it('un error se propaga con mensaje claro (no se inventa una lista)', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } })
    await expect(listarConsultasSinNota()).rejects.toThrow(/no hay conexión/)
  })
})

describe('useConsultasPendientes', () => {
  async function montar(args = []) {
    const { useConsultasPendientes } = await import('../../../hooks/useConsultasPendientes.js')
    let ultimo; function Sonda() { ultimo = useConsultasPendientes(...args); return null }
    let r; await act(async () => { r = TestRenderer.create(h(Sonda)); await new Promise((x) => setTimeout(x, 0)) })
    return { get v() { return ultimo }, r }
  }
  it('carga la lista del servidor', async () => {
    m.rpc.mockResolvedValue({ data: [{ cita_id: 'c1' }], error: null }); const s = await montar([30])
    expect(s.v.pendientes).toEqual([{ cita_id: 'c1' }]); expect(s.v.error).toBeNull(); expect(s.v.cargando).toBe(false)
  })
  it('ante un error la lista queda VACÍA y el error se expone (no se inventan pendientes)', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } }); const s = await montar([30])
    expect(s.v.pendientes).toEqual([]); expect(s.v.error).toMatch(/no hay conexión/)
  })
  it('al RECARGAR tras un error la lista anterior se VACÍA (no se muestran pendientes viejas que ya no se pueden comprobar)', async () => {
    m.rpc.mockResolvedValueOnce({ data: [{ cita_id: 'c1' }], error: null }); const s = await montar([30])
    expect(s.v.pendientes).toHaveLength(1)
    m.rpc.mockResolvedValueOnce({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } })
    await act(async () => { await s.v.recargar() })
    expect(s.v.pendientes).toEqual([]); expect(s.v.error).toMatch(/no hay conexión/)
  })
  it('deshabilitado no consulta nada', async () => {
    const s = await montar([365, false]); expect(m.rpc).not.toHaveBeenCalled(); expect(s.v.pendientes).toEqual([]); expect(s.v.cargando).toBe(false)
  })
})
