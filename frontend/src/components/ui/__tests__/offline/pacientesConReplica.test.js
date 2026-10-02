// services/pacientes.js consciente de la réplica de toda la clínica:
// obtenerPaciente() cae a datos básicos si nunca se abrió esta ficha
// pero el paciente ya está en la réplica; buscarPacientes() combina
// réplica + índice ligero sin duplicar.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { crearQueryMock, ok, sinRed } from './helpers/supabaseMock.js'

const supabaseMock = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('../../../../lib/supabase', () => ({ supabase: supabaseMock }))

import { obtenerPaciente, buscarPacientes, crearPaciente } from '../../../../services/pacientes.js'
import { guardarPacientesEnReplica } from '../../../../lib/pacientesReplica.js'
import { indexarPaciente } from '../../../../lib/indicePacientesOffline.js'

const ponerConexion = (enLinea) => Object.defineProperty(globalThis.navigator, 'onLine', { value: enLinea, configurable: true })

let hayRed
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  hayRed = true
  ponerConexion(true)
  supabaseMock.from.mockReset()
  supabaseMock.from.mockImplementation((tabla) =>
    crearQueryMock(tabla, () => (hayRed ? ok(null) : sinRed()), [])
  )
})

describe('obtenerPaciente — cae a la réplica si nunca se abrió esta ficha', () => {
  it('sin red y SIN caché previa, pero el paciente YA está en la réplica: regresa datos básicos', async () => {
    await guardarPacientesEnReplica([{ id: 'p1', nombre_completo: 'Nunca Abierto', telefono: '555', actualizado_en: 't1' }])
    hayRed = false
    const r = await obtenerPaciente('p1')
    expect(r.nombre_completo).toBe('Nunca Abierto')
    expect(r._soloBasico).toBe(true)
  })

  it('sin red, sin caché Y sin réplica: falla de verdad, no inventa un paciente', async () => {
    hayRed = false
    await expect(obtenerPaciente('p-fantasma')).rejects.toBeTruthy()
  })
})

describe('buscarPacientes — combina réplica (toda la clínica) + índice ligero (lo creado/visto aquí), sin duplicar', () => {
  it('un paciente solo en la réplica aparece marcado _basicoDisponible', async () => {
    await guardarPacientesEnReplica([{ id: 'p1', nombre_completo: 'De La Réplica', telefono: null, actualizado_en: 't1', archivado_en: null }])
    hayRed = false
    const r = await buscarPacientes('Réplica')
    expect(r).toHaveLength(1)
    expect(r[0]._basicoDisponible).toBe(true)
  })

  it('un paciente creado offline (todavía no en la réplica del servidor) también aparece, vía el índice', async () => {
    hayRed = false
    const creado = await crearPaciente({ nombre_completo: 'Recién Creado Offline' })
    const r = await buscarPacientes('Recién Creado')
    expect(r.some((p) => p.id === creado.id)).toBe(true)
  })

  it('el MISMO paciente nunca aparece duplicado si está en la réplica Y en el índice', async () => {
    await guardarPacientesEnReplica([{ id: 'p1', nombre_completo: 'Visto Dos Veces', telefono: null, actualizado_en: 't1', archivado_en: null }])
    await indexarPaciente({ id: 'p1', nombre_completo: 'Visto Dos Veces', telefono: null, numero_expediente: null, offline: false, actualizado_en: 1 })
    hayRed = false
    const r = await buscarPacientes('Visto Dos Veces')
    expect(r).toHaveLength(1)
  })
})
