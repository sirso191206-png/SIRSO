// Archivar/restaurar un paciente sin conexión — y la razón real por la
// que necesitan su PROPIA clave en la cola, distinta de la que usa
// "datos generales".
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { crearQueryMock, ok } from './helpers/supabaseMock.js'

const supabaseMock = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('../../../../lib/supabase', () => ({ supabase: supabaseMock }))

import { archivarPaciente, restaurarPaciente, actualizarPaciente, obtenerPaciente } from '../../../../services/pacientes.js'
import { listarOperacionesPendientes } from '../../../../lib/colaOffline.js'

const ponerConexion = (enLinea) => Object.defineProperty(globalThis.navigator, 'onLine', { value: enLinea, configurable: true })

let hayRed
let pacienteEnServidor
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  hayRed = true
  ponerConexion(true)
  pacienteEnServidor = { id: 'p1', nombre_completo: 'Ana López', telefono: '555', actualizado_en: 't1', archivado_en: null }
  supabaseMock.from.mockReset()
  supabaseMock.from.mockImplementation((tabla) =>
    crearQueryMock(tabla, (t) => {
      if (!hayRed) return { data: null, error: { message: 'sin red' } }
      return ok(pacienteEnServidor)
    }, [])
  )
})

describe('archivar/restaurar — offline', () => {
  it('con conexión real, archiva directo', async () => {
    await archivarPaciente('p1', { usuarioId: 'u1' })
    expect(await listarOperacionesPendientes()).toHaveLength(0)
  })

  it('sin conexión, encola bajo su PROPIA clave (no la de "datos generales")', async () => {
    await obtenerPaciente('p1')
    hayRed = false
    await archivarPaciente('p1', { usuarioId: 'u1' })
    const pendientes = await listarOperacionesPendientes()
    expect(pendientes).toHaveLength(1)
    expect(pendientes[0].id).toBe('archivar_restaurar_paciente_p1')
    expect(pendientes[0].payload.cambios.archivado_en).toBeTruthy()
  })

  it('CRÍTICO: editar datos generales y luego archivar, ambos offline, NO pierde la edición', async () => {
    await obtenerPaciente('p1')
    hayRed = false
    // 1. Edita el teléfono (instantánea completa del formulario, como
    //    hace TabDatosGenerales.jsx)
    await actualizarPaciente('p1', { nombre_completo: 'Ana López', telefono: '999' }, 't1', { usuarioId: 'u1' })
    // 2. Archiva al paciente
    await archivarPaciente('p1', { usuarioId: 'u1' })

    const pendientes = await listarOperacionesPendientes()
    // Deben ser DOS operaciones distintas, no una reemplazando a la otra
    expect(pendientes).toHaveLength(2)
    const opDatos = pendientes.find((p) => p.tipo === 'actualizar_paciente' && p.payload.cambios.telefono)
    const opArchivar = pendientes.find((p) => p.payload.cambios.archivado_en)
    expect(opDatos.payload.cambios.telefono).toBe('999') // la edición sigue ahí, no se perdió
    expect(opArchivar.payload.cambios.archivado_en).toBeTruthy()
  })

  it('archivar y luego restaurar, ambos offline, convergen a UNA sola operación (no acumulan)', async () => {
    await obtenerPaciente('p1')
    hayRed = false
    await archivarPaciente('p1', { usuarioId: 'u1' })
    await restaurarPaciente('p1', { usuarioId: 'u1' })
    const pendientes = await listarOperacionesPendientes()
    expect(pendientes).toHaveLength(1) // la segunda reemplazó a la primera
    expect(pendientes[0].payload.cambios.archivado_en).toBeNull() // el resultado neto es "restaurado"
  })

  it('restaurar deja la ficha visible como restaurada de inmediato (caché optimista)', async () => {
    pacienteEnServidor.archivado_en = '2026-01-01T00:00:00Z'
    await obtenerPaciente('p1')
    hayRed = false
    await restaurarPaciente('p1', { usuarioId: 'u1' })
    const relectura = await obtenerPaciente('p1')
    expect(relectura.archivado_en).toBeNull()
  })
})
