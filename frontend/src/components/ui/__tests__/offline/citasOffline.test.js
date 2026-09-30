// "Nueva cita" (agendar) no tenía NINGÚN soporte offline antes de
// esto — igual que tratamientos. Cubre paciente existente (capacidad
// nueva) y paciente nuevo offline (dependiente).
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
// services/citas SIN mockear: se ejercita crearCita real (upsert) —
// solo actualizarCita se mockea (lo usa finalizar_consulta, no crear_cita).
vi.mock('../../../../services/citas', async (importarOriginal) => {
  const real = await importarOriginal()
  return { ...real, actualizarCita: m.actualizarCita }
})
vi.mock('../../../../store/useToastStore', () => ({ toastExito: m.toastExito, toastError: m.toastError }))

import { procesarColaOffline } from '../../../../lib/procesadorColaOffline.js'
import { listarOperacionesPendientes, encolarOperacion } from '../../../../lib/colaOffline.js'
import { crearPacienteOffline } from '../../../../lib/pacientesOffline.js'
import { esIdOffline } from '../../../../lib/mapeoIdsOffline.js'

const sesionViva = () => m.refreshSession.mockResolvedValue({ data: { session: { access_token: 'x', user: { id: 'u1' } } }, error: null })

let insertsPacientesVistos
let upsertsCitasVistos
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  Object.values(m).forEach((f) => typeof f.mockReset === 'function' && f.mockReset())
  sesionViva()
  insertsPacientesVistos = []
  upsertsCitasVistos = []
  m.from.mockImplementation((tabla) =>
    crearQueryMock(tabla, (t, operaciones) => {
      if (t === 'pacientes') {
        const payload = operaciones.find(([met]) => met === 'upsert')[1][0]
        insertsPacientesVistos.push(payload)
        return ok({ id: payload.id })
      }
      if (t === 'citas') {
        const up = operaciones.find(([met]) => met === 'upsert')?.[1]?.[0]
        if (up) { upsertsCitasVistos.push(up); return ok({ id: up.id, ...up }) }
        return ok(null)
      }
      return ok(null)
    }, [])
  )
})

describe('agendar cita para un paciente YA existente, sin conexión (capacidad nueva)', () => {
  it('se sube con el id generado en el navegador', async () => {
    await encolarOperacion({
      id: 'cita-1', tipo: 'crear_cita', entidad: 'citas', entidadId: 'cita-1',
      payload: { id: 'cita-1', paciente_id: 'paciente-real-1', dentista_id: 'd1', inicio: '2026-10-01T10:00:00Z', fin: '2026-10-01T10:30:00Z', motivo: 'Revisión' },
      dependeDe: [], usuarioId: 'u1', creado_en: 1
    })

    await procesarColaOffline()

    expect(upsertsCitasVistos).toHaveLength(1)
    expect(upsertsCitasVistos[0].id).toBe('cita-1')
    expect(await listarOperacionesPendientes()).toHaveLength(0)
  })

  it('idempotencia: reintentar con el mismo id nunca duplica (upsert)', async () => {
    const payload = { id: 'cita-2', paciente_id: 'paciente-real-1', inicio: '2026-10-02T09:00:00Z', fin: '2026-10-02T09:30:00Z' }
    await encolarOperacion({ id: 'cita-2', tipo: 'crear_cita', entidad: 'citas', entidadId: 'cita-2', payload, dependeDe: [], usuarioId: 'u1', creado_en: 1 })
    await procesarColaOffline()
    expect(upsertsCitasVistos).toHaveLength(1)

    await encolarOperacion({ id: 'cita-2', tipo: 'crear_cita', entidad: 'citas', entidadId: 'cita-2', payload, dependeDe: [], usuarioId: 'u1', creado_en: 1 })
    await procesarColaOffline()
    expect(upsertsCitasVistos).toHaveLength(2)
    expect(new Set(upsertsCitasVistos.map((c) => c.id)).size).toBe(1)
  })
})

