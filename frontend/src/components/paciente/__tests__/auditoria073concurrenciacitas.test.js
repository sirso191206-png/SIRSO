import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_MIGRACIONES = join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations')
const sql = readFileSync(join(RUTA_MIGRACIONES, '073_sirso_concurrencia_citas.sql'), 'utf8')

describe('073 - citas nunca tuvo actualizado_en, se agrega y se conecta al mismo trigger genérico', () => {
  it('agrega la columna con default now() para que las citas existentes queden con un valor de partida', () => {
    expect(sql).toMatch(/alter table citas add column if not exists actualizado_en timestamptz default now\(\);/)
  })

  it('reutiliza fn_set_actualizado_en, sin definir una funcion nueva', () => {
    expect(sql).toMatch(/execute function fn_set_actualizado_en\(\)/)
    expect(sql).not.toMatch(/create (or replace )?function/)
  })

  it('es segura de re-aplicar', () => {
    expect(sql).toMatch(/drop trigger if exists trg_set_actualizado_en_citas on citas/)
  })
})
