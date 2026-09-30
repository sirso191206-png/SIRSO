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
vi.mock('../../../../services/periodontograma', async (importarOriginal) => {
  const real = await importarOriginal()
  return { ...real, actualizarPiezaPeriodontal: m.actualizarPiezaPeriodontal, actualizarSitioPeriodontal: m.actualizarSitioPeriodontal }
})
vi.mock('../../../../services/citas', () => ({ actualizarCita: m.actualizarCita, crearCita: m.crearCita }))
vi.mock('../../../../store/useToastStore', () => ({ toastExito: m.toastExito, toastError: m.toastError }))

import { procesarColaOffline } from '../../../../lib/procesadorColaOffline.js'
import { listarOperacionesPendientes, encolarOperacion } from '../../../../lib/colaOffline.js'
import { crearPacienteOffline } from '../../../../lib/pacientesOffline.js'
import {
  piezasPeriodontalesOfflineIniciales,
  idPiezaPeriodontalOffline,
  numeroDePiezaPeriodontalOffline,
  idSitioOffline,
  datosDeSitioOffline,
  SITIOS_PERIODONTALES,
  NUMEROS_PIEZA_FDI
} from '../../../../lib/periodontogramaOffline.js'
import { obtenerPiezaPeriodontalPorNumero, obtenerSitioPeriodontalPorNombre } from '../../../../services/periodontograma.js'

const sesionViva = () => m.refreshSession.mockResolvedValue({ data: { session: { access_token: 'x', user: { id: 'u1' } } }, error: null })

let insertsPacientesVistos
let piezasPerioEnServidor // Map<numero_pieza, {id}>
let sitiosPerioEnServidor // Map<`${piezaId}:${sitio}`, {id}>

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  Object.values(m).forEach((f) => typeof f.mockReset === 'function' && f.mockReset())
  sesionViva()
  insertsPacientesVistos = []
  piezasPerioEnServidor = new Map(NUMEROS_PIEZA_FDI.map((n) => [n, { id: `pieza-perio-real-${n}` }]))
  sitiosPerioEnServidor = new Map()
  for (const [numero, pieza] of piezasPerioEnServidor) {
    for (const sitio of SITIOS_PERIODONTALES) {
      sitiosPerioEnServidor.set(`${pieza.id}:${sitio}`, { id: `sitio-real-${numero}-${sitio}` })
    }
  }
  m.from.mockImplementation((tabla) =>
    crearQueryMock(tabla, (t, operaciones) => {
      if (t === 'pacientes') {
        const payload = operaciones.find(([met]) => met === 'upsert')[1][0]
        insertsPacientesVistos.push(payload)
        return ok({ id: payload.id })
      }
      if (t === 'periodontograma_piezas') {
        const eqNumero = operaciones.find(([met, args]) => met === 'eq' && args[0] === 'numero_pieza')
        const numero = eqNumero?.[1]?.[1]
        const pieza = piezasPerioEnServidor.get(numero)
        return pieza ? ok(pieza) : fallo('no encontrada', 'PGRST116')
      }
      if (t === 'periodontograma_sitios') {
        const eqPieza = operaciones.find(([met, args]) => met === 'eq' && args[0] === 'pieza_id')
        const eqSitio = operaciones.find(([met, args]) => met === 'eq' && args[0] === 'sitio')
        const clave = `${eqPieza?.[1]?.[1]}:${eqSitio?.[1]?.[1]}`
        const sitio = sitiosPerioEnServidor.get(clave)
        return sitio ? ok(sitio) : fallo('no encontrado', 'PGRST116')
      }
      return ok(null)
    }, [])
  )
})

describe('piezasPeriodontalesOfflineIniciales / helpers de id', () => {
  it('genera 32 piezas, cada una con sus 6 sitios, todo en cero/false', () => {
    const piezas = piezasPeriodontalesOfflineIniciales()
    expect(piezas).toHaveLength(32)
    expect(piezas.every((p) => p.sitios.length === 6)).toBe(true)
    expect(piezas.every((p) => p.movilidad === 0 && p.furcacion === 0)).toBe(true)
    expect(piezas.every((p) => p.sitios.every((s) => s.profundidad_sondaje === 0 && s.sangrado === false))).toBe(true)
    expect(piezas.flatMap((p) => p.sitios).every((s) => s._offline === true)).toBe(true)
  })

  it('numeroDePiezaPeriodontalOffline reconoce su propio formato, no el de odontograma', () => {
    expect(numeroDePiezaPeriodontalOffline(idPiezaPeriodontalOffline('11'))).toBe('11')
    expect(numeroDePiezaPeriodontalOffline('offline-pieza-11')).toBeNull() // formato de odontograma, no de perio
  })

  it('datosDeSitioOffline reconoce número de pieza y sitio, y solo sitios válidos', () => {
    expect(datosDeSitioOffline(idSitioOffline('26', 'mesial_l'))).toEqual({ numeroPieza: '26', sitio: 'mesial_l' })
    expect(datosDeSitioOffline('offline-sitio-26-inventado')).toBeNull()
    expect(datosDeSitioOffline('pieza-real-1')).toBeNull()
  })
})

