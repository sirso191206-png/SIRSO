import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_MIGRACIONES = join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations')
const sql069 = readFileSync(join(RUTA_MIGRACIONES, '069_sirso_concurrencia_pacientes.sql'), 'utf8')
const sql070 = readFileSync(join(RUTA_MIGRACIONES, '070_sirso_actualizado_en_vista_pacientes.sql'), 'utf8')

describe('069 - actualizado_en se mantiene sola via trigger, nunca la escribe el frontend', () => {
  it('agrega la columna con default now()', () => {
    expect(sql069).toMatch(/alter table pacientes add column if not exists actualizado_en timestamptz default now\(\);/)
  })

  it('el trigger corre en BEFORE UPDATE y siempre pone now(), sin condicion', () => {
    expect(sql069).toMatch(/create trigger trg_set_actualizado_en_pacientes\s*\nbefore update on pacientes/)
    const funcion = sql069.match(/create or replace function fn_set_actualizado_en[\s\S]*?\$\$;/)[0]
    expect(funcion).toMatch(/new\.actualizado_en := now\(\);/)
  })

  it('no toca el trigger de restriccion de columnas por rol existente', () => {
    expect(sql069).not.toMatch(/fn_restringir_columnas_pacientes_update/)
  })
})

describe('070 - v_pacientes_seguro expone actualizado_en sin romper las columnas existentes', () => {
  it('conserva cada columna condicional por auth_paciente_asignado que ya existia', () => {
    for (const columna of [
      'contacto_emergencia', 'seguro_medico', 'notas_generales', 'curp', 'sexo',
      'primer_apellido', 'segundo_apellido', 'tutor_legal', 'estado_civil',
      'ocupacion', 'escolaridad', 'nacionalidad', 'telefono_secundario', 'whatsapp',
      'calle', 'numero_exterior', 'numero_interior', 'colonia', 'municipio',
      'estado_domicilio', 'codigo_postal', 'tipo_paciente', 'referido_por'
    ]) {
      expect(sql070, columna).toMatch(new RegExp(`case when auth_paciente_asignado\\(id\\) then ${columna} end as ${columna}`))
    }
  })

  it('actualizado_en va al final de la lista, sin condicion (no es un dato sensible)', () => {
    const bloque = sql070.match(/select[\s\S]*?from pacientes;/)[0]
    expect(bloque.trim().endsWith('actualizado_en\nfrom pacientes;')).toBe(true)
    expect(bloque).not.toMatch(/case when auth_paciente_asignado\(id\) then actualizado_en/)
  })

  it('conserva security_invoker = true', () => {
    expect(sql070).toMatch(/with \(security_invoker = true\)/)
  })
})
