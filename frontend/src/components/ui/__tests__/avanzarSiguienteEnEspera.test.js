// El avance de la fila (antes en el botón de Mi día): al terminar una consulta, el siguiente EN ESPERA pasa a consulta — solo si le corresponde.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { crearQueryMock, ok, fallo } from './offline/helpers/supabaseMock.js'

const m = vi.hoisted(() => ({ from: vi.fn(), registro: [], responder: null }))
vi.mock('../../../lib/supabase', () => ({ supabase: { from: (...a) => m.from(...a), auth: { getSession: async () => ({ data: { session: {} } }), onAuthStateChange: vi.fn() }, rpc: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() } }))

import { avanzarSiguienteEnEspera } from '../../../services/citas.js'

const estadoDe = (ops) => ops.find(([n, a]) => n === 'eq' && a[0] === 'estado')?.[1]?.[1]
const esUpdate = (ops) => ops.some(([n]) => n === 'update')
// Simula la base: `enConsulta` (otra consulta del mismo odontólogo), `espera` (candidatos) y `movidas` (filas que cambió el UPDATE condicional).
const base = ({ enConsulta = [], espera = [], movidas = null } = {}) => (t, ops) => {
  if (esUpdate(ops)) return ok(movidas ?? [{ id: m.ultimoMovido ?? 'x' }])
  if (estadoDe(ops) === 'en_consulta') return ok(enConsulta)
  return ok(espera)
}
const actualizaciones = () => m.registro.filter((r) => esUpdate(r.operaciones))
const op = (r, nombre) => r.operaciones.filter(([n]) => n === nombre)
const E = (id, sucursal = 's1', sillon = null) => ({ id, sucursal_id: sucursal, sillon_id: sillon })
const pedir = (extra = {}) => avanzarSiguienteEnEspera({ dentistaId: 'dent-1', excluirCitaId: 'cita-1', sucursalId: 's1', sillonId: null, ...extra })

beforeEach(() => { m.registro.length = 0; m.from.mockReset().mockImplementation((t) => crearQueryMock(t, (tabla, ops) => m.responder(tabla, ops), m.registro)) })

describe('avanzarSiguienteEnEspera — a quién SÍ se avanza', () => {
  it('al siguiente en espera de HOY de ESE odontólogo y esa sucursal, por hora; el cambio es CONDICIONAL (estado = en_espera) y solo a en_consulta (administrativo)', async () => {
    m.responder = base({ espera: [E('sig-1')], movidas: [{ id: 'sig-1' }] })
    expect(await pedir()).toBe('sig-1')
    expect(m.registro).toHaveLength(3)
    const [enConsulta, candidatos, mover] = m.registro
    expect(op(enConsulta, 'eq').map(([, a]) => a)).toEqual(expect.arrayContaining([['dentista_id', 'dent-1'], ['estado', 'en_consulta']])); expect(op(enConsulta, 'neq')[0][1]).toEqual(['id', 'cita-1'])
    expect(op(candidatos, 'eq').map(([, a]) => a)).toEqual(expect.arrayContaining([['dentista_id', 'dent-1'], ['estado', 'en_espera']])); expect(op(candidatos, 'neq')[0][1]).toEqual(['id', 'cita-1'])
    const [col, { ascending }] = op(candidatos, 'order')[0][1]; expect(col).toBe('inicio'); expect(ascending).toBe(true)
    const [[, [, desde]], [, [, hasta]]] = [op(candidatos, 'gte')[0], op(candidatos, 'lt')[0]]; expect(new Date(hasta) - new Date(desde)).toBe(86400000); expect(new Date(desde).getHours()).toBe(0)
    expect(op(mover, 'update')[0][1][0]).toEqual({ estado: 'en_consulta' }); expect(op(mover, 'eq').map(([, a]) => a)).toEqual([['id', 'sig-1'], ['estado', 'en_espera']])
  })
  it('un paciente en espera SIN sillón asignado no tiene conflicto de sillón, aunque la consulta que termina use uno', async () => {
    m.responder = base({ espera: [E('sig-1', 's1', null)], movidas: [{ id: 'sig-1' }] }); expect(await pedir({ sillonId: 'sillon-A' })).toBe('sig-1')
  })
  it('con el MISMO sillón sí se avanza', async () => {
    m.responder = base({ espera: [E('sig-1', 's1', 'sillon-A')], movidas: [{ id: 'sig-1' }] }); expect(await pedir({ sillonId: 'sillon-A' })).toBe('sig-1')
  })
})

