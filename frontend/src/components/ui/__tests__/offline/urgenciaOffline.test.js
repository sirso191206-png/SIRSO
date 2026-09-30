// "Nueva urgencia" es exactamente el escenario del pliego: se va el
// internet, llega alguien sin avisar. Cubre paciente existente Y
// paciente completamente nuevo, los dos dentro del mismo flujo.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { crearQueryMock, ok } from './helpers/supabaseMock.js'

const supabaseMock = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('../../../../lib/supabase', () => ({ supabase: supabaseMock }))

import { crearCitaUrgencia } from '../../../../services/citas.js'
import { crearPaciente } from '../../../../services/pacientes.js'
import { listarOperacionesPendientes } from '../../../../lib/colaOffline.js'
import { esIdOffline } from '../../../../lib/mapeoIdsOffline.js'

const ponerConexion = (enLinea) => Object.defineProperty(globalThis.navigator, 'onLine', { value: enLinea, configurable: true })

let hayRed
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  hayRed = true
  ponerConexion(true)
  supabaseMock.from.mockReset()
  supabaseMock.from.mockImplementation((tabla) =>
    crearQueryMock(tabla, (t, operaciones) => {
      if (!hayRed) return { data: null, error: { message: 'sin red' } }
      if (t === 'pacientes') {
        const up = operaciones.find(([m]) => m === 'upsert' || m === 'insert')[1][0]
        return ok({ id: 'paciente-real-urgencia', ...up })
      }
      if (t === 'citas') {
        const up = operaciones.find(([m]) => m === 'upsert')[1][0]
        return ok({ id: 'cita-real-urgencia', ...up })
      }
      return ok(null)
    }, [])
  )
})

describe('crearCitaUrgencia — paciente YA existente', () => {
  it('con conexión real, crea la cita directo (sin encolar)', async () => {
    const cita = await crearCitaUrgencia({ pacienteId: 'paciente-real-1', dentistaId: 'd1', motivo: 'Dolor', prioridad: 'urgente' })
    expect(cita.id).toBe('cita-real-urgencia')
    expect(cita._offline).toBeUndefined()
    expect(await listarOperacionesPendientes()).toHaveLength(0)
  })

  it('sin conexión, encola con id propio y sin dependencia (el paciente ya existe)', async () => {
    hayRed = false
    const cita = await crearCitaUrgencia({ pacienteId: 'paciente-real-1', motivo: 'Dolor', usuarioId: 'u1' })
    expect(cita._offline).toBe(true)
    const pendientes = await listarOperacionesPendientes()
    expect(pendientes).toHaveLength(1)
    expect(pendientes[0].tipo).toBe('crear_cita')
    expect(pendientes[0].dependeDe).toEqual([])
    expect(pendientes[0].payload.paciente_id).toBe('paciente-real-1')
  })

  it('la cita trae hora de inicio/fin calculadas aunque esté encolada (no depende del servidor para eso)', async () => {
    hayRed = false
    const cita = await crearCitaUrgencia({ pacienteId: 'paciente-real-1', duracionMinutos: 45 })
    const minutos = (new Date(cita.fin) - new Date(cita.inicio)) / 60000
    expect(minutos).toBe(45)
  })
})

describe('crearCitaUrgencia — paciente completamente NUEVO, sin conexión', () => {
  it('el paciente se crea localmente y la cita queda encolada dependiendo de él', async () => {
    hayRed = false
    const paciente = await crearPaciente({ nombre_completo: 'Urgencia Walk-in', telefono: '555' }, { usuarioId: 'u1' })
    expect(esIdOffline(paciente.id)).toBe(true)

    const cita = await crearCitaUrgencia({ pacienteId: paciente.id, motivo: 'Dolor intenso', usuarioId: 'u1' })
    expect(cita._offline).toBe(true)

    const pendientes = await listarOperacionesPendientes()
    const opCita = pendientes.find((op) => op.tipo === 'crear_cita')
    expect(opCita.payload.paciente_id).toBe(paciente.id)
    expect(opCita.dependeDe).toEqual([paciente.id])
    // el paciente también sigue en la cola, esperando su turno
    expect(pendientes.some((op) => op.tipo === 'crear_paciente' && op.id === paciente.id)).toBe(true)
  })

  it('nunca intenta crear la cita directo aunque haya conexión, si el paciente es offline', async () => {
    hayRed = false
    const paciente = await crearPaciente({ nombre_completo: 'X' })
    hayRed = true // "vuelve" la red, pero el paciente sigue sin sincronizar
    const cita = await crearCitaUrgencia({ pacienteId: paciente.id, motivo: 'Y' })
    expect(cita._offline).toBe(true) // se sigue encolando: el paciente no existe en el servidor todavía
  })
})