describe('paciente nuevo offline: pieza y sitio periodontal dependientes', () => {
  it('resuelve la pieza periodontal por número tras sincronizar al paciente', async () => {
    m.actualizarPiezaPeriodontal.mockResolvedValue({ id: 'ok' })
    const paciente = await crearPacienteOffline({ nombre_completo: 'Perio 1' }, { usuarioId: 'u1' })
    await encolarOperacion({
      id: 'perio-pieza-op-1', tipo: 'actualizar_pieza_periodontal', entidad: 'periodontograma_piezas', entidadId: 'perio-pieza-op-1',
      payload: { pacienteIdOffline: paciente.id, numeroPieza: '16', cambios: { movilidad: 2, furcacion: 1, usuarioId: 'u1' } },
      dependeDe: [paciente.id], usuarioId: 'u1', creado_en: 2
    })

    await procesarColaOffline()

    expect(m.actualizarPiezaPeriodontal).toHaveBeenCalledTimes(1)
    const [piezaIdEnviado, cambiosEnviados] = m.actualizarPiezaPeriodontal.mock.calls[0]
    expect(piezaIdEnviado).toBe('pieza-perio-real-16')
    expect(cambiosEnviados.movilidad).toBe(2)
    expect(cambiosEnviados.pacienteIdOffline).toBeUndefined()
    expect(await listarOperacionesPendientes()).toHaveLength(0)
  })

  it('resuelve un SITIO por (número de pieza, sitio) — búsqueda encadenada, en dos pasos', async () => {
    m.actualizarSitioPeriodontal.mockResolvedValue({ id: 'ok' })
    const paciente = await crearPacienteOffline({ nombre_completo: 'Perio 2' }, { usuarioId: 'u1' })
    await encolarOperacion({
      id: 'perio-sitio-op-1', tipo: 'actualizar_sitio_periodontal', entidad: 'periodontograma_sitios', entidadId: 'perio-sitio-op-1',
      payload: { pacienteIdOffline: paciente.id, numeroPieza: '26', sitio: 'distal_l', cambios: { profundidad_sondaje: 4, sangrado: true, usuarioId: 'u1' } },
      dependeDe: [paciente.id], usuarioId: 'u1', creado_en: 2
    })

    await procesarColaOffline()

    expect(m.actualizarSitioPeriodontal).toHaveBeenCalledTimes(1)
    const [sitioIdEnviado, cambiosEnviados] = m.actualizarSitioPeriodontal.mock.calls[0]
    expect(sitioIdEnviado).toBe('sitio-real-26-distal_l')
    expect(cambiosEnviados.profundidad_sondaje).toBe(4)
    expect(cambiosEnviados.pacienteIdOffline).toBeUndefined()
    expect(cambiosEnviados.sitio).toBeUndefined()
  })

  it('el sitio NUNCA se confunde con el de otra pieza del mismo paciente', async () => {
    m.actualizarSitioPeriodontal.mockResolvedValue({ id: 'ok' })
    const paciente = await crearPacienteOffline({ nombre_completo: 'Perio 3' }, { usuarioId: 'u1' })
    for (const [numero, sitio] of [['11', 'mesial_v'], ['48', 'distal_l']]) {
      await encolarOperacion({
        id: `sitio-op-${numero}`, tipo: 'actualizar_sitio_periodontal', entidad: 'periodontograma_sitios', entidadId: `sitio-op-${numero}`,
        payload: { pacienteIdOffline: paciente.id, numeroPieza: numero, sitio, cambios: { profundidad_sondaje: 3 } },
        dependeDe: [paciente.id], usuarioId: 'u1', creado_en: 2
      })
    }

    await procesarColaOffline()

    const idsEnviados = m.actualizarSitioPeriodontal.mock.calls.map(([sitioId]) => sitioId).sort()
    expect(idsEnviados).toEqual(['sitio-real-11-mesial_v', 'sitio-real-48-distal_l'])
  })

  it('un sitio NO depende de que la operación hermana de la pieza haya corrido — solo del paciente', async () => {
    // Se encola SOLO el sitio (sin la operación de pieza) — debe
    // resolverse igual, porque el trigger ya creó ambas filas al
    // sincronizar el paciente.
    m.actualizarSitioPeriodontal.mockResolvedValue({ id: 'ok' })
    const paciente = await crearPacienteOffline({ nombre_completo: 'Perio 4' }, { usuarioId: 'u1' })
    await encolarOperacion({
      id: 'sitio-solo', tipo: 'actualizar_sitio_periodontal', entidad: 'periodontograma_sitios', entidadId: 'sitio-solo',
      payload: { pacienteIdOffline: paciente.id, numeroPieza: '33', sitio: 'medio_v', cambios: { placa: true } },
      dependeDe: [paciente.id], usuarioId: 'u1', creado_en: 2
    })

    await procesarColaOffline()

    expect(m.actualizarSitioPeriodontal).toHaveBeenCalledTimes(1)
    expect(await listarOperacionesPendientes()).toHaveLength(0)
  })

  it('si el sitio no existe para esa pieza (dato corrupto/versión vieja), falla en vez de resolver a cualquier cosa', async () => {
    await expect(obtenerSitioPeriodontalPorNombre('pieza-inexistente', 'mesial_v')).rejects.toBeTruthy()
  })

  it('si la pieza no existe para ese número, falla en vez de resolver a cualquier cosa', async () => {
    await expect(obtenerPiezaPeriodontalPorNumero('paciente-x', '99')).rejects.toBeTruthy()
  })
})