describe('avanzarSiguienteEnEspera — a quién NO se avanza (no asignarlo al odontólogo, sucursal o sillón equivocados)', () => {
  it('una persona en espera en OTRA sucursal se salta; se avanza al primero de ESTA sucursal', async () => {
    m.responder = base({ espera: [E('otra-sucursal', 's2'), E('sig-1', 's1')], movidas: [{ id: 'sig-1' }] }); expect(await pedir()).toBe('sig-1')
    expect(op(m.registro[2], 'eq').map(([, a]) => a)[0]).toEqual(['id', 'sig-1'])
  })
  it('si solo hay gente de otra sucursal, no se avanza a nadie y NO se escribe nada', async () => {
    m.responder = base({ espera: [E('a', 's2'), E('b', 's3')] }); expect(await pedir()).toBeNull(); expect(actualizaciones()).toHaveLength(0)
  })
  it('un paciente con OTRO sillón asignado se salta; si la consulta que termina no tiene sillón, tampoco se avanza a uno con sillón asignado', async () => {
    m.responder = base({ espera: [E('sillon-B', 's1', 'sillon-B')] }); expect(await pedir({ sillonId: 'sillon-A' })).toBeNull(); expect(actualizaciones()).toHaveLength(0)
    expect(await pedir({ sillonId: null })).toBeNull(); expect(actualizaciones()).toHaveLength(0)
  })
  it('si el odontólogo YA tiene a otra persona en consulta hoy, no se abre una segunda consulta simultánea', async () => {
    m.responder = base({ enConsulta: [{ id: 'otra' }], espera: [E('sig-1')] }); expect(await pedir()).toBeNull(); expect(actualizaciones()).toHaveLength(0); expect(m.registro).toHaveLength(1)
  })
  it('una cita sin sucursal solo se avanza si la que termina tampoco tiene (nunca se mezclan «sin sucursal» y una sucursal)', async () => {
    m.responder = base({ espera: [E('sig-1', null)] }); expect(await pedir({ sucursalId: 's1' })).toBeNull()
    m.responder = base({ espera: [E('sig-1', null)], movidas: [{ id: 'sig-1' }] }); expect(await pedir({ sucursalId: null })).toBe('sig-1')
  })
  it('sin odontólogo (p. ej. urgencia sin asignar) no consulta ni cambia nada', async () => {
    expect(await avanzarSiguienteEnEspera({ dentistaId: null, excluirCitaId: 'c' })).toBeNull(); expect(m.registro).toHaveLength(0)
  })
})

describe('avanzarSiguienteEnEspera — concurrencia y errores', () => {
  it('CARRERA: si recepción canceló o movió al paciente entre la lectura y la escritura, el UPDATE condicional no cambia ninguna fila y NO se resucita (devuelve null)', async () => {
    m.responder = base({ espera: [E('sig-1')], movidas: [] }); expect(await pedir()).toBeNull()
    expect(op(m.registro[2], 'eq').map(([, a]) => a)).toContainEqual(['estado', 'en_espera'])
  })
  it('nunca escribe «completada» ni toca notas', async () => {
    m.responder = base({ espera: [E('sig-1')], movidas: [{ id: 'sig-1' }] }); await pedir()
    for (const r of actualizaciones()) { expect(op(r, 'update')[0][1][0].estado).toBe('en_consulta'); expect(r.tabla ?? 'citas').toBe('citas') }
  })
  it('un error de la base se propaga (quien llama decide; la finalización ya guardada no se ve afectada)', async () => {
    m.responder = () => fallo('boom', '500'); await expect(pedir()).rejects.toMatchObject({ code: '500' })
    m.responder = (t, ops) => (esUpdate(ops) ? fallo('boom', '500') : estadoDe(ops) === 'en_consulta' ? ok([]) : ok([E('sig-1')])); await expect(pedir()).rejects.toMatchObject({ code: '500' })
  })
})
