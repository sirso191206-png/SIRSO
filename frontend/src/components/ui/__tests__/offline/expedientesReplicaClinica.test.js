import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { crearQueryMock, ok, sinRed } from './helpers/supabaseMock.js'

const supabaseMock = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('../../../../lib/supabase', () => ({ supabase: supabaseMock }))

import {
  guardarExpedientesEnReplica,
  obtenerExpedienteDeReplica,
  leerCursorExpedientes,
  guardarCursorExpedientes,
  vaciarReplicaExpedientes
} from '../../../../lib/expedientesReplica.js'
import { syncExpedientes } from '../../../../lib/clinicDataSync.js'
import { obtenerExpediente } from '../../../../services/expedientes.js'

const ponerConexion = (enLinea) => Object.defineProperty(globalThis.navigator, 'onLine', { value: enLinea, configurable: true })

let hayRed
let expedientesEnServidor
let llamadasVistas
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  hayRed = true
  ponerConexion(true)
  expedientesEnServidor = [
    { paciente_id: 'p1', alergias: ['penicilina'], enfermedades: [], medicamentos_actuales: [], antecedentes_familiares: null, actualizado_en: '2026-10-01T08:00:00Z' },
    { paciente_id: 'p2', alergias: [], enfermedades: ['diabetes'], medicamentos_actuales: [], antecedentes_familiares: null, actualizado_en: '2026-10-01T09:00:00Z' }
  ]
  llamadasVistas = []
  supabaseMock.from.mockReset()
  supabaseMock.from.mockImplementation((tabla) =>
    crearQueryMock(tabla, (t, operaciones) => {
      if (!hayRed) return sinRed()
      if (t === 'expedientes') {
        llamadasVistas.push(operaciones)
        const gt = operaciones.find(([m]) => m === 'gt')
        const desde = gt?.[1]?.[1]
        const filas = desde ? expedientesEnServidor.filter((e) => e.actualizado_en > desde) : expedientesEnServidor
        return ok(filas)
      }
      return ok(null)
    }, [])
  )
})

describe('lib/expedientesReplica.js — almacén local', () => {
  it('guarda, lee uno, y vacía (incluido el cursor)', async () => {
    await guardarExpedientesEnReplica(expedientesEnServidor)
    await guardarCursorExpedientes('2026-10-01T09:00:00Z')
    expect(await obtenerExpedienteDeReplica('p1')).toMatchObject({ alergias: ['penicilina'] })
    await vaciarReplicaExpedientes()
    expect(await obtenerExpedienteDeReplica('p1')).toBeNull()
    expect(await leerCursorExpedientes()).toBeNull()
  })
})

describe('syncExpedientes: incremental de verdad, nunca pide la clínica completa dos veces', () => {
  it('primera corrida: trae todo y guarda el cursor', async () => {
    const r = await syncExpedientes()
    expect(r.expedientes).toBe(2)
    expect(r.cursor).toBe('2026-10-01T09:00:00Z')
  })

  it('segunda corrida sin cambios: pide solo lo posterior al cursor, no trae nada', async () => {
    await syncExpedientes()
    const r2 = await syncExpedientes()
    expect(r2.expedientes).toBe(0)
    expect(llamadasVistas[1].some(([m]) => m === 'gt')).toBe(true)
  })

  it('NO trae campos pesados (notas/odontograma/tratamientos) — solo lo ligero', async () => {
    await syncExpedientes()
    const seleccion = llamadasVistas[0].find(([m]) => m === 'select')
    const columnas = seleccion[1][0]
    expect(columnas).not.toMatch(/notas|odontograma|periodontograma|tratamiento|receta/)
    expect(columnas).toMatch(/alergias/)
  })
})

describe('obtenerExpediente — cae a la réplica ligera si nunca se abrió antes', () => {
  it('sin red y SIN caché previa, pero el expediente YA está en la réplica: regresa alergias/enfermedades', async () => {
    await guardarExpedientesEnReplica(expedientesEnServidor)
    hayRed = false
    const r = await obtenerExpediente('p1')
    expect(r.alergias).toEqual(['penicilina'])
    expect(r._soloBasico).toBe(true)
  })

  it('sin red, sin caché Y sin réplica: falla de verdad, nunca inventa "sin alergias"', async () => {
    hayRed = false
    await expect(obtenerExpediente('p-fantasma')).rejects.toBeTruthy()
  })
})
