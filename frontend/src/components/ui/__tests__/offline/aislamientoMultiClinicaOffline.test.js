// Escenario crítico de aislamiento multi-clínica (§22): el MISMO
// equipo se usa para dos cuentas de DOS CLÍNICAS distintas. RLS no
// aplica sin conexión — la única defensa es vaciar lo que pueda
// filtrar datos de la cuenta anterior antes de que la nueva cuenta
// trabaje offline.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'

vi.mock('../../../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))

import { asegurarCacheDeEsteUsuario, limpiarDatosLocalesDeSesion } from '../../../../lib/cierreSesion.js'
import { indexarPaciente, buscarEnIndiceLocal } from '../../../../lib/indicePacientesOffline.js'
import { crearPacienteOffline, obtenerPacienteOfflineLocal } from '../../../../lib/pacientesOffline.js'
import { guardarMapeoId, resolverId } from '../../../../lib/mapeoIdsOffline.js'
import { listarOperacionesPendientes } from '../../../../lib/colaOffline.js'
import { actualizarCacheDeLectura, conCacheDeLectura } from '../../../../lib/cacheLectura.js'
import { guardarPacientesEnReplica, buscarEnReplicaClinica, guardarCursorReplica, leerCursorReplica } from '../../../../lib/pacientesReplica.js'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

describe('cambiar de usuario en el mismo equipo (clínica distinta): asegurarCacheDeEsteUsuario', () => {
  it('un paciente indexado por la cuenta anterior NO aparece en la búsqueda de la cuenta nueva', async () => {
    await indexarPaciente({ id: 'p-clinica-1', nombre_completo: 'Paciente De Otra Clínica', telefono: '555', numero_expediente: null, offline: false, actualizado_en: 1 })
    expect(await buscarEnIndiceLocal('Otra Clínica')).toHaveLength(1)

    await asegurarCacheDeEsteUsuario('usuario-clinica-2')

    expect(await buscarEnIndiceLocal('Otra Clínica')).toHaveLength(0)
  })

  it('un paciente creado offline por la cuenta anterior deja de estar disponible localmente', async () => {
    const paciente = await crearPacienteOffline({ nombre_completo: 'Secreto Clínica 1' }, { usuarioId: 'usuario-clinica-1' })
    expect(await obtenerPacienteOfflineLocal(paciente.id)).not.toBeNull()

    await asegurarCacheDeEsteUsuario('usuario-clinica-2')

    expect(await obtenerPacienteOfflineLocal(paciente.id)).toBeNull()
  })

  it('un mapeo offlineId→serverId de la cuenta anterior se vacía también', async () => {
    await guardarMapeoId('offline-x', 'server-real-1')
    expect(await resolverId('offline-x')).toBe('server-real-1')

    await asegurarCacheDeEsteUsuario('usuario-clinica-2')

    expect(await resolverId('offline-x')).toBe('offline-x') // ya no encuentra el mapeo viejo
  })

  it('una lectura cacheada (ficha de paciente) de la cuenta anterior también se vacía', async () => {
    await actualizarCacheDeLectura('paciente:p1', { nombre_completo: 'Visible Antes' })
    const { deCache: antesDeCache } = await conCacheDeLectura('paciente:p1', () => Promise.reject(new Error('sin red')))
    expect(antesDeCache).toBe(true) // existe en caché: la lectura "real" falla pero cae a lo guardado

    await asegurarCacheDeEsteUsuario('usuario-clinica-2')

    await expect(conCacheDeLectura('paciente:p1', () => Promise.reject(new Error('sin red')))).rejects.toThrow()
  })

  it('la COLA de operaciones pendientes de la cuenta anterior NUNCA se toca — solo sus copias locales de lectura', async () => {
    const paciente = await crearPacienteOffline({ nombre_completo: 'Con cambios sin subir' }, { usuarioId: 'usuario-clinica-1' })
    const pendientesAntes = await listarOperacionesPendientes()
    expect(pendientesAntes).toHaveLength(1)

    await asegurarCacheDeEsteUsuario('usuario-clinica-2')

    const pendientesDespues = await listarOperacionesPendientes()
    expect(pendientesDespues).toHaveLength(1)
    expect(pendientesDespues[0].id).toBe(paciente.id)
    expect(pendientesDespues[0].usuarioId).toBe('usuario-clinica-1') // sigue siendo de la cuenta anterior, intacta
  })

  it('si la misma cuenta vuelve a entrar (no cambió de usuario), NO se borra nada', async () => {
    // Un dueño desconocido (equipo nuevo, o anterior a esta protección)
    // siempre se trata como ajeno — por diseño. Se fija primero el
    // dueño en un equipo "limpio" antes de indexar nada.
    await asegurarCacheDeEsteUsuario('mismo-usuario')

    await indexarPaciente({ id: 'p1', nombre_completo: 'Sigue Aquí', telefono: null, numero_expediente: null, offline: false, actualizado_en: 1 })
    await asegurarCacheDeEsteUsuario('mismo-usuario') // segunda vez, MISMO usuario

    expect(await buscarEnIndiceLocal('Sigue')).toHaveLength(1) // nada se perdió
  })

  it('la réplica completa de la clínica (y su cursor) también se vacía al cambiar de usuario', async () => {
    await guardarPacientesEnReplica([{ id: 'p-clinica-1', nombre_completo: 'De La Clínica 1', telefono: null, actualizado_en: 't1', archivado_en: null }])
    await guardarCursorReplica('t1')
    expect(await buscarEnReplicaClinica('Clínica 1')).toHaveLength(1)

    await asegurarCacheDeEsteUsuario('usuario-clinica-2')

    expect(await buscarEnReplicaClinica('Clínica 1')).toHaveLength(0)
    expect(await leerCursorReplica()).toBeNull() // nunca hereda el cursor de la clínica anterior
  })
})

describe('cerrar sesión: limpiarDatosLocalesDeSesion también vacía los tres almacenes nuevos', () => {
  it('vacía índice, pacientes offline y mapeos — nunca la cola', async () => {
    await indexarPaciente({ id: 'p1', nombre_completo: 'X', telefono: null, numero_expediente: null, offline: false, actualizado_en: 1 })
    const paciente = await crearPacienteOffline({ nombre_completo: 'Y' }, { usuarioId: 'u1' })
    await guardarMapeoId('offline-z', 'server-z')

    await limpiarDatosLocalesDeSesion()

    expect(await buscarEnIndiceLocal('X')).toHaveLength(0)
    expect(await obtenerPacienteOfflineLocal(paciente.id)).toBeNull()
    expect(await resolverId('offline-z')).toBe('offline-z')
    expect(await listarOperacionesPendientes()).toHaveLength(1) // la cola sigue intacta
  })
})
