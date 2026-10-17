// H28 — cobros idempotentes. Antes: registrarPago insertaba SIN id; si la respuesta se perdía (red, timeout) y la persona volvía a
// pulsar «Registrar pago», se creaba un SEGUNDO cobro (reproducido contra el stack local real en v11: dos envíos → dos filas).
// Ahora cada operación lleva un id generado en el cliente que se conserva en el reintento; la clave primaria impide la segunda fila y
// un 23505 de `pagos_pkey` solo se acepta como «ya registrado» si la fila existente es EXACTAMENTE el mismo cobro.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { crearQueryMock } from './offline/helpers/supabaseMock.js'

const m = vi.hoisted(() => ({ from: vi.fn(), registro: [], responder: null }))
vi.mock('../../../lib/supabase', () => ({ supabase: { from: (...a) => m.from(...a), auth: { getSession: vi.fn(), onAuthStateChange: vi.fn() }, rpc: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() } }))

import { registrarPago, corregirPago } from '../../../services/pagos.js'
import { operacionCobro, firmaCobro, esMismoCobro } from '../../../lib/operacionPago.js'

const fuente = (ruta) => readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), 'utf8')
const DUP_PK = { code: '23505', message: 'duplicate key value violates unique constraint "pagos_pkey"', details: 'Key (id)=(p1) already exists.' }
const COBRO = { id: 'p1', paciente_id: 'pa1', monto: 350.5, metodo: 'efectivo', tipo: 'pago', registrado_por: 'u1' }
const metodos = (i) => m.registro[i].operaciones.map(([n]) => n)
const argumento = (i, metodo) => m.registro[i].operaciones.find(([n]) => n === metodo)?.[1]?.[0]

// Base de datos simulada con la MISMA regla que la real: la clave primaria `id` es única.
function baseConClavePrimaria() {
  const filas = new Map()
  m.responder = (tabla, ops) => {
    const ins = ops.find(([n]) => n === 'insert')
    if (ins) {
      const fila = ins[1][0]
      if (filas.has(fila.id)) return { data: null, error: DUP_PK }
      const guardada = { ...fila, numero_recibo: `REC-${String(filas.size + 1).padStart(5, '0')}`, anulado_en: null, tratamiento_id: fila.tratamiento_id ?? null }
      filas.set(fila.id, guardada); return { data: { ...guardada }, error: null }
    }
    const eq = ops.find(([n]) => n === 'eq')
    if (eq) return { data: filas.has(eq[1][1]) ? { ...filas.get(eq[1][1]) } : null, error: null }
    return { data: null, error: null }
  }
  return filas
}

beforeEach(() => {
  m.registro.length = 0
  m.from.mockReset().mockImplementation((t) => crearQueryMock(t, (tabla, ops) => m.responder(tabla, ops), m.registro))
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true })
})

describe('H28 — registrarPago es idempotente por operación', () => {
  it('el INSERT lleva un id; si quien llama no lo da, se genera uno (nunca se inserta sin id)', async () => {
    baseConClavePrimaria()
    const { id, ...sinId } = COBRO
    const r = await registrarPago(sinId)
    expect(typeof argumento(0, 'insert').id).toBe('string'); expect(argumento(0, 'insert').id).toMatch(/^[0-9a-f-]{36}$/); expect(r.id).toBe(argumento(0, 'insert').id); expect(id).toBe('p1')
  })
  it('respuesta PERDIDA y reintento con el mismo id → una sola fila; el reintento devuelve el cobro existente marcado `yaExistia`', async () => {
    const filas = baseConClavePrimaria()
    await registrarPago(COBRO) // el servidor lo guardó, pero el cliente «no se enteró»
    const r = await registrarPago(COBRO)
    expect(filas.size).toBe(1); expect(r).toMatchObject({ id: 'p1', numero_recibo: 'REC-00001', yaExistia: true })
    expect(metodos(1)).toContain('insert'); expect(metodos(2)).not.toContain('insert') // la verificación solo LEE
  })
  it('doble envío CONCURRENTE de la misma operación → una sola fila y ambas llamadas terminan bien', async () => {
    const filas = baseConClavePrimaria()
    const [a, b] = await Promise.all([registrarPago(COBRO), registrarPago(COBRO)])
    expect(filas.size).toBe(1); expect([a.yaExistia, b.yaExistia].filter(Boolean)).toHaveLength(1); expect(a.numero_recibo).toBe(b.numero_recibo)
  })
  it('dos operaciones LEGÍTIMAS distintas (aunque tengan el mismo monto) → dos cobros', async () => {
    const filas = baseConClavePrimaria()
    await registrarPago({ ...COBRO, id: 'p1' }); await registrarPago({ ...COBRO, id: 'p2' })
    expect(filas.size).toBe(2)
  })
  it('23505 de pagos_pkey pero con OTRO contenido → PAGO_CONFLICTO (no se da por bueno un cobro distinto)', async () => {
    baseConClavePrimaria(); await registrarPago(COBRO)
    for (const cambio of [{ monto: 351 }, { metodo: 'tarjeta' }, { paciente_id: 'otro' }, { tipo: 'anticipo' }, { registrado_por: 'u2' }]) {
      const e = await registrarPago({ ...COBRO, ...cambio }).catch((x) => x)
      expect(e.codigo, JSON.stringify(cambio)).toBe('PAGO_CONFLICTO')
    }
  })
  it('23505 de pagos_pkey y el cobro NO se puede leer (otra clínica, permisos) → PAGO_NO_VERIFICABLE, nunca un éxito', async () => {
    m.responder = (t, ops) => (ops.some(([n]) => n === 'insert') ? { data: null, error: DUP_PK } : { data: null, error: null })
    expect((await registrarPago(COBRO).catch((x) => x)).codigo).toBe('PAGO_NO_VERIFICABLE')
  })
  it('un 23505 de OTRA restricción no se confunde con «ya registrado»: se propaga el error original', async () => {
    const otro = { code: '23505', message: 'duplicate key value violates unique constraint "otra_restriccion"' }
    m.responder = () => ({ data: null, error: otro })
    expect(await registrarPago(COBRO).catch((x) => x)).toBe(otro)
  })
  it('cualquier otro error (permisos, red, CHECK) se propaga tal cual', async () => {
    const e = { code: '42501', message: 'new row violates row-level security policy for table "pagos"' }
    m.responder = () => ({ data: null, error: e }); expect(await registrarPago(COBRO).catch((x) => x)).toBe(e)
  })
  it('el monto se compara como número (350.5 = "350.50" que devuelve numeric)', () => {
    expect(esMismoCobro({ ...COBRO, monto: '350.50', tratamiento_id: null }, COBRO)).toBe(true)
  })
})

