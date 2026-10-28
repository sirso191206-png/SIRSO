// Entradas y salidas de inventario hechas SIN conexión (migración 117): pasan por la cola offline existente. El id viaja en
// la operación, así que un reintento no suma dos veces; un rechazo de negocio se conserva como conflicto (no se pierde ni se
// reintenta solo).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'

const m = vi.hoisted(() => ({ refreshSession: vi.fn(), rpc: vi.fn(), from: vi.fn(), toastExito: vi.fn(), toastError: vi.fn() }))
vi.mock('../../../../lib/supabase', () => ({ supabase: { auth: { refreshSession: m.refreshSession }, rpc: m.rpc, from: m.from } }))
vi.mock('../../../../store/useToastStore', () => ({ toastExito: m.toastExito, toastError: m.toastError }))

import { procesarColaOffline } from '../../../../lib/procesadorColaOffline.js'
import { listarOperacionesPendientes, encolarOperacion } from '../../../../lib/colaOffline.js'

const operacion = (id, cantidad = 4) => ({
  id, tipo: 'registrar_movimiento_inventario', entidad: 'movimientos_inventario', entidadId: id,
  payload: { id, materialId: 'm1', tipo: 'entrada', cantidad, motivo: null },
  dependeDe: [], creado_en: Date.now(), usuarioId: 'u1', clinicaId: 'c1', sucursalId: null, claveIdempotencia: id
})

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  Object.values(m).forEach((f) => f.mockReset())
  m.refreshSession.mockResolvedValue({ data: { session: { access_token: 'x', user: { id: 'u1' } } }, error: null })
})

describe('registrar_movimiento_inventario en la cola sin conexión', () => {
  it('al reconectar se sube con SU id y sale de la cola', async () => {
    m.rpc.mockResolvedValue({ data: { ok: true, ya_registrado: false, stock: 4 }, error: null })
    await encolarOperacion(operacion('op-1'))
    await procesarColaOffline()
    expect(m.rpc).toHaveBeenCalledWith('fn_inventario_registrar_movimiento', { p_material: 'm1', p_tipo: 'entrada', p_cantidad: 4, p_motivo: null, p_id: 'op-1' })
    expect(await listarOperacionesPendientes()).toHaveLength(0)
  })

  it('un rechazo definitivo (p. ej. plan sin inventario) se conserva como conflicto y no se reintenta solo', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: 'Tu plan no incluye el inventario de materiales.', hint: 'FUNCIONALIDAD_NO_INCLUIDA', code: 'P0001' } })
    await encolarOperacion(operacion('op-2'))
    await procesarColaOffline()
    const [pendiente] = await listarOperacionesPendientes()
    expect(pendiente?.id).toBe('op-2')
    expect(pendiente?.estado).toBe('conflicto')
    expect(m.toastError).toHaveBeenCalledWith(expect.stringMatching(/plan no incluye el inventario/))
  })

  it('una falla de red se reintenta más tarde (no es conflicto)', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } })
    await encolarOperacion(operacion('op-3'))
    await procesarColaOffline()
    const [pendiente] = await listarOperacionesPendientes()
    expect(pendiente?.id).toBe('op-3')
    expect(pendiente?.estado).not.toBe('conflicto')
  })
})
