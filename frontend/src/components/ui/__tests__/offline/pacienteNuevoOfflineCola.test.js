// Escenario crítico del pliego: se va el internet, llega un paciente
// nuevo, el odontólogo lo registra y le agrega una nota clínica y una
// receta SIN conexión, regresa el internet y todo se sincroniza solo,
// en el orden correcto, sin duplicar nada.
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

// lib/supabase se mockea completo (auth + from): `from` es real en el
// sentido de que services/pacientes.js SÍ lo usa de verdad para el
// upsert del paciente — es la pieza que más importa probar end-to-end
// (que un reintento nunca duplique). Las demás entidades (nota,
// receta) se mockean a nivel de servicio, igual que ya hacía la
// batería existente de procesadorCola.test.js.
vi.mock('../../../../lib/supabase', () => ({ supabase: { auth: { refreshSession: m.refreshSession }, from: m.from } }))
vi.mock('../../../../services/expedientes', async (importarOriginal) => {
  const real = await importarOriginal()
  return { ...real, crearNotaClinica: m.crearNotaClinica }
})
vi.mock('../../../../services/recetas', () => ({ crearReceta: m.crearReceta }))
vi.mock('../../../../services/odontograma', () => ({ actualizarPiezaOdontograma: m.actualizarPiezaOdontograma }))
vi.mock('../../../../services/periodontograma', () => ({
  actualizarPiezaPeriodontal: m.actualizarPiezaPeriodontal,
  actualizarSitioPeriodontal: m.actualizarSitioPeriodontal
}))
vi.mock('../../../../services/citas', () => ({ actualizarCita: m.actualizarCita, crearCita: m.crearCita }))
vi.mock('../../../../store/useToastStore', () => ({ toastExito: m.toastExito, toastError: m.toastError }))

import { procesarColaOffline } from '../../../../lib/procesadorColaOffline.js'
import { listarOperacionesPendientes, encolarOperacion } from '../../../../lib/colaOffline.js'
import { crearPacienteOffline } from '../../../../lib/pacientesOffline.js'
import { resolverId, esIdOffline } from '../../../../lib/mapeoIdsOffline.js'

const sesionViva = () => m.refreshSession.mockResolvedValue({ data: { session: { access_token: 'x', user: { id: 'u1' } } }, error: null })

// Tabla `pacientes` en Supabase: por defecto, un upsert exitoso que
// respeta el id que se le mandó (igual que Postgres con un id explícito).
let respuestaPacientes
let insertsPacientesVistos
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  Object.values(m).forEach((f) => typeof f.mockReset === 'function' && f.mockReset())
  sesionViva()
  insertsPacientesVistos = []
  respuestaPacientes = (payload) => ok({ id: payload.id, nombre_completo: payload.nombre_completo })
  m.from.mockImplementation((tabla) =>
    crearQueryMock(tabla, (t, operaciones) => {
      if (t === 'pacientes') {
        const up = operaciones.find(([met]) => met === 'upsert')
        const payload = up[1][0]
        insertsPacientesVistos.push(payload)
        return respuestaPacientes(payload)
      }
      if (t === 'expedientes') return ok({ id: `expediente-de-${operaciones[1]?.[1]?.[0] ?? '?'}` })
      return ok(null)
    }, [])
  )
  // obtenerExpediente hace .eq('paciente_id', X).single() — el mock
  // genérico de arriba no lee `eq`, así que se cubre aparte abajo caso
  // por caso cuando hace falta un expediente_id específico y estable.
})