describe('reagendar / cambiar estado / cancelar una cita YA agendada, sin conexión (capacidad nueva)', () => {
  it('se sube vía el ejecutor actualizar_cita, con los datos correctos', async () => {
    m.actualizarCita.mockResolvedValue({ id: 'cita-existente', estado: 'confirmada' })
    await encolarOperacion({
      id: 'reagendar-op-1', tipo: 'actualizar_cita', entidad: 'citas', entidadId: 'cita-existente',
      payload: { id: 'cita-existente', cambios: { estado: 'confirmada' } },
      dependeDe: [], usuarioId: 'u1', creado_en: 1
    })

    await procesarColaOffline()

    expect(m.actualizarCita).toHaveBeenCalledTimes(1)
    expect(m.actualizarCita).toHaveBeenCalledWith('cita-existente', { estado: 'confirmada' }, undefined)
    expect(await listarOperacionesPendientes()).toHaveLength(0)
  })

  it('cancelar (estado: cancelada) sube igual, como cualquier otro cambio de estado', async () => {
    m.actualizarCita.mockResolvedValue({ id: 'cita-existente' })
    await encolarOperacion({
      id: 'cancelar-op-1', tipo: 'actualizar_cita', entidad: 'citas', entidadId: 'cita-existente',
      payload: { id: 'cita-existente', cambios: { estado: 'cancelada' } },
      dependeDe: [], usuarioId: 'u1', creado_en: 1
    })
    await procesarColaOffline()
    expect(m.actualizarCita).toHaveBeenCalledWith('cita-existente', { estado: 'cancelada' }, undefined)
  })

  it('un error transitorio de red deja la operación pendiente, no la pierde', async () => {
    m.actualizarCita.mockRejectedValue(new Error('sin red'))
    await encolarOperacion({
      id: 'reagendar-op-2', tipo: 'actualizar_cita', entidad: 'citas', entidadId: 'cita-existente',
      payload: { id: 'cita-existente', cambios: { estado: 'en_consulta' } },
      dependeDe: [], usuarioId: 'u1', creado_en: 1
    })
    await procesarColaOffline()
    const pendientes = await listarOperacionesPendientes()
    expect(pendientes).toHaveLength(1)
    expect(pendientes[0].estado).toBe('error')
  })
})

describe('agendar la próxima cita de un paciente NUEVO offline (dependiente)', () => {
  it('sube primero al paciente y luego la cita, resolviendo paciente_id', async () => {
    const paciente = await crearPacienteOffline({ nombre_completo: 'Con cita futura' }, { usuarioId: 'u1' })
    await encolarOperacion({
      id: 'cita-op-1', tipo: 'crear_cita', entidad: 'citas', entidadId: 'cita-op-1',
      payload: { id: 'cita-op-1', paciente_id: paciente.id, inicio: '2026-10-05T10:00:00Z', fin: '2026-10-05T10:30:00Z', motivo: 'Seguimiento' },
      dependeDe: [paciente.id], usuarioId: 'u1', creado_en: 2
    })

    await procesarColaOffline()

    expect(upsertsCitasVistos).toHaveLength(1)
    expect(esIdOffline(upsertsCitasVistos[0].paciente_id)).toBe(false)
    expect(upsertsCitasVistos[0].paciente_id).toBe(insertsPacientesVistos[0].id)
    expect(await listarOperacionesPendientes()).toHaveLength(0)
  })

  it('si el paciente todavía no sincroniza, la cita dependiente no se intenta esta corrida', async () => {
    m.from.mockImplementation((tabla) => crearQueryMock(tabla, () => (tabla === 'pacientes' ? fallo('sin red') : ok(null)), []))
    const paciente = await crearPacienteOffline({ nombre_completo: 'X' }, { usuarioId: 'u1' })
    await encolarOperacion({
      id: 'cita-op-2', tipo: 'crear_cita', entidad: 'citas', entidadId: 'cita-op-2',
      payload: { id: 'cita-op-2', paciente_id: paciente.id, inicio: '2026-10-06T10:00:00Z', fin: '2026-10-06T10:30:00Z' },
      dependeDe: [paciente.id], usuarioId: 'u1', creado_en: 2
    })
    await procesarColaOffline()
    expect(upsertsCitasVistos).toHaveLength(0)
    const pendientes = await listarOperacionesPendientes()
    expect(pendientes.map((o) => o.id).sort()).toEqual(['cita-op-2', paciente.id].sort())
  })
})
