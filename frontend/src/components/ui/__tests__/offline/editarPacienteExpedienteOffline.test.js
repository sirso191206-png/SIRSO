// Editar un paciente o sus antecedentes sin conexión: a diferencia de
// crear algo nuevo, aquí SÍ importa el candado de concurrencia
// (actualizadoEnEsperado) — alguien más pudo haber editado lo mismo
// mientras no había red.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { crearQueryMock, ok, fallo, sinRed } from './helpers/supabaseMock.js'

const supabaseMock = vi.hoisted(() => ({ from: vi.fn(), auth: { refreshSession: vi.fn() } }))
vi.mock('../../../../lib/supabase', () => ({ supabase: supabaseMock }))

import { actualizarPaciente, obtenerPaciente } from '../../../../services/pacientes.js'
import { actualizarExpediente, obtenerExpediente } from '../../../../services/expedientes.js'
import { listarOperacionesPendientes } from '../../../../lib/colaOffline.js'

const ponerConexion = (enLinea) => Object.defineProperty(globalThis.navigator, 'onLine', { value: enLinea, configurable: true })

let hayRed
let pacienteEnServidor
let expedienteEnServidor
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  hayRed = true
  ponerConexion(true)
  pacienteEnServidor = { id: 'p1', nombre_completo: 'Ana López', telefono: '555-0001', actualizado_en: 't1' }
  expedienteEnServidor = { id: 'exp1', paciente_id: 'p1', alergias: ['penicilina'], actualizado_en: 'e1' }
  supabaseMock.auth.refreshSession.mockReset()
  supabaseMock.auth.refreshSession.mockResolvedValue({ data: { session: { access_token: 'x', user: { id: 'u1' } } }, error: null })
  supabaseMock.from.mockReset()
  supabaseMock.from.mockImplementation((tabla) =>
    crearQueryMock(tabla, (t) => {
      if (!hayRed) return sinRed()
      if (t === 'v_pacientes_seguro') return ok(pacienteEnServidor)
      if (t === 'expedientes') return ok(expedienteEnServidor)
      if (t === 'pacientes') return ok(pacienteEnServidor)
      return ok(null)
    }, [])
  )
})

describe('actualizarPaciente — offline', () => {
  it('con conexión real, actualiza directo (sin encolar)', async () => {
    const r = await actualizarPaciente('p1', { telefono: '555-9999' }, 't1')
    expect(r._pendiente).toBeUndefined()
    expect(await listarOperacionesPendientes()).toHaveLength(0)
  })

  it('sin conexión, encola y deja una versión optimista visible de inmediato', async () => {
    await obtenerPaciente('p1') // asegura que ya se vio antes (así llegó a la pantalla de edición)
    hayRed = false
    const r = await actualizarPaciente('p1', { telefono: '555-8888' }, 't1', { usuarioId: 'u1' })
    expect(r._pendiente).toBe(true)
    expect(r.telefono).toBe('555-8888')
    expect(r.nombre_completo).toBe('Ana López') // el resto de los datos se conserva, no se pierde

    const pendientes = await listarOperacionesPendientes()
    expect(pendientes).toHaveLength(1)
    expect(pendientes[0].tipo).toBe('actualizar_paciente')
    expect(pendientes[0].payload).toEqual({ id: 'p1', cambios: { telefono: '555-8888' }, actualizadoEnEsperado: 't1' })

    // una relectura (lo que haría la pantalla al "recargar") ve el cambio
    const relectura = await obtenerPaciente('p1')
    expect(relectura.telefono).toBe('555-8888')
  })

  it('editar el MISMO paciente dos veces offline reemplaza la operación en cola (no acumula dos)', async () => {
    await obtenerPaciente('p1')
    hayRed = false
    await actualizarPaciente('p1', { telefono: '111' }, 't1')
    await actualizarPaciente('p1', { telefono: '222' }, 't1')
    const pendientes = await listarOperacionesPendientes()
    expect(pendientes).toHaveLength(1)
    expect(pendientes[0].payload.cambios.telefono).toBe('222')
  })
})