describe('paciente nuevo offline: creación + notas/recetas dependientes, en una sola corrida', () => {
  it('sube primero al paciente y SOLO ENTONCES la nota clínica que dependía de él, resolviendo expediente_id', async () => {
    const idExpedienteReal = 'expediente-real-1'
    m.from.mockImplementation((tabla) =>
      crearQueryMock(tabla, (t, operaciones) => {
        if (t === 'pacientes') {
          const payload = operaciones.find(([met]) => met === 'upsert')[1][0]
          insertsPacientesVistos.push(payload)
          return ok({ id: payload.id, nombre_completo: payload.nombre_completo })
        }
        if (t === 'expedientes') return ok({ id: idExpedienteReal })
        return ok(null)
      }, [])
    )
    m.crearNotaClinica.mockResolvedValue({ id: 'nota-1' })

    const paciente = await crearPacienteOffline({ nombre_completo: 'Paciente Nuevo' }, { usuarioId: 'u1' })
    await encolarOperacion({
      id: 'nota-op-1',
      tipo: 'crear_nota_clinica',
      entidad: 'notas_clinicas',
      entidadId: 'nota-op-1',
      payload: { id: 'nota-op-1', pacienteIdOffline: paciente.id, contenido: 'Consulta de urgencia' },
      dependeDe: [paciente.id],
      usuarioId: 'u1',
      creado_en: 2
    })

    await procesarColaOffline()

    expect(m.crearNotaClinica).toHaveBeenCalledTimes(1)
    const payloadEnviado = m.crearNotaClinica.mock.calls[0][0]
    expect(payloadEnviado.expediente_id).toBe(idExpedienteReal)
    expect(payloadEnviado.pacienteIdOffline).toBeUndefined() // el placeholder no debe llegar al servicio real
    expect(await listarOperacionesPendientes()).toHaveLength(0) // las dos se subieron, nada queda atascado
  })

  it('sube primero al paciente y luego la receta, sustituyendo paciente_id offline por el real', async () => {
    m.crearReceta.mockResolvedValue({ id: 'receta-1' })
    const paciente = await crearPacienteOffline({ nombre_completo: 'Otro Paciente' }, { usuarioId: 'u1' })
    await encolarOperacion({
      id: 'receta-op-1',
      tipo: 'crear_receta',
      entidad: 'recetas',
      entidadId: 'receta-op-1',
      payload: { id: 'receta-op-1', paciente_id: paciente.id, medicamento: 'Amoxicilina' },
      dependeDe: [paciente.id],
      usuarioId: 'u1',
      creado_en: 2
    })

    await procesarColaOffline()

    expect(m.crearReceta).toHaveBeenCalledTimes(1)
    const payloadEnviado = m.crearReceta.mock.calls[0][0]
    expect(esIdOffline(payloadEnviado.paciente_id)).toBe(false)
    expect(payloadEnviado.paciente_id).toBe(insertsPacientesVistos[0].id) // el id real que Supabase "asignó"
  })

  it('si el paciente falla transitorio (red), la nota dependiente NO se intenta esta corrida — se queda pendiente', async () => {
    m.from.mockImplementation((tabla) => crearQueryMock(tabla, () => (tabla === 'pacientes' ? fallo('caída de red') : ok(null)), []))
    const paciente = await crearPacienteOffline({ nombre_completo: 'X' }, { usuarioId: 'u1' })
    await encolarOperacion({
      id: 'nota-op-2', tipo: 'crear_nota_clinica', entidad: 'notas_clinicas', entidadId: 'nota-op-2',
      payload: { id: 'nota-op-2', pacienteIdOffline: paciente.id, contenido: 'x' },
      dependeDe: [paciente.id], usuarioId: 'u1', creado_en: 2
    })

    await procesarColaOffline()

    expect(m.crearNotaClinica).not.toHaveBeenCalled()
    const pendientes = await listarOperacionesPendientes()
    expect(pendientes.map((o) => o.id).sort()).toEqual(['nota-op-2', paciente.id].sort())
    expect(pendientes.find((o) => o.id === paciente.id).estado).toBe('error')
    expect(pendientes.find((o) => o.id === 'nota-op-2').estado).not.toBe('error') // nunca se le dio la oportunidad de fallar por su cuenta
  })

  it('si el paciente choca por concurrencia (pérdida definitiva), la nota dependiente se descarta también — nunca queda huérfana reintentando para siempre', async () => {
    m.from.mockImplementation((tabla) => crearQueryMock(tabla, () => (tabla === 'pacientes' ? fallo('CONFLICTO_CONCURRENCIA') : ok(null)), []))
    const paciente = await crearPacienteOffline({ nombre_completo: 'Y' }, { usuarioId: 'u1' })
    await encolarOperacion({
      id: 'nota-op-3', tipo: 'crear_nota_clinica', entidad: 'notas_clinicas', entidadId: 'nota-op-3',
      payload: { id: 'nota-op-3', pacienteIdOffline: paciente.id, contenido: 'x' },
      dependeDe: [paciente.id], usuarioId: 'u1', creado_en: 2
    })

    await procesarColaOffline()

    expect(m.crearNotaClinica).not.toHaveBeenCalled()
    expect(await listarOperacionesPendientes()).toHaveLength(0) // ambas se sacaron: ninguna podía completarse ya
  })

  it('idempotencia: reintentar crear_paciente (p. ej. la primera corrida se cortó después del insert real) nunca crea dos pacientes — el mismo id se re-sube (upsert)', async () => {
    const paciente = await crearPacienteOffline({ nombre_completo: 'Idempotente' }, { usuarioId: 'u1' })

    await procesarColaOffline() // corrida 1: sube con éxito
    expect(insertsPacientesVistos).toHaveLength(1)
    expect(await listarOperacionesPendientes()).toHaveLength(0)

    // Si por lo que sea la operación siguiera en la cola (reconexión a
    // medias) y se procesara otra vez, el upsert usa el MISMO id — la
    // "base de datos" simulada solo ve un id, nunca un duplicado.
    await encolarOperacion({
      id: paciente.id, tipo: 'crear_paciente', entidad: 'pacientes', entidadId: paciente.id,
      payload: { id: paciente.idFuturo, nombre_completo: 'Idempotente' }, dependeDe: [], usuarioId: 'u1', creado_en: 1
    })
    await procesarColaOffline() // corrida 2: mismo id otra vez
    expect(insertsPacientesVistos).toHaveLength(2)
    expect(new Set(insertsPacientesVistos.map((p) => p.id)).size).toBe(1) // un solo id real en las dos "inserciones"
  })

  it('varias notas del mismo paciente offline se suben todas en la misma corrida', async () => {
    m.crearNotaClinica.mockResolvedValue({ id: 'ok' })
    m.from.mockImplementation((tabla) =>
      crearQueryMock(tabla, (t, operaciones) => {
        if (t === 'pacientes') {
          const payload = operaciones.find(([met]) => met === 'upsert')[1][0]
          insertsPacientesVistos.push(payload)
          return ok({ id: payload.id })
        }
        if (t === 'expedientes') return ok({ id: 'exp-multi' })
        return ok(null)
      }, [])
    )
    const paciente = await crearPacienteOffline({ nombre_completo: 'Varias notas' }, { usuarioId: 'u1' })
    for (const suf of ['a', 'b', 'c']) {
      await encolarOperacion({
        id: `nota-${suf}`, tipo: 'crear_nota_clinica', entidad: 'notas_clinicas', entidadId: `nota-${suf}`,
        payload: { id: `nota-${suf}`, pacienteIdOffline: paciente.id, contenido: suf },
        dependeDe: [paciente.id], usuarioId: 'u1', creado_en: 2
      })
    }

    await procesarColaOffline()

    expect(m.crearNotaClinica).toHaveBeenCalledTimes(3)
    expect(await listarOperacionesPendientes()).toHaveLength(0)
  })

  it('operación de OTRA cuenta que depende de un paciente offline ajeno no se toca (aislamiento multiusuario ya existente sigue funcionando)', async () => {
    const paciente = await crearPacienteOffline({ nombre_completo: 'De otra cuenta' }, { usuarioId: 'otro-usuario' })
    await encolarOperacion({
      id: 'nota-ajena', tipo: 'crear_nota_clinica', entidad: 'notas_clinicas', entidadId: 'nota-ajena',
      payload: { id: 'nota-ajena', pacienteIdOffline: paciente.id, contenido: 'x' },
      dependeDe: [paciente.id], usuarioId: 'otro-usuario', creado_en: 2
    })

    await procesarColaOffline()

    expect(m.crearNotaClinica).not.toHaveBeenCalled()
    const pendientes = await listarOperacionesPendientes()
    expect(pendientes.map((o) => o.id).sort()).toEqual(['nota-ajena', paciente.id].sort())
  })

  it('resolverId sigue devolviendo el id offline sin mapeo hasta que el paciente termine de subirse', async () => {
    const paciente = await crearPacienteOffline({ nombre_completo: 'Z' })
    expect(await resolverId(paciente.id)).toBe(paciente.id)
    await procesarColaOffline()
    expect(await resolverId(paciente.id)).toBe(insertsPacientesVistos[0].id)
  })
})
