import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { crearQueryMock, ok, sinRed } from './helpers/supabaseMock.js'

const supabaseMock = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('../../../../lib/supabase', () => ({ supabase: supabaseMock }))

import {
  crearPaciente,
  obtenerPaciente,
  buscarPacientes
} from '../../../../services/pacientes.js'
import { guardarMapeoId } from '../../../../lib/mapeoIdsOffline.js'
import { obtenerPacienteOfflineLocal } from '../../../../lib/pacientesOffline.js'

const ponerConexion = (enLinea) => Object.defineProperty(globalThis.navigator, 'onLine', { value: enLinea, configurable: true })

let hayRed
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  hayRed = true
  ponerConexion(true)
  supabaseMock.from.mockReset()
  supabaseMock.from.mockImplementation((tabla) =>
    crearQueryMock(tabla, (t, operaciones) => {
      if (!hayRed) return sinRed()
      if (t === 'v_pacientes_seguro') {
        return ok({ id: 'p-online-1', nombre_completo: 'Paciente Cacheado' })
      }
      if (t === 'pacientes') {
        const up = operaciones.find(([m]) => m === 'insert' || m === 'upsert')
        return ok({ id: 'p-online-nuevo', ...up[1][0] })
      }
      return ok(null)
    }, [])
  )
})

describe('crearPaciente — decide según conectividad REAL, no navigator.onLine a secas', () => {
  it('con conexión real: crea directo en el servidor (id real, sin _offline)', async () => {
    const p = await crearPaciente({ nombre_completo: 'Directo' })
    expect(p.id).toBe('p-online-nuevo')
    expect(p._offline).toBeUndefined()
  })

  it('sin conexión: crea localmente con id offline, sin tocar el servidor', async () => {
    hayRed = false
    const p = await crearPaciente({ nombre_completo: 'Sin Red' }, { usuarioId: 'u1' })
    expect(p._offline).toBe(true)
    expect(p.id.startsWith('offline-')).toBe(true)
    const local = await obtenerPacienteOfflineLocal(p.id)
    expect(local.nombre_completo).toBe('Sin Red')
  })

  it('navigator.onLine=true pero el servidor no responde (wifi sin salida real): igual crea offline, no truena', async () => {
    ponerConexion(true)
    hayRed = false // navigator dice sí, pero cualquier llamada real falla
    const p = await crearPaciente({ nombre_completo: 'Wifi Falso' })
    expect(p._offline).toBe(true)
  })
})

describe('obtenerPaciente — ids offline', () => {
  it('un id offline sin sincronizar se lee del almacén local', async () => {
    hayRed = false
    const creado = await crearPaciente({ nombre_completo: 'Local' })
    const leido = await obtenerPaciente(creado.id)
    expect(leido.nombre_completo).toBe('Local')
    expect(leido._offline).toBe(true)
  })

  it('un id offline YA sincronizado redirige al id real y avisa con _redirigidoA', async () => {
    hayRed = false
    const creado = await crearPaciente({ nombre_completo: 'Ya Sincronizado' })
    await guardarMapeoId(creado.id, 'p-online-1') // simula que la cola ya lo subió

    hayRed = true // ahora sí hay red para leer el registro real
    const leido = await obtenerPaciente(creado.id)
    expect(leido._redirigidoA).toBe('p-online-1')
    expect(leido.id).toBe('p-online-1')
  })

  it('un id offline inexistente lanza, no inventa un paciente vacío', async () => {
    await expect(obtenerPaciente('offline-nunca-existio')).rejects.toThrow()
  })
})

describe('buscarPacientes — cae al índice local sin conexión', () => {
  it('sin conexión real, busca en el índice local y marca disponibilidad offline', async () => {
    hayRed = false
    await crearPaciente({ nombre_completo: 'Encontrable Offline', telefono: '555' })
    hayRed = false
    const resultados = await buscarPacientes('Encontrable')
    expect(resultados).toHaveLength(1)
    expect(resultados[0]._disponibleOffline).toBe(true) // se creó offline: siempre disponible
  })

  it('un paciente del índice que NO se creó offline y no tiene expediente cacheado: _disponibleOffline=false, nunca inventa el expediente', async () => {
    // Se indexa "a mano" (simulando que apareció en una lista, pero
    // nunca se abrió su ficha — por eso no hay nada cacheado de él).
    const { indexarPaciente } = await import('../../../../lib/indicePacientesOffline.js')
    await indexarPaciente({ id: 'p-nunca-abierto', nombre_completo: 'Visto De Lejos', telefono: null, numero_expediente: null, offline: false, actualizado_en: 1 })

    hayRed = false
    const resultados = await buscarPacientes('Visto')
    expect(resultados).toHaveLength(1)
    expect(resultados[0]._disponibleOffline).toBe(false)
  })
})