describe('H28 — identificador de operación del formulario', () => {
  it('mismo formulario sin cambios (reintento) → MISMO id; cambiar monto, método o paciente → id NUEVO', () => {
    const a = operacionCobro(null, { paciente_id: 'pa1', monto: 100, metodo: 'efectivo' })
    expect(operacionCobro(a, { paciente_id: 'pa1', monto: 100, metodo: 'efectivo' })).toBe(a)
    expect(operacionCobro(a, { paciente_id: 'pa1', monto: 101, metodo: 'efectivo' }).id).not.toBe(a.id)
    expect(operacionCobro(a, { paciente_id: 'pa1', monto: 100, metodo: 'tarjeta' }).id).not.toBe(a.id)
    expect(operacionCobro(a, { paciente_id: 'pa2', monto: 100, metodo: 'efectivo' }).id).not.toBe(a.id)
  })
  it('tras un cobro correcto la operación se descarta: el siguiente cobro idéntico es una operación NUEVA', () => {
    expect(operacionCobro(null, { paciente_id: 'pa1', monto: 100, metodo: 'efectivo' }).id).not.toBe(operacionCobro(null, { paciente_id: 'pa1', monto: 100, metodo: 'efectivo' }).id)
    expect(firmaCobro({ paciente_id: 'pa1', monto: 100, metodo: 'efectivo' })).toBe(firmaCobro({ paciente_id: 'pa1', monto: '100.00', metodo: 'efectivo', tipo: 'pago' }))
  })
  it('SeccionPagos: id de operación conservado hasta el éxito y bloqueo de envíos simultáneos dentro del propio envío', () => {
    const s = fuente('../../tratamientos/SeccionPagos.jsx')
    expect(s).toMatch(/operacionCobro\(/); expect(s).toMatch(/enviandoRef\.current\) return/); expect(s).toMatch(/id: operacion\.id/)
    expect(s).toMatch(/idOperacion/) // la corrección también reintenta con el mismo id
  })
})

describe('H28 — corregir un pago no duplica el cobro corregido al reintentar', () => {
  it('corregirPago registra el cobro nuevo con el id de operación recibido', async () => {
    const filas = baseConClavePrimaria()
    m.responder = ((base) => (tabla, ops) => (ops.some(([n]) => n === 'update') ? { data: { id: 'viejo', anulado_en: 'x' }, error: null } : base(tabla, ops)))(m.responder)
    const original = { id: 'viejo', paciente_id: 'pa1', tipo: 'pago', tratamiento_id: null }
    await corregirPago(original, { monto: 90, metodo: 'efectivo' }, { usuarioId: 'u1', idOperacion: 'op-1' })
    const r = await corregirPago(original, { monto: 90, metodo: 'efectivo' }, { usuarioId: 'u1', idOperacion: 'op-1' })
    expect(filas.size).toBe(1); expect(r).toMatchObject({ id: 'op-1', yaExistia: true })
  })
})
