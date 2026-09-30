import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { crearQueryMock, ok, sinRed, fallo } from './helpers/supabaseMock.js'

const supabaseMock = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('../../../../lib/supabase', () => ({ supabase: supabaseMock }))

import { esIdOffline, resolverId, guardarMapeoId } from '../../../../lib/mapeoIdsOffline.js'
import { crearPacienteOffline, obtenerPacienteOfflineLocal, marcarPacienteOfflineSincronizado } from '../../../../lib/pacientesOffline.js'
import { indexarPaciente, buscarEnIndiceLocal } from '../../../../lib/indicePacientesOffline.js'
import { listarOperacionesPendientes } from '../../../../lib/colaOffline.js'
import { verificarConexionReal } from '../../../../lib/conectividadReal.js'

const ponerConexion = (enLinea) => Object.defineProperty(globalThis.navigator, 'onLine', { value: enLinea, configurable: true })

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  ponerConexion(true)
  supabaseMock.from.mockReset()
})

describe('esIdOffline / resolverId / guardarMapeoId', () => {
  it('distingue un id offline de uno real', () => {
    expect(esIdOffline('offline-abc')).toBe(true)
    expect(esIdOffline('a1b2c3')).toBe(false)
    expect(esIdOffline(null)).toBe(false)
    expect(esIdOffline(undefined)).toBe(false)
  })

  it('un id real nunca se toca, aunque nunca se haya mapeado nada', async () => {
    expect(await resolverId('real-123')).toBe('real-123')
  })

  it('un id offline SIN mapeo todavía se regresa igual (nunca inventa uno)', async () => {
    expect(await resolverId('offline-x')).toBe('offline-x')
  })

  it('con mapeo guardado, resuelve al id real', async () => {
    await guardarMapeoId('offline-x', 'real-999')
    expect(await resolverId('offline-x')).toBe('real-999')
  })
})

describe('crearPacienteOffline', () => {
  it('genera un id offline- distinto del uuid real que viajará al servidor', async () => {
    const p = await crearPacienteOffline({ nombre_completo: 'Ana López', telefono: '555' }, { usuarioId: 'u1' })
    expect(esIdOffline(p.id)).toBe(true)
    expect(p.idFuturo).toBeTruthy()
    expect(p.id).not.toBe(p.idFuturo)
    expect(p._offline).toBe(true)
  })

  it('queda disponible de inmediato en el almacén local', async () => {
    const p = await crearPacienteOffline({ nombre_completo: 'Beto Ruiz' })
    const local = await obtenerPacienteOfflineLocal(p.id)
    expect(local.nombre_completo).toBe('Beto Ruiz')
    expect(local.sincronizado).toBe(false)
  })

  it('encola crear_paciente con el uuid real embebido en el payload (para que la subida sea idempotente)', async () => {
    const p = await crearPacienteOffline({ nombre_completo: 'Carla' }, { usuarioId: 'u1', clinicaId: 'c1' })
    const pendientes = await listarOperacionesPendientes()
    expect(pendientes).toHaveLength(1)
    expect(pendientes[0].tipo).toBe('crear_paciente')
    expect(pendientes[0].id).toBe(p.id) // el id de la operación = el id offline del paciente
    expect(pendientes[0].payload.id).toBe(p.idFuturo)
    expect(pendientes[0].dependeDe).toEqual([])
    expect(pendientes[0].usuarioId).toBe('u1')
  })

  it('aparece de inmediato en el índice de búsqueda local', async () => {
    await crearPacienteOffline({ nombre_completo: 'Diana Nueva', telefono: '999' })
    const resultados = await buscarEnIndiceLocal('Diana')
    expect(resultados).toHaveLength(1)
    expect(resultados[0].offline).toBe(true)
  })
})

describe('marcarPacienteOfflineSincronizado', () => {
  it('conserva el registro (no lo borra) y guarda el serverId', async () => {
    const p = await crearPacienteOffline({ nombre_completo: 'Elena' })
    await marcarPacienteOfflineSincronizado(p.id, 'server-real-1')
    const local = await obtenerPacienteOfflineLocal(p.id)
    expect(local.sincronizado).toBe(true)
    expect(local.serverId).toBe('server-real-1')
    expect(local.nombre_completo).toBe('Elena') // el resto de los datos sigue intacto
  })

  it('si el registro ya no existe, no truena', async () => {
    await expect(marcarPacienteOfflineSincronizado('offline-nunca-existio', 'x')).resolves.toBeUndefined()
  })
})

describe('índice local de búsqueda', () => {
  beforeEach(async () => {
    await indexarPaciente({ id: 'p1', nombre_completo: 'María José Pérez', telefono: '5551234567', numero_expediente: 'EXP-01', offline: false, actualizado_en: 1 })
    await indexarPaciente({ id: 'p2', nombre_completo: 'Juan Pérez', telefono: '5559876543', numero_expediente: 'EXP-02', offline: false, actualizado_en: 2 })
  })

  it('busca por nombre, ignorando mayúsculas y acentos', async () => {
    const r = await buscarEnIndiceLocal('maria jose')
    expect(r.map((x) => x.id)).toEqual(['p1'])
  })

  it('busca por teléfono', async () => {
    const r = await buscarEnIndiceLocal('9876543')
    expect(r.map((x) => x.id)).toEqual(['p2'])
  })

  it('busca por folio de expediente', async () => {
    const r = await buscarEnIndiceLocal('EXP-01')
    expect(r.map((x) => x.id)).toEqual(['p1'])
  })

  it('término vacío regresa todo (ordenado por nombre)', async () => {
    const r = await buscarEnIndiceLocal('')
    expect(r.map((x) => x.id)).toEqual(['p2', 'p1']) // Juan antes que María alfabéticamente
  })

  it('reindexar el mismo id actualiza, no duplica', async () => {
    await indexarPaciente({ id: 'p1', nombre_completo: 'María José Pérez (editado)', telefono: '5551234567', numero_expediente: 'EXP-01', offline: false, actualizado_en: 3 })
    const r = await buscarEnIndiceLocal('editado')
    expect(r).toHaveLength(1)
  })
})

describe('verificarConexionReal', () => {
  it('navigator.onLine=false: ni intenta preguntarle al servidor', async () => {
    ponerConexion(false)
    const resultado = await verificarConexionReal(supabaseMock)
    expect(resultado).toBe(false)
    expect(supabaseMock.from).not.toHaveBeenCalled()
  })

  it('navigator.onLine=true y el servidor responde: conexión real confirmada', async () => {
    supabaseMock.from.mockImplementation((t) => crearQueryMock(t, () => ok([{ id: 'x' }]), []))
    expect(await verificarConexionReal(supabaseMock)).toBe(true)
  })

  it('navigator.onLine=true pero el servidor no responde (wifi sin salida real): NO es conexión real', async () => {
    supabaseMock.from.mockImplementation((t) => crearQueryMock(t, () => sinRed(), []))
    expect(await verificarConexionReal(supabaseMock)).toBe(false)
  })

  it('el servidor responde con un error explícito: tampoco es conexión real', async () => {
    supabaseMock.from.mockImplementation((t) => crearQueryMock(t, () => fallo('rechazado', '500'), []))
    expect(await verificarConexionReal(supabaseMock)).toBe(false)
  })

  it('usa abortSignal para no colgarse si la consulta nunca responde', async () => {
    supabaseMock.from.mockImplementation((t) => crearQueryMock(t, () => new Promise(() => {}), []))
    const resultado = await verificarConexionReal(supabaseMock, { tiempoLimiteMs: 20 })
    expect(resultado).toBe(false)
  })
})
