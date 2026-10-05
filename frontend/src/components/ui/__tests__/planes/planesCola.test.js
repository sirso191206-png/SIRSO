// Un límite del plan (PT402) o una funcionalidad no incluida (PT403) que salta
// DURANTE la sincronización de la cola offline: reintentarlo igual no lo
// resuelve (hay que ampliar el plan o liberar cupo), así que se conserva como
// `conflicto` en vez de reintentarse para siempre como si fuera falla de red.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { crearQueryMock, ok, fallo } from '../offline/helpers/supabaseMock.js'

const m = vi.hoisted(() => ({
  refreshSession: vi.fn(), from: vi.fn(), crearNotaClinica: vi.fn(), crearReceta: vi.fn(),
  actualizarPiezaOdontograma: vi.fn(), actualizarPiezaPeriodontal: vi.fn(), actualizarSitioPeriodontal: vi.fn(),
  actualizarCita: vi.fn(), toastExito: vi.fn(), toastError: vi.fn()
}))

vi.mock('../../../../lib/supabase', () => ({ supabase: { auth: { refreshSession: m.refreshSession }, from: m.from } }))
vi.mock('../../../../services/expedientes', async (importarOriginal) => ({ ...(await importarOriginal()), crearNotaClinica: m.crearNotaClinica }))
vi.mock('../../../../services/recetas', () => ({ crearReceta: m.crearReceta }))
vi.mock('../../../../services/odontograma', () => ({ actualizarPiezaOdontograma: m.actualizarPiezaOdontograma }))
vi.mock('../../../../services/periodontograma', () => ({ actualizarPiezaPeriodontal: m.actualizarPiezaPeriodontal, actualizarSitioPeriodontal: m.actualizarSitioPeriodontal }))
vi.mock('../../../../services/citas', () => ({ actualizarCita: m.actualizarCita, crearCita: vi.fn() }))
vi.mock('../../../../store/useToastStore', () => ({ toastExito: m.toastExito, toastError: m.toastError }))

import { procesarColaOffline } from '../../../../lib/procesadorColaOffline.js'
import { listarOperacionesPendientes, encolarOperacion } from '../../../../lib/colaOffline.js'
import { crearPacienteOffline, obtenerPacienteOfflineLocal } from '../../../../lib/pacientesOffline.js'
import { resolverId } from '../../../../lib/mapeoIdsOffline.js'
import { operacionEsDescartable } from '../../../../lib/descarteOperaciones.js'
import { evaluarOperaciones } from '../../../../lib/cierreSesion.js'

const MSG_LIMITE = 'Has alcanzado el límite de pacientes de tu plan (500). Contacta al administrador para ampliarlo.'
const errorLimite = { code: 'PT402', details: 'PLAN_LIMIT_REACHED', hint: 'pacientes', message: MSG_LIMITE }
const errorFeature = { code: 'PT403', details: 'FEATURE_NOT_AVAILABLE', message: 'Esta funcionalidad no está disponible en tu plan.' }

let modo // 'ok' | 'limite' | 'feature' | 'red'
let intentosUpsert
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  Object.values(m).forEach((f) => typeof f.mockReset === 'function' && f.mockReset())
  m.refreshSession.mockResolvedValue({ data: { session: { access_token: 'x', user: { id: 'u1' } } }, error: null })
  modo = 'limite'
  intentosUpsert = 0
  m.from.mockImplementation((tabla) => crearQueryMock(tabla, (t, ops) => {
    if (t === 'expedientes') { const eq = ops.find(([met, a]) => met === 'eq' && a[0] === 'paciente_id'); return ok({ id: `exp-${eq?.[1]?.[1]}` }) }
    if (t === 'pacientes' && ops.find(([met]) => met === 'upsert')) {
      intentosUpsert++
      if (modo === 'limite') return { data: null, error: errorLimite }
      if (modo === 'feature') return { data: null, error: errorFeature }
      if (modo === 'red') return fallo('TypeError: Failed to fetch')
      const fila = ops.find(([met]) => met === 'upsert')[1][0]
      return ok({ ...fila, clinica_id: 'c1' })
    }
    return ok(null)
  }, []))
})

const nuevo = () => crearPacienteOffline({ nombre_completo: 'Paciente de más' }, { usuarioId: 'u1' })
const conNota = async (local) => {
  m.crearNotaClinica.mockResolvedValue({ id: 'n' })
  await encolarOperacion({ id: 'nota-1', tipo: 'crear_nota_clinica', entidad: 'notas_clinicas', entidadId: 'nota-1',
    payload: { id: 'nota-1', pacienteIdOffline: local.id, contenido: 'Consulta' }, dependeDe: [local.id], usuarioId: 'u1', creado_en: 2 })
}

