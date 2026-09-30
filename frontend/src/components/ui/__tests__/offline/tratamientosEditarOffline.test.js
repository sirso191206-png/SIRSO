// Editar un tratamiento ya existente sin conexión: cambiar estado,
// cancelar, actualizar (las tres, un UPDATE simple — se reemplazan por
// clave estable) y sumar una sesión (caso aparte: NO se puede mandar
// el número ya calculado, porque podría quedar desactualizado).
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
// services/tratamientos SIN mockear: se ejercita el UPDATE real.

import { procesarColaOffline } from '../../../../lib/procesadorColaOffline.js'
import { listarOperacionesPendientes, encolarOperacion } from '../../../../lib/colaOffline.js'

const sesionViva = () => m.refreshSession.mockResolvedValue({ data: { session: { access_token: 'x', user: { id: 'u1' } } }, error: null })

let tratamientoEnServidor
let updatesVistos
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  Object.values(m).forEach((f) => typeof f.mockReset === 'function' && f.mockReset())
  sesionViva()
  tratamientoEnServidor = { id: 't1', sesiones_completadas: 2, numero_sesiones: 5, estado: 'en_progreso' }
  updatesVistos = []
  m.from.mockImplementation((tabla) =>
    crearQueryMock(tabla, (t, operaciones) => {
      if (t !== 'tratamientos') return ok(null)
      const upd = operaciones.find(([met]) => met === 'update')
      if (upd) {
        updatesVistos.push(upd[1][0])
        tratamientoEnServidor = { ...tratamientoEnServidor, ...upd[1][0] }
      }
      // select().eq('id',...).single() y también lo que sigue a un update().select()
      return ok({ ...tratamientoEnServidor })
    }, [])
  )
})

describe('actualizar_tratamiento (cambiar estado / cancelar / actualizar): UPDATE simple, reemplazo por clave estable', () => {
  it('cambiar estado se sube tal cual, incluida completado_en si aplica', async () => {
    await encolarOperacion({
      id: 'actualizar_tratamiento_t1', tipo: 'actualizar_tratamiento', entidad: 'tratamientos', entidadId: 't1',
      payload: { id: 't1', cambios: { estado: 'completado', completado_en: '2026-09-30T10:00:00.000Z' } },
      dependeDe: [], usuarioId: 'u1', creado_en: 1
    })
    await procesarColaOffline()
    expect(updatesVistos).toHaveLength(1)
    expect(updatesVistos[0]).toEqual({ estado: 'completado', completado_en: '2026-09-30T10:00:00.000Z' })
    expect(await listarOperacionesPendientes()).toHaveLength(0)
  })

  it('cancelar sube motivo y quién canceló', async () => {
    await encolarOperacion({
      id: 'actualizar_tratamiento_t1', tipo: 'actualizar_tratamiento', entidad: 'tratamientos', entidadId: 't1',
      payload: { id: 't1', cambios: { estado: 'cancelado', motivo_cancelacion: 'Paciente no continuó', cancelado_por: 'u1' } },
      dependeDe: [], usuarioId: 'u1', creado_en: 1
    })
    await procesarColaOffline()
    expect(updatesVistos[0].estado).toBe('cancelado')
    expect(updatesVistos[0].motivo_cancelacion).toBe('Paciente no continuó')
  })

  it('un error transitorio deja la operación pendiente, no la pierde', async () => {
    m.from.mockImplementation((tabla) => crearQueryMock(tabla, () => (tabla === 'tratamientos' ? fallo('sin red') : ok(null)), []))
    await encolarOperacion({
      id: 'actualizar_tratamiento_t1', tipo: 'actualizar_tratamiento', entidad: 'tratamientos', entidadId: 't1',
      payload: { id: 't1', cambios: { estado: 'cancelado' } }, dependeDe: [], usuarioId: 'u1', creado_en: 1
    })
    await procesarColaOffline()
    const pendientes = await listarOperacionesPendientes()
    expect(pendientes).toHaveLength(1)
    expect(pendientes[0].estado).toBe('error')
  })
})

describe('registrar_sesion_tratamiento: NO usa una instantánea vieja — relee el valor fresco antes de sumar', () => {
  it('suma una sola sesión, partiendo del valor REAL del servidor (no de lo que traiga el payload)', async () => {
    await encolarOperacion({
      id: 'sesion-op-1', tipo: 'registrar_sesion_tratamiento', entidad: 'tratamientos', entidadId: 't1',
      payload: { tratamientoId: 't1' }, dependeDe: [], usuarioId: 'u1', creado_en: 1
    })
    await procesarColaOffline()
    expect(updatesVistos).toHaveLength(1)
    expect(updatesVistos[0].sesiones_completadas).toBe(3) // 2 (servidor) + 1, no algo traído del cliente
  })

  it('DOS sesiones registradas offline antes de reconectar se acumulan como DOS, no como una', async () => {
    // Dos clics offline, cada uno con su propio id (nunca se reemplazan
    // entre sí) — simula exactamente lo que produce useTratamientos.js.
    await encolarOperacion({
      id: 'sesion-op-a', tipo: 'registrar_sesion_tratamiento', entidad: 'tratamientos', entidadId: 't1',
      payload: { tratamientoId: 't1' }, dependeDe: [], usuarioId: 'u1', creado_en: 1
    })
    await encolarOperacion({
      id: 'sesion-op-b', tipo: 'registrar_sesion_tratamiento', entidad: 'tratamientos', entidadId: 't1',
      payload: { tratamientoId: 't1' }, dependeDe: [], usuarioId: 'u1', creado_en: 2
    })
    await procesarColaOffline()
    expect(updatesVistos).toHaveLength(2)
    expect(tratamientoEnServidor.sesiones_completadas).toBe(4) // 2 + 1 + 1, correctamente encadenado
  })

  it('si llega al total de sesiones, se marca completado automáticamente — con el valor fresco, no el viejo', async () => {
    tratamientoEnServidor = { id: 't1', sesiones_completadas: 4, numero_sesiones: 5, estado: 'en_progreso' }
    await encolarOperacion({
      id: 'sesion-op-final', tipo: 'registrar_sesion_tratamiento', entidad: 'tratamientos', entidadId: 't1',
      payload: { tratamientoId: 't1' }, dependeDe: [], usuarioId: 'u1', creado_en: 1
    })
    await procesarColaOffline()
    expect(updatesVistos[0].sesiones_completadas).toBe(5)
    expect(updatesVistos[0].estado).toBe('completado')
  })

  it('nunca retrocede: si el servidor ya iba más adelantado que cuando se encoló, el resultado parte de lo real', async () => {
    // Simula: se encoló offline cuando el tratamiento iba en 2, pero
    // para cuando se sube (otra corrida, otro dispositivo) el servidor
    // ya llevaba 4 — el resultado debe ser 5, nunca "2+1=3".
    tratamientoEnServidor = { id: 't1', sesiones_completadas: 4, numero_sesiones: 10, estado: 'en_progreso' }
    await encolarOperacion({
      id: 'sesion-op-tardia', tipo: 'registrar_sesion_tratamiento', entidad: 'tratamientos', entidadId: 't1',
      payload: { tratamientoId: 't1' }, dependeDe: [], usuarioId: 'u1', creado_en: 1
    })
    await procesarColaOffline()
    expect(updatesVistos[0].sesiones_completadas).toBe(5)
  })
})
