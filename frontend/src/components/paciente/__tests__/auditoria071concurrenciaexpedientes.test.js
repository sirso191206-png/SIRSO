import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_MIGRACIONES = join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations')
const sql = readFileSync(join(RUTA_MIGRACIONES, '071_sirso_concurrencia_expedientes.sql'), 'utf8')

describe('071 - reutiliza fn_set_actualizado_en (069), no duplica la funcion', () => {
  it('el trigger apunta a fn_set_actualizado_en, sin definir una funcion nueva', () => {
    expect(sql).toMatch(/execute function fn_set_actualizado_en\(\)/)
    expect(sql).not.toMatch(/create (or replace )?function/)
  })

  it('corre en BEFORE UPDATE sobre expedientes', () => {
    expect(sql).toMatch(/create trigger trg_set_actualizado_en_expedientes\s*\nbefore update on expedientes/)
  })

  it('es segura de re-aplicar (drop if exists antes de crear)', () => {
    expect(sql).toMatch(/drop trigger if exists trg_set_actualizado_en_expedientes on expedientes/)
  })
})
