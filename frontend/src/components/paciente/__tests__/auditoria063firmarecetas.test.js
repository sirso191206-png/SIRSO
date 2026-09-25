import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_MIGRACIONES = join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations')
const sql = readFileSync(join(RUTA_MIGRACIONES, '063_sirso_firma_recetas.sql'), 'utf8')

describe('063 - firma en recetas: dentista guardada, paciente por receta', () => {
  it('agrega firma_png a usuarios (se configura una sola vez)', () => {
    expect(sql).toMatch(/alter table usuarios add column if not exists firma_png text/)
  })

  it('agrega firma_dentista_png y firma_paciente_png a recetas, como snapshot/captura por receta', () => {
    expect(sql).toMatch(/alter table recetas add column if not exists firma_dentista_png text/)
    expect(sql).toMatch(/alter table recetas add column if not exists firma_paciente_png text/)
  })

  it('no afirma que sea una firma electronica con validez legal formal', () => {
    const minusculas = sql.toLowerCase()
    expect(minusculas).toMatch(/no es una firma electrónica/)
    expect(minusculas).toMatch(/validez/)
    expect(minusculas).toMatch(/legal formal/)
  })

  it('no crea ninguna tabla ni politica nueva - son solo columnas sobre tablas existentes', () => {
    expect(sql).not.toMatch(/create table/)
    expect(sql).not.toMatch(/create policy/)
  })
})
