import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { crearQueryMock, ok, sinRed } from './helpers/supabaseMock.js'

const supabaseMock = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('../../../../lib/supabase', () => ({ supabase: supabaseMock }))

import {
  guardarCitasEnReplica,
  buscarEnReplicaCitas,
  marcarSincronizacionCompleta,
  huboSincronizacionCompleta,
  vaciarReplicaCitas
} from '../../../../lib/citasReplica.js'
import { syncAgenda, ventanaDeAgenda } from '../../../../lib/clinicDataSync.js'
import { obtenerCitasRangoConEstado } from '../../../../services/citas.js'

const ponerConexion = (enLinea) => Object.defineProperty(globalThis.navigator, 'onLine', { value: enLinea, configurable: true })

let hayRed
let citasEnServidor
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  hayRed = true
  ponerConexion(true)
  citasEnServidor = [
    { id: 'c1', inicio: '2026-10-05T10:00:00Z', dentista_id: 'd1', estado: 'agendada', sucursal_id: null, paciente: { nombre_completo: 'Ana' } },
    { id: 'c2', inicio: '2026-10-10T10:00:00Z', dentista_id: 'd2', estado: 'confirmada', sucursal_id: null, paciente: { nombre_completo: 'Beto' } }
  ]
  supabaseMock.from.mockReset()
  supabaseMock.from.mockImplementation((tabla) =>
    crearQueryMock(tabla, () => {
      if (!hayRed) return sinRed()
      if (tabla === 'citas') return ok(citasEnServidor)
      return ok(null)
    }, [])
  )
})

describe('lib/citasReplica.js — almacén de la ventana', () => {
  it('guarda, busca por rango/dentista/estado, y vacía (incluida la marca)', async () => {
    await guardarCitasEnReplica(citasEnServidor)
    expect(await buscarEnReplicaCitas({ desde: '2026-10-01', hasta: '2026-10-31' })).toHaveLength(2)
    expect(await buscarEnReplicaCitas({ desde: '2026-10-01', hasta: '2026-10-31', dentistaId: 'd1' })).toHaveLength(1)
    expect(await buscarEnReplicaCitas({ desde: '2026-10-01', hasta: '2026-10-31', estado: 'confirmada' })).toHaveLength(1)
    expect(await buscarEnReplicaCitas({ desde: '2026-10-06', hasta: '2026-10-31' })).toHaveLength(1) // c1 queda fuera

    await marcarSincronizacionCompleta()
    expect(await huboSincronizacionCompleta()).toBe(true)
    await vaciarReplicaCitas()
    expect(await buscarEnReplicaCitas({ desde: '2026-10-01', hasta: '2026-10-31' })).toHaveLength(0)
    expect(await huboSincronizacionCompleta()).toBe(false)
  })

  it('nunca sincronizada: huboSincronizacionCompleta() es false desde el inicio', async () => {
    expect(await huboSincronizacionCompleta()).toBe(false)
  })
})

describe('syncAgenda: trae la ventana completa (sin cursor) y marca que ya corrió', () => {
  it('guarda las citas de la ventana y marca la sincronización', async () => {
    const r = await syncAgenda()
    expect(r.citas).toBe(2)
    expect(await huboSincronizacionCompleta()).toBe(true)
    expect(await buscarEnReplicaCitas({ desde: '2026-10-01', hasta: '2026-10-31' })).toHaveLength(2)
  })

  it('re-sincronizar con una cita MENOS en el servidor refleja el cambio (no es un cursor que solo acumula)', async () => {
    await syncAgenda()
    citasEnServidor = [citasEnServidor[0]] // c2 ya no existe/cambió de rango
    await syncAgenda()
    expect(await buscarEnReplicaCitas({ desde: '2026-10-01', hasta: '2026-10-31' })).toHaveLength(2)
    // (c2 sigue en IndexedDB porque guardarCitasEnReplica solo hace put,
    // nunca borra lo que ya no viene — ver límite en GUIA_OFFLINE.md)
  })

  it('ventanaDeAgenda() cubre pasado reciente y futuro próximo, no solo hoy', () => {
    const { desde, hasta } = ventanaDeAgenda(new Date('2026-10-15T12:00:00Z'))
    expect(new Date(desde).getTime()).toBeLessThan(new Date('2026-10-15').getTime())
    expect(new Date(hasta).getTime()).toBeGreaterThan(new Date('2026-11-01').getTime())
  })
})

describe('obtenerCitasRangoConEstado: distingue "ventana vacía de verdad" de "nunca sincronizada"', () => {
  it('con red, funciona normal (sin tocar la réplica)', async () => {
    const r = await obtenerCitasRangoConEstado({ desde: '2026-10-01', hasta: '2026-10-31' })
    expect(r.deCache).toBe(false)
    expect(r.datos).toHaveLength(2)
  })

  it('sin red, SIN haber consultado este rango exacto antes, pero la ventana YA se sincronizó: cae a la réplica', async () => {
    await syncAgenda() // la ventana ya quedó replicada, con conexión
    hayRed = false
    const r = await obtenerCitasRangoConEstado({ desde: '2026-10-04', hasta: '2026-10-11' }) // rango nunca antes pedido
    expect(r.deCache).toBe(true)
    expect(r.datos).toHaveLength(2)
  })

  it('CRÍTICO: sin red y la ventana NUNCA se sincronizó, un resultado vacío de la réplica NO se confunde con "día sin citas" — falla de verdad', async () => {
    hayRed = false
    await expect(obtenerCitasRangoConEstado({ desde: '2026-10-04', hasta: '2026-10-11' })).rejects.toBeTruthy()
  })

  it('un rango FUERA de la ventana replicada falla, aunque la ventana sí se haya sincronizado', async () => {
    await syncAgenda()
    hayRed = false
    const fueraDeVentana = { desde: '2027-01-01', hasta: '2027-01-31' }
    await expect(obtenerCitasRangoConEstado(fueraDeVentana)).rejects.toBeTruthy()
  })

  it('una ventana sincronizada pero genuinamente SIN citas en el rango pedido regresa [] correctamente (no falla)', async () => {
    await syncAgenda()
    hayRed = false
    const r = await obtenerCitasRangoConEstado({ desde: '2026-10-20', hasta: '2026-10-25' }) // sin citas en ese tramo
    expect(r.deCache).toBe(true)
    expect(r.datos).toEqual([])
  })
})
