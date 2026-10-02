// Bloquear/desbloquear un horario sin conexión. El caso interesante:
// crear y eliminar el MISMO bloqueo antes de reconectar no debe
// encolar un viaje de ida y vuelta — se cancela la creación pendiente.
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
// services/horariosBloqueados SIN mockear: se ejercita el upsert/delete real.

import { procesarColaOffline } from '../../../../lib/procesadorColaOffline.js'
import { listarOperacionesPendientes, encolarOperacion, quitarOperacion } from '../../../../lib/colaOffline.js'

const sesionViva = () => m.refreshSession.mockResolvedValue({ data: { session: { access_token: 'x', user: { id: 'u1' } } }, error: null })

let upsertsVistos
let deletesVistos
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  Object.values(m).forEach((f) => typeof f.mockReset === 'function' && f.mockReset())
  sesionViva()
  upsertsVistos = []
  deletesVistos = []
  m.from.mockImplementation((tabla) =>
    crearQueryMock(tabla, (t, operaciones) => {
      if (t !== 'horarios_bloqueados') return ok(null)
      const up = operaciones.find(([met]) => met === 'upsert')
      if (up) { upsertsVistos.push(up[1][0]); return ok({ id: up[1][0].id, ...up[1][0] }) }
      const del = operaciones.find(([met]) => met === 'delete')
      if (del) { const eq = operaciones.find(([m]) => m === 'eq'); deletesVistos.push(eq?.[1]?.[1]); return ok(null) }
      return ok(null)
    }, [])
  )
})

describe('crear_horario_bloqueado: id en el navegador, upsert idempotente', () => {
  it('se sube con el id correcto', async () => {
    await encolarOperacion({
      id: 'hb-1', tipo: 'crear_horario_bloqueado', entidad: 'horarios_bloqueados', entidadId: 'hb-1',
      payload: { id: 'hb-1', tipo: 'comida', inicio: '2026-10-01T14:00:00Z', fin: '2026-10-01T15:00:00Z' },
      dependeDe: [], usuarioId: 'u1', creado_en: 1
    })
    await procesarColaOffline()
    expect(upsertsVistos).toHaveLength(1)
    expect(upsertsVistos[0].id).toBe('hb-1')
    expect(await listarOperacionesPendientes()).toHaveLength(0)
  })

  it('idempotencia: reintentar con el mismo id nunca duplica', async () => {
    const payload = { id: 'hb-2', tipo: 'vacaciones' }
    await encolarOperacion({ id: 'hb-2', tipo: 'crear_horario_bloqueado', entidad: 'horarios_bloqueados', entidadId: 'hb-2', payload, dependeDe: [], usuarioId: 'u1', creado_en: 1 })
    await procesarColaOffline()
    await encolarOperacion({ id: 'hb-2', tipo: 'crear_horario_bloqueado', entidad: 'horarios_bloqueados', entidadId: 'hb-2', payload, dependeDe: [], usuarioId: 'u1', creado_en: 1 })
    await procesarColaOffline()
    expect(upsertsVistos).toHaveLength(2)
    expect(new Set(upsertsVistos.map((b) => b.id)).size).toBe(1)
  })
})

describe('eliminar_horario_bloqueado', () => {
  it('se sube con el id correcto', async () => {
    await encolarOperacion({
      id: 'elim-1', tipo: 'eliminar_horario_bloqueado', entidad: 'horarios_bloqueados', entidadId: 'hb-x',
      payload: { id: 'hb-x' }, dependeDe: [], usuarioId: 'u1', creado_en: 1
    })
    await procesarColaOffline()
    expect(deletesVistos).toEqual(['hb-x'])
  })

  it('un error transitorio deja la operación pendiente, no la pierde', async () => {
    m.from.mockImplementation((tabla) => crearQueryMock(tabla, () => (tabla === 'horarios_bloqueados' ? fallo('sin red') : ok(null)), []))
    await encolarOperacion({
      id: 'elim-2', tipo: 'eliminar_horario_bloqueado', entidad: 'horarios_bloqueados', entidadId: 'hb-y',
      payload: { id: 'hb-y' }, dependeDe: [], usuarioId: 'u1', creado_en: 1
    })
    await procesarColaOffline()
    const pendientes = await listarOperacionesPendientes()
    expect(pendientes).toHaveLength(1)
    expect(pendientes[0].estado).toBe('error')
  })
})

describe('crear y eliminar el MISMO bloqueo antes de reconectar: se cancela, no se encola un viaje redondo', () => {
  it('simula exactamente lo que hace useHorariosBloqueados.js: cancelar la creación pendiente en vez de encolar un delete', async () => {
    const id = 'hb-cancelado'
    await encolarOperacion({
      id, tipo: 'crear_horario_bloqueado', entidad: 'horarios_bloqueados', entidadId: id,
      payload: { id, tipo: 'comida' }, dependeDe: [], usuarioId: 'u1', creado_en: 1
    })
    // La lógica del hook: busca una creación pendiente para ESTE id...
    const pendientes = await listarOperacionesPendientes()
    const creacionPendiente = pendientes.find((op) => op.tipo === 'crear_horario_bloqueado' && op.entidadId === id)
    expect(creacionPendiente).toBeTruthy()
    // ...y la cancela directo, sin encolar nada más.
    await quitarOperacion(creacionPendiente.id)

    expect(await listarOperacionesPendientes()).toHaveLength(0)
    await procesarColaOffline()
    expect(upsertsVistos).toHaveLength(0) // nunca llegó a tocar el servidor
    expect(deletesVistos).toHaveLength(0)
  })
})
