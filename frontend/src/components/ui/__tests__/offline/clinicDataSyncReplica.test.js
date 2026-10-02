import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { crearQueryMock, ok, sinRed } from './helpers/supabaseMock.js'

const supabaseMock = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('../../../../lib/supabase', () => ({ supabase: supabaseMock }))

import {
  guardarPacientesEnReplica,
  obtenerPacienteDeReplica,
  buscarEnReplicaClinica,
  leerCursorReplica,
  guardarCursorReplica,
  vaciarReplicaPacientes
} from '../../../../lib/pacientesReplica.js'
import { syncPacientes, syncClinica } from '../../../../lib/clinicDataSync.js'

const ponerConexion = (enLinea) => Object.defineProperty(globalThis.navigator, 'onLine', { value: enLinea, configurable: true })

let hayRed
let pacientesEnServidor
let llamadasVistas
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  hayRed = true
  ponerConexion(true)
  pacientesEnServidor = [
    { id: 'p1', nombre_completo: 'Ana López', telefono: '555-0001', numero_expediente: 'E1', archivado_en: null, actualizado_en: '2026-10-01T08:00:00Z' },
    { id: 'p2', nombre_completo: 'Beto Ruiz', telefono: '555-0002', numero_expediente: 'E2', archivado_en: null, actualizado_en: '2026-10-01T09:00:00Z' }
  ]
  llamadasVistas = []
  supabaseMock.from.mockReset()
  supabaseMock.from.mockImplementation((tabla) =>
    crearQueryMock(tabla, (t, operaciones) => {
      if (!hayRed) return sinRed()
      if (t === 'usuarios') return ok([{ id: 'x' }]) // heartbeat
      if (t === 'v_pacientes_seguro') {
        llamadasVistas.push(operaciones)
        const gt = operaciones.find(([m]) => m === 'gt')
        const desde = gt?.[1]?.[1]
        const filas = desde ? pacientesEnServidor.filter((p) => p.actualizado_en > desde) : pacientesEnServidor
        return ok(filas)
      }
      if (t === 'citas') return ok([])
      if (t === 'expedientes') return ok([])
      return ok(null)
    }, [])
  )
})

describe('lib/pacientesReplica.js — almacén local', () => {
  it('guarda, lee uno, busca y vacía — el cursor también se borra, no solo los pacientes', async () => {
    await guardarPacientesEnReplica(pacientesEnServidor)
    await guardarCursorReplica('2026-10-01T09:00:00Z')
    expect(await obtenerPacienteDeReplica('p1')).toMatchObject({ nombre_completo: 'Ana López' })
    expect(await buscarEnReplicaClinica('Beto')).toHaveLength(1)
    await vaciarReplicaPacientes()
    expect(await obtenerPacienteDeReplica('p1')).toBeNull()
    expect(await buscarEnReplicaClinica('Beto')).toHaveLength(0)
    expect(await leerCursorReplica()).toBeNull()
  })

  it('la búsqueda excluye archivados por default, pero los incluye si se pide', async () => {
    await guardarPacientesEnReplica([...pacientesEnServidor, { id: 'p3', nombre_completo: 'Carla Vieja', archivado_en: '2026-01-01T00:00:00Z', actualizado_en: '2026-10-01T10:00:00Z' }])
    expect(await buscarEnReplicaClinica('Carla')).toHaveLength(0)
    expect(await buscarEnReplicaClinica('Carla', { incluirArchivados: true })).toHaveLength(1)
  })

  it('cursor: null al inicio, se guarda y se lee de vuelta', async () => {
    expect(await leerCursorReplica()).toBeNull()
    await guardarCursorReplica('2026-10-01T09:00:00Z')
    expect(await leerCursorReplica()).toBe('2026-10-01T09:00:00Z')
  })
})

describe('syncPacientes: incremental de verdad, nunca pide la clínica completa dos veces', () => {
  it('primera corrida: trae todo (sin cursor previo) y guarda el cursor más reciente', async () => {
    const r = await syncPacientes()
    expect(r.pacientes).toBe(2)
    expect(r.cursor).toBe('2026-10-01T09:00:00Z')
    expect(await obtenerPacienteDeReplica('p1')).not.toBeNull()
    expect(await obtenerPacienteDeReplica('p2')).not.toBeNull()
  })

  it('segunda corrida sin cambios nuevos: pide solo lo posterior al cursor y no trae nada', async () => {
    await syncPacientes()
    const r2 = await syncPacientes()
    expect(r2.pacientes).toBe(0)
    expect(r2.cursor).toBe('2026-10-01T09:00:00Z') // no retrocede
    // la segunda llamada SÍ usó gt() con el cursor guardado
    const segundaLlamada = llamadasVistas[1]
    expect(segundaLlamada.some(([m]) => m === 'gt')).toBe(true)
  })

  it('un paciente nuevo modificado DESPUÉS del cursor se agrega en la siguiente corrida, sin perder los anteriores', async () => {
    await syncPacientes()
    pacientesEnServidor.push({ id: 'p3', nombre_completo: 'Carla Nueva', actualizado_en: '2026-10-01T10:00:00Z' })
    const r2 = await syncPacientes()
    expect(r2.pacientes).toBe(1)
    expect(await obtenerPacienteDeReplica('p3')).not.toBeNull()
    expect(await obtenerPacienteDeReplica('p1')).not.toBeNull() // el anterior sigue ahí
  })
})

describe('syncClinica: candado contra corridas simultáneas, y conectividad real', () => {
  it('sin conexión real, no hace nada (no truena, no escribe cursor)', async () => {
    hayRed = false
    const r = await syncClinica()
    expect(r).toBeNull()
    expect(await leerCursorReplica()).toBeNull()
  })

  it('dos llamadas en paralelo: la segunda sale de inmediato con null (candado), nunca corre dos veces', async () => {
    const [r1, r2] = await Promise.all([syncClinica(), syncClinica()])
    const resultados = [r1, r2]
    expect(resultados.filter((r) => r === null)).toHaveLength(1) // exactamente una se bloqueó
    expect(resultados.some((r) => r !== null)).toBe(true) // y la otra sí corrió
  })

  it('con conexión real, actualiza la réplica y devuelve el resultado', async () => {
    const r = await syncClinica()
    expect(r.pacientes.pacientes).toBe(2)
    expect(await buscarEnReplicaClinica('Ana')).toHaveLength(1)
  })
})
