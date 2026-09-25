import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_MIGRACIONES = join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations')
const sql = readFileSync(join(RUTA_MIGRACIONES, '062_sirso_cancelar_tratamiento_anular_pago.sql'), 'utf8')

describe('062 - tratamientos: campo de motivo (el estado cancelado ya existia desde el esquema original)', () => {
  it('agrega motivo_cancelacion y cancelado_por, nullable', () => {
    expect(sql).toMatch(/alter table tratamientos add column if not exists motivo_cancelacion text/)
    expect(sql).toMatch(/alter table tratamientos add column if not exists cancelado_por uuid references usuarios\(id\)/)
  })

  it('no toca el check constraint de estado - cancelado ya era valido desde antes', () => {
    expect(sql).not.toMatch(/tratamientos_estado_check/)
    expect(sql).not.toMatch(/alter table tratamientos.*constraint.*estado/i)
  })
})

describe('062 - pagos: anulacion real, nunca edicion', () => {
  it('agrega anulado_en, anulado_por, motivo_anulacion', () => {
    expect(sql).toMatch(/alter table pagos add column if not exists anulado_en timestamptz/)
    expect(sql).toMatch(/alter table pagos add column if not exists anulado_por uuid references usuarios\(id\)/)
    expect(sql).toMatch(/alter table pagos add column if not exists motivo_anulacion text/)
  })

  it('la politica de update usa los mismos roles que ya podian insertar (owner, recepcion)', () => {
    const bloque = sql.match(/create policy pagos_update[\s\S]*?;\n/)[0]
    expect(bloque).toMatch(/auth_rol\(\) in \('owner', 'recepcion'\)/)
  })

  it('el trigger bloquea cambiar monto, metodo, tipo, paciente_id, tratamiento_id, registrado_por y creado_en', () => {
    const funcion = sql.match(/create or replace function fn_solo_anulacion_pago[\s\S]*?\$\$;/)[0]
    for (const campo of ['monto', 'metodo', 'tipo', 'paciente_id', 'tratamiento_id', 'registrado_por', 'creado_en']) {
      expect(funcion, campo).toMatch(new RegExp(`new\\.${campo} is distinct from old\\.${campo}`))
    }
  })

  it('el trigger corre en BEFORE UPDATE sobre pagos', () => {
    expect(sql).toMatch(/create trigger trg_solo_anulacion_pago\s*\nbefore update on pagos/)
  })
})

describe('062 - v_saldo_pacientes: excluye pagos anulados, conserva la exclusion de tratamientos cancelados', () => {
  it('el total_pagado excluye filas con anulado_en no nulo, en pagos y en reembolsos', () => {
    const bloque = sql.match(/create or replace view v_saldo_pacientes[\s\S]*?group by p\.id;/)[0]
    const coincidencias = bloque.match(/pg\.anulado_en is null/g) ?? []
    expect(coincidencias.length).toBeGreaterThanOrEqual(2)
  })

  it('conserva la exclusion de tratamientos cancelados que ya existia', () => {
    const bloque = sql.match(/create or replace view v_saldo_pacientes[\s\S]*?group by p\.id;/)[0]
    expect(bloque).toMatch(/t\.estado <> 'cancelado'/)
  })

  it('re-establece security_invoker explicitamente despues del create or replace, para no perder el fix de seguridad de la migracion 001', () => {
    expect(sql).toMatch(/alter view v_saldo_pacientes set \(security_invoker = true\)/)
  })
})
