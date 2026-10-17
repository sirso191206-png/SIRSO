// Finalizar una consulta: servicio, mensajes por código, hook (ids estables, doble clic, errores) y nota inmutable.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { crearQueryMock, ok, fallo } from './offline/helpers/supabaseMock.js'

const m = vi.hoisted(() => ({
  from: vi.fn(), rpc: vi.fn(), registro: [], responder: null,
  navigate: vi.fn(), toastExito: vi.fn(), toastError: vi.fn(), encolar: vi.fn(),
  obtenerCitaPorId: vi.fn(), finalizarConsulta: vi.fn(), perfil: { id: 'u1', clinica_id: 'c1', rol: 'dentista' }
}))
vi.mock('../../../lib/supabase', () => ({ supabase: { from: m.from, rpc: m.rpc, auth: { onAuthStateChange: vi.fn() }, channel: vi.fn(), removeChannel: vi.fn() } }))

import { finalizarConsulta } from '../../../services/consultas.js'
import { crearNotaClinica } from '../../../services/expedientes.js'
import { CODIGOS_FINALIZAR, CODIGOS_DEFINITIVOS, esRechazoDefinitivo, mensajeErrorFinalizar, datosDeDiagnostico } from '../../../lib/finalizarConsulta.js'


describe('servicio finalizarConsulta: UNA llamada transaccional', () => {
  beforeEach(() => { m.rpc.mockReset(); vi.spyOn(console, 'error').mockImplementation(() => {}) })
  afterEach(() => vi.restoreAllMocks())
  const datos = { citaId: 'cita-1', motivo: 'Dolor', nota: { id: 'n1', contenido: 'c' }, seguimiento: { id: 's1', inicio: 'a', fin: 'b' }, actualizadoEnEsperado: 'T0' }

  it('llama a fn_finalizar_consulta UNA vez con los parámetros correctos (y no a tablas sueltas)', async () => {
    m.rpc.mockResolvedValue({ data: { ok: true, nota_id: 'n1' }, error: null })
    expect(await finalizarConsulta(datos)).toEqual({ ok: true, nota_id: 'n1' })
    expect(m.rpc).toHaveBeenCalledTimes(1)
    expect(m.rpc).toHaveBeenCalledWith('fn_finalizar_consulta', { p_cita: 'cita-1', p_motivo: 'Dolor', p_nota: datos.nota, p_seguimiento: datos.seguimiento, p_actualizado_en_esperado: 'T0' })
    expect(m.from).not.toHaveBeenCalled()
  })
  it('lo opcional viaja como null (plan sin notas, sin seguimiento, sin candado)', async () => {
    m.rpc.mockResolvedValue({ data: { ok: true }, error: null })
    await finalizarConsulta({ citaId: 'c' })
    expect(m.rpc).toHaveBeenCalledWith('fn_finalizar_consulta', { p_cita: 'c', p_motivo: null, p_nota: null, p_seguimiento: null, p_actualizado_en_esperado: null })
  })
  it('un rechazo conocido del servidor llega como Error con el MENSAJE del servidor (ya está en español) y su código', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', hint: 'PACIENTE_NO_ASIGNADO', message: 'Este paciente no está asignado a ti.' } })
    const e = await finalizarConsulta(datos).catch((x) => x)
    expect(e).toBeInstanceOf(Error); expect(e.codigo).toBe('PACIENTE_NO_ASIGNADO'); expect(e.message).toBe('Este paciente no está asignado a ti.')
  })
  it('el conflicto de concurrencia conserva el mensaje EXACTO que ya entiende la cola offline', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', hint: 'CONFLICTO_CONCURRENCIA', message: 'CONFLICTO_CONCURRENCIA' } })
    const e = await finalizarConsulta(datos).catch((x) => x)
    expect(e.message).toBe('CONFLICTO_CONCURRENCIA'); expect(e.codigo).toBe('CONFLICTO_CONCURRENCIA')
  })
  it('un error NO conocido nunca muestra el texto técnico (ni tabla, ni política, ni SQL)', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'new row violates row-level security policy for table "notas_clinicas"' } })
    const e = await finalizarConsulta(datos).catch((x) => x)
    expect(e.message).not.toMatch(/row-level|notas_clinicas|policy|42501/i); expect(e.message).toMatch(/No se pudo finalizar la consulta/)
  })
  it('una caída de red se explica como tal; un 5xx del servidor también', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } })
    expect((await finalizarConsulta(datos).catch((x) => x)).message).toMatch(/no hay conexión/)
    m.rpc.mockResolvedValue({ data: null, error: { message: 'Service Unavailable', code: '503' } })
    expect((await finalizarConsulta(datos).catch((x) => x)).message).toMatch(/servidor no está disponible/)
  })
  it('deja un registro técnico (código, SQLSTATE, cita) y NUNCA contenido clínico', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', hint: 'HORARIO_OCUPADO', message: 'ocupado' } })
    await finalizarConsulta({ ...datos, motivo: 'MOTIVO SECRETO', nota: { id: 'n', contenido: 'DIAGNÓSTICO SECRETO' } }).catch(() => {})
    const registrado = JSON.stringify(console.error.mock.calls)
    expect(registrado).toContain('HORARIO_OCUPADO'); expect(registrado).toContain('cita-1')
    expect(registrado).not.toContain('SECRETO')
  })
})

