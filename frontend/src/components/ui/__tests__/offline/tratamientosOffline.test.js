// Tratamientos no tenía NINGÚN soporte offline antes de esto — ni
// siquiera para un paciente ya existente. Esta batería cubre ambos
// casos: paciente existente (capacidad nueva) y paciente nuevo offline
// (dependiente, mismo mecanismo que ya usan notas/recetas).
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
  crearCita: vi.fn(),
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
vi.mock('../../../../services/citas', () => ({ actualizarCita: m.actualizarCita, crearCita: m.crearCita }))
vi.mock('../../../../store/useToastStore', () => ({ toastExito: m.toastExito, toastError: m.toastError }))
// services/tratamientos SIN mockear: se ejercita crearTratamiento real
// (upsert) contra el mock de supabase, igual que se hizo con pacientes.

import { procesarColaOffline } from '../../../../lib/procesadorColaOffline.js'
import { listarOperacionesPendientes, encolarOperacion } from '../../../../lib/colaOffline.js'
import { crearPacienteOffline } from '../../../../lib/pacientesOffline.js'
import { esIdOffline } from '../../../../lib/mapeoIdsOffline.js'

const sesionViva = () => m.refreshSession.mockResolvedValue({ data: { session: { access_token: 'x', user: { id: 'u1' } } }, error: null })

let insertsPacientesVistos
let upsertsTratamientosVistos
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  Object.values(m).forEach((f) => typeof f.mockReset === 'function' && f.mockReset())
  sesionViva()
  insertsPacientesVistos = []
  upsertsTratamientosVistos = []
  m.from.mockImplementation((tabla) =>
    crearQueryMock(tabla, (t, operaciones) => {
      if (t === 'pacientes') {
        const payload = operaciones.find(([met]) => met === 'upsert')[1][0]
        insertsPacientesVistos.push(payload)
        return ok({ id: payload.id })
      }
      if (t === 'tratamientos') {
        const up = operaciones.find(([met]) => met === 'upsert')[1][0]
        upsertsTratamientosVistos.push(up)
        return ok({ id: up.id, ...up })
      }
      return ok(null)
    }, [])
  )
})

describe('tratamiento de un paciente YA existente, sin conexión (capacidad nueva)', () => {
  it('se sube con el id generado en el navegador (sin depender de nada más)', async () => {
    await encolarOperacion({
      id: 'trat-1', tipo: 'crear_tratamiento', entidad: 'tratamientos', entidadId: 'trat-1',
      payload: { id: 'trat-1', paciente_id: 'paciente-real-1', descripcion: 'Limpieza', costo: 500 },
      dependeDe: [], usuarioId: 'u1', creado_en: 1
    })

    await procesarColaOffline()

    expect(upsertsTratamientosVistos).toHaveLength(1)
    expect(upsertsTratamientosVistos[0].id).toBe('trat-1')
    expect(upsertsTratamientosVistos[0].paciente_id).toBe('paciente-real-1')
    expect(await listarOperacionesPendientes()).toHaveLength(0)
  })

  it('idempotencia: reintentar con el mismo id nunca duplica (upsert)', async () => {
    const payload = { id: 'trat-2', paciente_id: 'paciente-real-1', descripcion: 'Extracción', costo: 800 }
    await encolarOperacion({ id: 'trat-2', tipo: 'crear_tratamiento', entidad: 'tratamientos', entidadId: 'trat-2', payload, dependeDe: [], usuarioId: 'u1', creado_en: 1 })
    await procesarColaOffline()
    expect(upsertsTratamientosVistos).toHaveLength(1)

    // Simula que la operación siguiera en la cola (reconexión a medias)
    await encolarOperacion({ id: 'trat-2', tipo: 'crear_tratamiento', entidad: 'tratamientos', entidadId: 'trat-2', payload, dependeDe: [], usuarioId: 'u1', creado_en: 1 })
    await procesarColaOffline()
    expect(upsertsTratamientosVistos).toHaveLength(2)
    expect(new Set(upsertsTratamientosVistos.map((t) => t.id)).size).toBe(1) // un solo id real
  })

  it('un error transitorio de red deja el tratamiento pendiente, no lo pierde', async () => {
    m.from.mockImplementation((tabla) => crearQueryMock(tabla, () => (tabla === 'tratamientos' ? fallo('sin red') : ok(null)), []))
    await encolarOperacion({
      id: 'trat-3', tipo: 'crear_tratamiento', entidad: 'tratamientos', entidadId: 'trat-3',
      payload: { id: 'trat-3', paciente_id: 'paciente-real-1', descripcion: 'Corona', costo: 3000 },
      dependeDe: [], usuarioId: 'u1', creado_en: 1
    })
    await procesarColaOffline()
    const pendientes = await listarOperacionesPendientes()
    expect(pendientes).toHaveLength(1)
    expect(pendientes[0].estado).toBe('error')
  })
})

describe('tratamiento de un paciente NUEVO offline (dependiente)', () => {
  it('sube primero al paciente y luego el tratamiento, resolviendo paciente_id', async () => {
    const paciente = await crearPacienteOffline({ nombre_completo: 'Con tratamiento' }, { usuarioId: 'u1' })
    await encolarOperacion({
      id: 'trat-op-1', tipo: 'crear_tratamiento', entidad: 'tratamientos', entidadId: 'trat-op-1',
      payload: { id: 'trat-op-1', paciente_id: paciente.id, descripcion: 'Consulta inicial', costo: 300 },
      dependeDe: [paciente.id], usuarioId: 'u1', creado_en: 2
    })

    await procesarColaOffline()

    expect(upsertsTratamientosVistos).toHaveLength(1)
    expect(esIdOffline(upsertsTratamientosVistos[0].paciente_id)).toBe(false)
    expect(upsertsTratamientosVistos[0].paciente_id).toBe(insertsPacientesVistos[0].id)
    expect(await listarOperacionesPendientes()).toHaveLength(0)
  })

  it('si el paciente falla transitorio, el tratamiento dependiente no se intenta esta corrida', async () => {
    m.from.mockImplementation((tabla) => crearQueryMock(tabla, () => (tabla === 'pacientes' ? fallo('sin red') : ok(null)), []))
    const paciente = await crearPacienteOffline({ nombre_completo: 'X' }, { usuarioId: 'u1' })
    await encolarOperacion({
      id: 'trat-op-2', tipo: 'crear_tratamiento', entidad: 'tratamientos', entidadId: 'trat-op-2',
      payload: { id: 'trat-op-2', paciente_id: paciente.id, descripcion: 'Y', costo: 100 },
      dependeDe: [paciente.id], usuarioId: 'u1', creado_en: 2
    })
    await procesarColaOffline()
    expect(upsertsTratamientosVistos).toHaveLength(0)
    const pendientes = await listarOperacionesPendientes()
    expect(pendientes.map((o) => o.id).sort()).toEqual(['trat-op-2', paciente.id].sort())
  })
})
