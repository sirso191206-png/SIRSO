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
vi.mock('../../../../services/expedientes', async (importarOriginal) => {
  const real = await importarOriginal()
  return { ...real, crearNotaClinica: m.crearNotaClinica }
})
vi.mock('../../../../services/recetas', () => ({ crearReceta: m.crearReceta }))
vi.mock('../../../../services/odontograma', async (importarOriginal) => {
  const real = await importarOriginal()
  return { ...real, actualizarPiezaOdontograma: m.actualizarPiezaOdontograma }
})
vi.mock('../../../../services/periodontograma', () => ({
  actualizarPiezaPeriodontal: m.actualizarPiezaPeriodontal,
  actualizarSitioPeriodontal: m.actualizarSitioPeriodontal
}))
vi.mock('../../../../services/citas', () => ({ actualizarCita: m.actualizarCita, crearCita: m.crearCita }))
vi.mock('../../../../store/useToastStore', () => ({ toastExito: m.toastExito, toastError: m.toastError }))

import { procesarColaOffline } from '../../../../lib/procesadorColaOffline.js'
import { listarOperacionesPendientes, encolarOperacion } from '../../../../lib/colaOffline.js'
import { crearPacienteOffline } from '../../../../lib/pacientesOffline.js'
import { piezasOfflineIniciales, idPiezaOffline, numeroDePiezaOffline, NUMEROS_PIEZA_FDI } from '../../../../lib/odontogramaOffline.js'
import { obtenerPiezaPorNumero } from '../../../../services/odontograma.js'

const sesionViva = () => m.refreshSession.mockResolvedValue({ data: { session: { access_token: 'x', user: { id: 'u1' } } }, error: null })

let insertsPacientesVistos
let piezasEnServidor // Map<numero_pieza, {id, ...}>
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  Object.values(m).forEach((f) => typeof f.mockReset === 'function' && f.mockReset())
  sesionViva()
  insertsPacientesVistos = []
  piezasEnServidor = new Map(NUMEROS_PIEZA_FDI.map((n) => [n, { id: `pieza-real-${n}` }]))
  m.from.mockImplementation((tabla) =>
    crearQueryMock(tabla, (t, operaciones) => {
      if (t === 'pacientes') {
        const payload = operaciones.find(([met]) => met === 'upsert')[1][0]
        insertsPacientesVistos.push(payload)
        return ok({ id: payload.id })
      }
      if (t === 'odontograma_piezas') {
        const eqNumero = operaciones.find(([met, args]) => met === 'eq' && args[0] === 'numero_pieza')
        const numero = eqNumero?.[1]?.[1]
        const pieza = piezasEnServidor.get(numero)
        return pieza ? ok(pieza) : fallo('no encontrada', 'PGRST116')
      }
      return ok(null)
    }, [])
  )
})

describe('piezasOfflineIniciales / idPiezaOffline / numeroDePiezaOffline', () => {
  it('genera exactamente 32 piezas, todas "sano", con id reconocible como offline', () => {
    const piezas = piezasOfflineIniciales()
    expect(piezas).toHaveLength(32)
    expect(piezas.every((p) => p.estado === 'sano')).toBe(true)
    expect(piezas.every((p) => p._offline === true)).toBe(true)
    expect(new Set(piezas.map((p) => p.numero_pieza)).size).toBe(32) // sin duplicados
  })

  it('numeroDePiezaOffline reconoce el id que genera idPiezaOffline, y solo ese formato', () => {
    expect(numeroDePiezaOffline(idPiezaOffline('18'))).toBe('18')
    expect(numeroDePiezaOffline('pieza-real-18')).toBeNull()
    expect(numeroDePiezaOffline(null)).toBeNull()
    expect(numeroDePiezaOffline(undefined)).toBeNull()
  })
})

describe('paciente nuevo offline: pieza de odontograma dependiente', () => {
  it('sube primero al paciente y luego resuelve la pieza real por número, sin exponer el placeholder al servicio', async () => {
    m.actualizarPiezaOdontograma.mockResolvedValue({ id: 'pieza-real-16', estado: 'caries' })
    const paciente = await crearPacienteOffline({ nombre_completo: 'Con caries' }, { usuarioId: 'u1' })
    await encolarOperacion({
      id: 'pieza-op-1', tipo: 'actualizar_pieza_odontograma', entidad: 'odontograma_piezas', entidadId: 'pieza-op-1',
      payload: { pacienteIdOffline: paciente.id, numeroPieza: '16', cambios: { estado: 'caries', usuarioId: 'u1' } },
      dependeDe: [paciente.id], usuarioId: 'u1', creado_en: 2
    })

    await procesarColaOffline()

    expect(m.actualizarPiezaOdontograma).toHaveBeenCalledTimes(1)
    const [piezaIdEnviado, cambiosEnviados] = m.actualizarPiezaOdontograma.mock.calls[0]
    expect(piezaIdEnviado).toBe('pieza-real-16')
    expect(cambiosEnviados.estado).toBe('caries')
    expect(cambiosEnviados.pacienteIdOffline).toBeUndefined()
    expect(cambiosEnviados.numeroPieza).toBeUndefined()
    expect(await listarOperacionesPendientes()).toHaveLength(0)
  })

  it('si el paciente todavía no sincroniza (falla transitorio), la pieza NO se intenta esta corrida', async () => {
    m.from.mockImplementation((tabla) => crearQueryMock(tabla, () => (tabla === 'pacientes' ? fallo('sin red') : ok(null)), []))
    const paciente = await crearPacienteOffline({ nombre_completo: 'X' }, { usuarioId: 'u1' })
    await encolarOperacion({
      id: 'pieza-op-2', tipo: 'actualizar_pieza_odontograma', entidad: 'odontograma_piezas', entidadId: 'pieza-op-2',
      payload: { pacienteIdOffline: paciente.id, numeroPieza: '11', cambios: { estado: 'ausente' } },
      dependeDe: [paciente.id], usuarioId: 'u1', creado_en: 2
    })

    await procesarColaOffline()

    expect(m.actualizarPiezaOdontograma).not.toHaveBeenCalled()
    const pendientes = await listarOperacionesPendientes()
    expect(pendientes.map((o) => o.id).sort()).toEqual(['pieza-op-2', paciente.id].sort())
  })

  it('varias piezas del mismo paciente offline se resuelven cada una a SU propio número, no todas a la misma', async () => {
    m.actualizarPiezaOdontograma.mockResolvedValue({ id: 'ok' })
    const paciente = await crearPacienteOffline({ nombre_completo: 'Varias piezas' }, { usuarioId: 'u1' })
    for (const n of ['11', '21', '48']) {
      await encolarOperacion({
        id: `pieza-op-${n}`, tipo: 'actualizar_pieza_odontograma', entidad: 'odontograma_piezas', entidadId: `pieza-op-${n}`,
        payload: { pacienteIdOffline: paciente.id, numeroPieza: n, cambios: { estado: 'obturado' } },
        dependeDe: [paciente.id], usuarioId: 'u1', creado_en: 2
      })
    }

    await procesarColaOffline()

    const idsEnviados = m.actualizarPiezaOdontograma.mock.calls.map(([piezaId]) => piezaId).sort()
    expect(idsEnviados).toEqual(['pieza-real-11', 'pieza-real-21', 'pieza-real-48'])
  })

  it('reintentar la resolución (obtenerPiezaPorNumero) por sí sola nunca inventa una pieza que no está en el servidor', async () => {
    await expect(obtenerPiezaPorNumero('paciente-x', '99')).rejects.toBeTruthy()
  })
})
