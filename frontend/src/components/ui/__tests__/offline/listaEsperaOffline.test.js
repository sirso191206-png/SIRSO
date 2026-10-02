// Agregar a la lista de espera / marcar como atendido, sin conexión.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { crearQueryMock, ok, fallo } from './helpers/supabaseMock.js'

const m = vi.hoisted(() => ({
  refreshSession: vi.fn(),
  from: vi.fn(),
  crearNotaClinica: vi.fn(),
  crearReceta: vi.fn(),
  actualizarPiezaOdontograma: vi.fn(),
  actualizarPiezaPeriodontal: vi.fn(),
  actualizarSitioPeriodontal: vi.fn(),
  actualizarCita: vi.fn(),
  toastExito: vi.fn(),
  toastError: vi.fn()
}))

vi.mock('../../../../lib/supabase', () => ({ supabase: { auth: { refreshSession: m.refreshSession }, from: m.from } }))
vi.mock('../../../../services/expedientes', () => ({ crearNotaClinica: m.crearNotaClinica }))
vi.mock('../../../../services/recetas', () => ({ crearReceta: m.crearReceta }))
vi.mock('../../../../services/odontograma', () => ({ actualizarPiezaOdontograma: m.actualizarPiezaOdontograma }))
vi.mock('../../../../services/periodontograma', () => ({
  actualizarPiezaPeriodontal: m.actualizarPiezaPeriodontal,
  actualizarSitioPeriodontal: m.actualizarSitioPeriodontal
}))
vi.mock('../../../../services/citas', async (importarOriginal) => {
  const real = await importarOriginal()
  return { ...real, actualizarCita: m.actualizarCita }
})
vi.mock('../../../../store/useToastStore', () => ({ toastExito: m.toastExito, toastError: m.toastError }))
// services/listaEspera SIN mockear: se ejercita el upsert/update real.

import { procesarColaOffline } from '../../../../lib/procesadorColaOffline.js'
import { listarOperacionesPendientes, encolarOperacion } from '../../../../lib/colaOffline.js'

const sesionViva = () => m.refreshSession.mockResolvedValue({ data: { session: { access_token: 'x', user: { id: 'u1' } } }, error: null })

let upsertsVistos
let updatesVistos
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  Object.values(m).forEach((f) => typeof f.mockReset === 'function' && f.mockReset())
  sesionViva()
  upsertsVistos = []
  updatesVistos = []
  m.from.mockImplementation((tabla) =>
    crearQueryMock(tabla, (t, operaciones) => {
      if (t !== 'lista_espera') return ok(null)
      const up = operaciones.find(([met]) => met === 'upsert')
      if (up) { upsertsVistos.push(up[1][0]); return ok({ id: up[1][0].id, ...up[1][0] }) }
      const upd = operaciones.find(([met]) => met === 'update')
      if (upd) { updatesVistos.push(upd[1][0]); return ok(null) }
      return ok(null)
    }, [])
  )
})

describe('crear_lista_espera: id generado en el navegador, upsert idempotente', () => {
  it('se sube con el id correcto', async () => {
    await encolarOperacion({
      id: 'le-1', tipo: 'crear_lista_espera', entidad: 'lista_espera', entidadId: 'le-1',
      payload: { id: 'le-1', paciente_id: 'p1', motivo: 'Dolor', atendido: false },
      dependeDe: [], usuarioId: 'u1', creado_en: 1
    })
    await procesarColaOffline()
    expect(upsertsVistos).toHaveLength(1)
    expect(upsertsVistos[0].id).toBe('le-1')
    expect(await listarOperacionesPendientes()).toHaveLength(0)
  })

  it('idempotencia: reintentar con el mismo id nunca duplica', async () => {
    const payload = { id: 'le-2', paciente_id: 'p1', motivo: 'x', atendido: false }
    await encolarOperacion({ id: 'le-2', tipo: 'crear_lista_espera', entidad: 'lista_espera', entidadId: 'le-2', payload, dependeDe: [], usuarioId: 'u1', creado_en: 1 })
    await procesarColaOffline()
    await encolarOperacion({ id: 'le-2', tipo: 'crear_lista_espera', entidad: 'lista_espera', entidadId: 'le-2', payload, dependeDe: [], usuarioId: 'u1', creado_en: 1 })
    await procesarColaOffline()
    expect(upsertsVistos).toHaveLength(2)
    expect(new Set(upsertsVistos.map((r) => r.id)).size).toBe(1)
  })

  it('un error transitorio deja la operación pendiente, no la pierde', async () => {
    m.from.mockImplementation((tabla) => crearQueryMock(tabla, () => (tabla === 'lista_espera' ? fallo('sin red') : ok(null)), []))
    await encolarOperacion({
      id: 'le-3', tipo: 'crear_lista_espera', entidad: 'lista_espera', entidadId: 'le-3',
      payload: { id: 'le-3', paciente_id: 'p1' }, dependeDe: [], usuarioId: 'u1', creado_en: 1
    })
    await procesarColaOffline()
    const pendientes = await listarOperacionesPendientes()
    expect(pendientes).toHaveLength(1)
    expect(pendientes[0].estado).toBe('error')
  })
})

describe('marcar_atendido_lista_espera', () => {
  it('se sube con el id correcto', async () => {
    await encolarOperacion({
      id: 'marcar-1', tipo: 'marcar_atendido_lista_espera', entidad: 'lista_espera', entidadId: 'le-1',
      payload: { id: 'le-1' }, dependeDe: [], usuarioId: 'u1', creado_en: 1
    })
    await procesarColaOffline()
    expect(updatesVistos).toHaveLength(1)
    expect(updatesVistos[0]).toEqual({ atendido: true })
    expect(await listarOperacionesPendientes()).toHaveLength(0)
  })
})