describe('mensajes y códigos de finalizar consulta', () => {
  it('cada código que devuelven las funciones VIGENTES (migraciones 088, 090, 091, 092 y 093) está contemplado: la lista del frontend = la del SQL', async () => {
    const { readFileSync } = await import('node:fs')
    // Los códigos viven en dos migraciones: la 088 (finalizar) y la 090 (completar una cita ya completada + el guardián de la base).
    // 091–093 añaden la integridad nota↔cita, la autoría, las referencias entre clínicas y el límite opcional de retrofecha: la finalización puede devolverlos.
    const sql = ['088_sirso_finalizar_consulta_verificada.sql', '090_sirso_completar_cita_solo_por_consulta.sql', '091_sirso_integridad_nota_cita.sql', '092_sirso_integridad_autoria_y_referencias.sql', '093_sirso_nota_retrofecha_configurable.sql']
      .map((n) => readFileSync(new URL(`../../../../../supabase/migrations/${n}`, import.meta.url), 'utf8')).join('\n')
    const enSql = [...sql.matchAll(/hint = '([A-Z_]+)'/g)].map((x) => x[1])
    expect(new Set(enSql).size).toBeGreaterThanOrEqual(28)
    for (const c of new Set(enSql)) expect(CODIGOS_FINALIZAR, `el código ${c} del SQL no está en el frontend`).toContain(c)
    for (const c of CODIGOS_FINALIZAR) expect(enSql, `el código ${c} del frontend no existe en el SQL`).toContain(c)
  })
  it('los rechazos definitivos son un subconjunto de los conocidos, y las sesiones y la concurrencia NO lo son', () => {
    for (const c of CODIGOS_DEFINITIVOS) expect(CODIGOS_FINALIZAR).toContain(c)
    for (const c of ['SESION_INVALIDA', 'SESION_CERRADA', 'CONFLICTO_CONCURRENCIA']) expect(CODIGOS_DEFINITIVOS).not.toContain(c)
    expect(esRechazoDefinitivo({ codigo: 'PACIENTE_NO_ASIGNADO' })).toBe(true); expect(esRechazoDefinitivo({ codigo: 'SESION_CERRADA' })).toBe(false); expect(esRechazoDefinitivo(new Error('x'))).toBe(false); expect(esRechazoDefinitivo(null)).toBe(false)
  })
  it('mensajeErrorFinalizar: el conflicto de concurrencia tiene su texto propio (no el literal CONFLICTO_CONCURRENCIA)', () => {
    expect(mensajeErrorFinalizar({ codigo: 'CONFLICTO_CONCURRENCIA', message: 'CONFLICTO_CONCURRENCIA' })).toMatch(/cambió mientras la atendías/)
    expect(mensajeErrorFinalizar(new Error('CONFLICTO_CONCURRENCIA'))).toMatch(/cambió mientras la atendías/)
  })
  it('datosDeDiagnostico solo contiene identificadores técnicos', () => {
    expect(datosDeDiagnostico({ hint: 'X', code: 'P0001', status: 400, message: 'texto con datos' }, 'c1')).toEqual({ codigo: 'X', sqlstate: 'P0001', cita: 'c1', estado: 400 })
  })
})

describe('crearNotaClinica: INSERT idempotente (las notas son inmutables)', () => {
  beforeEach(() => { m.registro.length = 0; m.from.mockReset().mockImplementation((t) => crearQueryMock(t, (tabla, ops) => m.responder(tabla, ops), m.registro)) })
  it('usa INSERT (no upsert, que exigía UPDATE y fallaba con permission denied)', async () => {
    m.responder = () => ok({ id: 'n1' })
    await crearNotaClinica({ id: 'n1', expediente_id: 'e', contenido: 'c' })
    const ops = m.registro[0].operaciones.map(([nombre]) => nombre)
    expect(ops).toContain('insert'); expect(ops).not.toContain('upsert'); expect(ops).not.toContain('update')
  })
  it('si el id ya existe con el MISMO contenido (reintento de algo que sí se guardó) devuelve la nota guardada, sin duplicar ni reescribir', async () => {
    m.responder = (t, ops) => { return ops.some(([x]) => x === 'insert') ? fallo('duplicate key', '23505') : ok({ id: 'n1', expediente_id: 'e', contenido: 'igual' }) }
    expect(await crearNotaClinica({ id: 'n1', expediente_id: 'e', contenido: 'igual' })).toEqual({ id: 'n1', expediente_id: 'e', contenido: 'igual', yaExistia: true })
    expect(m.registro).toHaveLength(2)
    expect(m.registro[1].operaciones.some(([x]) => x === 'insert' || x === 'update' || x === 'upsert')).toBe(false)
  })
  it('un 23505 que NO se puede verificar (el id es de una nota ajena y no se ve) es un error real: NOTA_NO_VERIFICABLE, nunca éxito', async () => {
    m.responder = (t, ops) => (ops.some(([x]) => x === 'insert') ? fallo('duplicate key', '23505') : ok(null))
    await expect(crearNotaClinica({ id: 'n1', expediente_id: 'e', contenido: 'c' })).rejects.toMatchObject({ codigo: 'NOTA_NO_VERIFICABLE' })
  })
  it('cualquier otro error (permisos, red) se propaga tal cual', async () => {
    m.responder = () => fallo('permission denied', '42501')
    await expect(crearNotaClinica({ id: 'n1', expediente_id: 'e' })).rejects.toMatchObject({ code: '42501' })
  })
})