describe('actualizar_paciente / actualizar_expediente: el ejecutor de la cola SÍ los sube', () => {
  it('procesarColaOffline() sube una edición de paciente encolada, con los datos correctos', async () => {
    await obtenerPaciente('p1')
    hayRed = false
    await actualizarPaciente('p1', { telefono: '777' }, 't1', { usuarioId: 'u1' })

    const m = vi.hoisted ? null : null // no-op, evita confusiones de scope
    const { procesarColaOffline } = await import('../../../../lib/procesadorColaOffline.js')
    hayRed = true
    supabaseMock.from.mockImplementation((tabla) =>
      crearQueryMock(tabla, (t, operaciones) => {
        if (t === 'usuarios') return ok([{ id: 'u1' }]) // heartbeat de conectividad real
        if (t === 'pacientes') {
          const upd = operaciones.find(([met]) => met === 'update')
          expect(upd[1][0].telefono).toBe('777')
          return ok({ ...pacienteEnServidor, telefono: '777' })
        }
        return ok(null)
      }, [])
    )
    await procesarColaOffline()
    expect(await listarOperacionesPendientes()).toHaveLength(0)
  })

  it('procesarColaOffline() sube una edición de antecedentes encolada, con los datos correctos', async () => {
    await obtenerExpediente('p1')
    hayRed = false
    await actualizarExpediente('exp1', { alergias: ['látex'] }, 'e1', 'p1', { usuarioId: 'u1' })

    const { procesarColaOffline } = await import('../../../../lib/procesadorColaOffline.js')
    hayRed = true
    supabaseMock.from.mockImplementation((tabla) =>
      crearQueryMock(tabla, (t, operaciones) => {
        if (t === 'usuarios') return ok([{ id: 'u1' }])
        if (t === 'expedientes') {
          const upd = operaciones.find(([met]) => met === 'update')
          expect(upd[1][0].alergias).toEqual(['látex'])
          return ok({ ...expedienteEnServidor, alergias: ['látex'] })
        }
        return ok(null)
      }, [])
    )
    await procesarColaOffline()
    expect(await listarOperacionesPendientes()).toHaveLength(0)
  })
})

describe('actualizar_paciente en la cola: idempotencia y conflicto', () => {
  it('un conflicto de concurrencia real se reporta como tal (no se pierde silenciosamente)', async () => {
    supabaseMock.from.mockImplementation((tabla) =>
      crearQueryMock(tabla, (t) => (t === 'pacientes' ? fallo('no encontrado', 'PGRST116') : ok(null)), [])
    )
    const { actualizarPacienteEnServidor } = await import('../../../../services/pacientes.js')
    await expect(actualizarPacienteEnServidor('p1', { telefono: 'x' }, 't1')).rejects.toThrow('CONFLICTO_CONCURRENCIA')
  })
})

describe('actualizarExpediente — editar el mismo dos veces offline reemplaza la operación en cola', () => {
  it('no acumula dos operaciones para el mismo expediente', async () => {
    await obtenerExpediente('p1')
    hayRed = false
    await actualizarExpediente('exp1', { alergias: ['a'] }, 'e1', 'p1')
    await actualizarExpediente('exp1', { alergias: ['b'] }, 'e1', 'p1')
    const pendientes = await listarOperacionesPendientes()
    expect(pendientes).toHaveLength(1)
    expect(pendientes[0].payload.cambios.alergias).toEqual(['b'])
  })
})

describe('actualizarExpediente (antecedentes) — offline', () => {
  it('con conexión real, actualiza directo', async () => {
    const r = await actualizarExpediente('exp1', { alergias: ['penicilina', 'ibuprofeno'] }, 'e1', 'p1')
    expect(r._pendiente).toBeUndefined()
  })

  it('sin conexión, encola y deja la caché de expediente con el cambio visible de inmediato', async () => {
    await obtenerExpediente('p1')
    hayRed = false
    const r = await actualizarExpediente('exp1', { alergias: ['penicilina', 'nuez'] }, 'e1', 'p1', { usuarioId: 'u1' })
    expect(r._pendiente).toBe(true)
    expect(r.alergias).toEqual(['penicilina', 'nuez'])

    const pendientes = await listarOperacionesPendientes()
    expect(pendientes).toHaveLength(1)
    expect(pendientes[0].tipo).toBe('actualizar_expediente')
    expect(pendientes[0].payload.expedienteId).toBe('exp1')

    const relectura = await obtenerExpediente('p1')
    expect(relectura.alergias).toEqual(['penicilina', 'nuez'])
  })

  it('sin `pacienteId` (compatibilidad), sigue encolando aunque no pueda dejar la caché optimista', async () => {
    hayRed = false
    const r = await actualizarExpediente('exp1', { alergias: ['x'] }, 'e1')
    expect(r._pendiente).toBe(true)
    expect(await listarOperacionesPendientes()).toHaveLength(1)
  })
})
