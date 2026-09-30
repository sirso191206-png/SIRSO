// Mismo caso que tratamientos: signos vitales no tenía NINGÚN soporte
// offline antes de esto. Cubre paciente existente y paciente nuevo
// offline (dependiente).
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
// services/signosVitales SIN mockear: se ejercita agregarSignosVitales real (upsert).

import { procesarColaOffline } from '../../../../lib/procesadorColaOffline.js'
import { listarOperacionesPendientes, encolarOperacion } from '../../../../lib/colaOffline.js'
import { crearPacienteOffline } from '../../../../lib/pacientesOffline.js'
import { esIdOffline } from '../../../../lib/mapeoIdsOffline.js'

const sesionViva = () => m.refreshSession.mockResolvedValue({ data: { session: { access_token: 'x', user: { id: 'u1' } } }, error: null })

let insertsPacientesVistos
let upsertsSignosVistos
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  Object.values(m).forEach((f) => typeof f.mockReset === 'function' && f.mockReset())
  sesionViva()
  insertsPacientesVistos = []
  upsertsSignosVistos = []
  m.from.mockImplementation((tabla) =>
    crearQueryMock(tabla, (t, operaciones) => {
      if (t === 'pacientes') {
        const payload = operaciones.find(([met]) => met === 'upsert')[1][0]
        insertsPacientesVistos.push(payload)
        return ok({ id: payload.id })
      }
      if (t === 'signos_vitales') {
        const up = operaciones.find(([met]) => met === 'upsert')[1][0]
        upsertsSignosVistos.push(up)
        return ok({ id: up.id, ...up })
      }
      return ok(null)
    }, [])
  )
})

describe('signos vitales de un paciente YA existente, sin conexión (capacidad nueva)', () => {
  it('se sube con el id generado en el navegador', async () => {
    await encolarOperacion({
      id: 'sv-1', tipo: 'crear_signos_vitales', entidad: 'signos_vitales', entidadId: 'sv-1',
      payload: { id: 'sv-1', paciente_id: 'paciente-real-1', presion_arterial: '120/80', temperatura: 36.5 },
      dependeDe: [], usuarioId: 'u1', creado_en: 1
    })
    await procesarColaOffline()
    expect(upsertsSignosVistos).toHaveLength(1)
    expect(upsertsSignosVistos[0].id).toBe('sv-1')
    expect(await listarOperacionesPendientes()).toHaveLength(0)
  })

  it('idempotencia: reintentar con el mismo id nunca duplica (upsert)', async () => {
    const payload = { id: 'sv-2', paciente_id: 'paciente-real-1', peso: 70 }
    await encolarOperacion({ id: 'sv-2', tipo: 'crear_signos_vitales', entidad: 'signos_vitales', entidadId: 'sv-2', payload, dependeDe: [], usuarioId: 'u1', creado_en: 1 })
    await procesarColaOffline()
    expect(upsertsSignosVistos).toHaveLength(1)

    await encolarOperacion({ id: 'sv-2', tipo: 'crear_signos_vitales', entidad: 'signos_vitales', entidadId: 'sv-2', payload, dependeDe: [], usuarioId: 'u1', creado_en: 1 })
    await procesarColaOffline()
    expect(upsertsSignosVistos).toHaveLength(2)
    expect(new Set(upsertsSignosVistos.map((s) => s.id)).size).toBe(1)
  })

  it('un error transitorio de red deja el registro pendiente, no lo pierde', async () => {
    m.from.mockImplementation((tabla) => crearQueryMock(tabla, () => (tabla === 'signos_vitales' ? fallo('sin red') : ok(null)), []))
    await encolarOperacion({
      id: 'sv-3', tipo: 'crear_signos_vitales', entidad: 'signos_vitales', entidadId: 'sv-3',
      payload: { id: 'sv-3', paciente_id: 'paciente-real-1', temperatura: 38.2 },
      dependeDe: [], usuarioId: 'u1', creado_en: 1
    })
    await procesarColaOffline()
    const pendientes = await listarOperacionesPendientes()
    expect(pendientes).toHaveLength(1)
    expect(pendientes[0].estado).toBe('error')
  })
})

describe('signos vitales de un paciente NUEVO offline (dependiente)', () => {
  it('sube primero al paciente y luego el registro, resolviendo paciente_id', async () => {
    const paciente = await crearPacienteOffline({ nombre_completo: 'Con signos vitales' }, { usuarioId: 'u1' })
    await encolarOperacion({
      id: 'sv-op-1', tipo: 'crear_signos_vitales', entidad: 'signos_vitales', entidadId: 'sv-op-1',
      payload: { id: 'sv-op-1', paciente_id: paciente.id, presion_arterial: '110/70' },
      dependeDe: [paciente.id], usuarioId: 'u1', creado_en: 2
    })
    await procesarColaOffline()
    expect(upsertsSignosVistos).toHaveLength(1)
    expect(esIdOffline(upsertsSignosVistos[0].paciente_id)).toBe(false)
    expect(upsertsSignosVistos[0].paciente_id).toBe(insertsPacientesVistos[0].id)
    expect(await listarOperacionesPendientes()).toHaveLength(0)
  })

  it('si el paciente falla transitorio, el registro dependiente no se intenta esta corrida', async () => {
    m.from.mockImplementation((tabla) => crearQueryMock(tabla, () => (tabla === 'pacientes' ? fallo('sin red') : ok(null)), []))
    const paciente = await crearPacienteOffline({ nombre_completo: 'X' }, { usuarioId: 'u1' })
    await encolarOperacion({
      id: 'sv-op-2', tipo: 'crear_signos_vitales', entidad: 'signos_vitales', entidadId: 'sv-op-2',
      payload: { id: 'sv-op-2', paciente_id: paciente.id, temperatura: 37 },
      dependeDe: [paciente.id], usuarioId: 'u1', creado_en: 2
    })
    await procesarColaOffline()
    expect(upsertsSignosVistos).toHaveLength(0)
    const pendientes = await listarOperacionesPendientes()
    expect(pendientes.map((o) => o.id).sort()).toEqual(['sv-op-2', paciente.id].sort())
  })
})