describe('límite de pacientes durante la sincronización', () => {
  it('queda en `conflicto` con el mensaje de la base (nunca el error crudo), y se avisa', async () => {
    const local = await nuevo()
    await procesarColaOffline()
    const op = (await listarOperacionesPendientes()).find((o) => o.id === local.id)
    expect(op.estado).toBe('conflicto')
    expect(op.ultimoError).toContain(MSG_LIMITE)
    expect(op.ultimoError).not.toMatch(/PT402|PLAN_LIMIT_REACHED/)
    expect(m.toastError).toHaveBeenCalledWith(expect.stringContaining('límite de pacientes de tu plan'))
  })

  it('se CONSERVA el trabajo local: paciente y notas dependientes siguen ahí, sin subirse', async () => {
    const local = await nuevo()
    await conNota(local)
    await procesarColaOffline()
    expect(await obtenerPacienteOfflineLocal(local.id)).not.toBeNull()
    expect((await listarOperacionesPendientes()).map((o) => o.id).sort()).toEqual(['nota-1', local.id].sort())
    expect(m.crearNotaClinica).not.toHaveBeenCalled()
    expect(await resolverId(local.id)).toBe(local.id)
  })

  it('NO se reintenta solo (las corridas automáticas no insisten); el botón manual sí', async () => {
    await nuevo()
    await procesarColaOffline()
    expect(intentosUpsert).toBe(1)
    await procesarColaOffline()
    await procesarColaOffline()
    expect(intentosUpsert).toBe(1)
    await procesarColaOffline({ reintentarConflictos: true })
    expect(intentosUpsert).toBe(2)
  })

  it('al AMPLIAR el plan, el reintento manual lo sube y destraba también a la nota que dependía de él', async () => {
    const local = await nuevo()
    await conNota(local)
    await procesarColaOffline()
    modo = 'ok' // el superadmin amplió el plan
    await procesarColaOffline({ reintentarConflictos: true })
    expect(await listarOperacionesPendientes()).toHaveLength(0)
    expect(await resolverId(local.id)).not.toBe(local.id)
    expect(m.crearNotaClinica).toHaveBeenCalledTimes(1)
  })

  it('lo que depende del conflicto espera en silencio (sin avisos repetidos en cada corrida)', async () => {
    const local = await nuevo()
    await conNota(local)
    await procesarColaOffline()
    m.toastError.mockClear()
    await procesarColaOffline()
    expect(m.toastError).not.toHaveBeenCalled()
  })

  it('cuenta como "con error" (bloquea el cierre de sesión) y se puede descartar de inmediato', async () => {
    const local = await nuevo()
    await procesarColaOffline()
    const operaciones = await listarOperacionesPendientes()
    expect(operacionEsDescartable(operaciones.find((o) => o.id === local.id))).toBe(true)
    const ev = evaluarOperaciones({ operaciones, userId: 'u1', conectado: true })
    expect(ev.errores).toBe(1)
    expect(ev.permitido).toBe(false)
  })
})

describe('funcionalidad no incluida en el plan (PT403)', () => {
  it('conflicto con el texto fijo "no está disponible en tu plan"', async () => {
    modo = 'feature'
    const local = await nuevo()
    await procesarColaOffline()
    const op = (await listarOperacionesPendientes()).find((o) => o.id === local.id)
    expect(op.estado).toBe('conflicto')
    expect(op.ultimoError).toContain('Esta funcionalidad no está disponible en tu plan.')
  })

  it('aplica a CUALQUIER tipo de operación, no solo pacientes (p. ej. una receta)', async () => {
    m.crearReceta.mockRejectedValue(errorFeature)
    await encolarOperacion({ id: 'rec-1', tipo: 'crear_receta', entidad: 'recetas', entidadId: 'rec-1', payload: { id: 'rec-1', paciente_id: 'p-real' }, dependeDe: [], usuarioId: 'u1', creado_en: 1 })
    await procesarColaOffline()
    const op = (await listarOperacionesPendientes())[0]
    expect(op.estado).toBe('conflicto')
    await procesarColaOffline()
    expect(m.crearReceta).toHaveBeenCalledTimes(1)
  })
})

describe('cerrar una consulta en un plan sin notas clínicas / expediente', () => {
  it('finalizar_consulta con notaClinica = null completa la cita SIN intentar crear la nota', async () => {
    m.actualizarCita.mockResolvedValue({ actualizado_en: 't2' })
    await encolarOperacion({
      id: 'fin-1', tipo: 'finalizar_consulta', entidad: 'citas', entidadId: 'cita-1',
      payload: { citaId: 'cita-1', motivo: 'Dolor', notaClinica: null, seguimientoPayload: null, actualizadoEnEsperado: 't1' },
      dependeDe: [], usuarioId: 'u1', creado_en: 1
    })
    await procesarColaOffline()
    expect(m.crearNotaClinica).not.toHaveBeenCalled()
    expect(m.actualizarCita).toHaveBeenCalledWith('cita-1', { estado: 'completada' }, 't2')
    expect(await listarOperacionesPendientes()).toHaveLength(0)
  })

  it('con nota (plan que la incluye) se sigue creando como siempre', async () => {
    m.actualizarCita.mockResolvedValue({ actualizado_en: 't2' })
    m.crearNotaClinica.mockResolvedValue({ id: 'n' })
    await encolarOperacion({
      id: 'fin-2', tipo: 'finalizar_consulta', entidad: 'citas', entidadId: 'cita-2',
      payload: { citaId: 'cita-2', motivo: 'x', notaClinica: { id: 'n1', contenido: 'c' }, seguimientoPayload: null, actualizadoEnEsperado: 't1' },
      dependeDe: [], usuarioId: 'u1', creado_en: 1
    })
    await procesarColaOffline()
    expect(m.crearNotaClinica).toHaveBeenCalledTimes(1)
  })
})

describe('REGRESIÓN: lo que NO es un error de plan sigue su camino de siempre', () => {
  it('una caída de red sigue siendo error TRANSITORIO que se reintenta (no pasa a conflicto)', async () => {
    modo = 'red'
    const local = await nuevo()
    await procesarColaOffline()
    const op = (await listarOperacionesPendientes()).find((o) => o.id === local.id)
    expect(op.estado).toBe('error')
    expect(op.intentos).toBe(1)
    await procesarColaOffline()
    expect(intentosUpsert).toBe(2) // sí se reintenta
  })

  it('al volver la red, un paciente dentro del cupo se sube normal', async () => {
    modo = 'ok'
    const local = await nuevo()
    await procesarColaOffline()
    expect(await listarOperacionesPendientes()).toHaveLength(0)
    expect(await resolverId(local.id)).not.toBe(local.id)
  })
})
