import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_MIGRACIONES = join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations')
const sql = readFileSync(join(RUTA_MIGRACIONES, '056_sirso_correccion_cookies_localstorage.sql'), 'utf8')

describe('056 - corrige el titulo sin editar la migracion 052 ya escrita', () => {
  it('desactiva la version anterior activa de tipo cookies antes de insertar la nueva', () => {
    expect(sql).toMatch(/update legal_documents\s*\nset activo = false\s*\nwhere tipo = 'cookies'/)
  })

  it('el nuevo titulo diferencia explicitamente localStorage de cookies HTTP', () => {
    const bloque = sql.match(/insert into legal_documents[\s\S]*?;/)[0]
    expect(bloque).toMatch(/'Cookies y Tecnologías de Almacenamiento'/)
    expect(bloque).toMatch(/no utiliza cookies HTTP tradicionales/)
    expect(bloque).toMatch(/localStorage/)
  })

  it('la nueva version se marca activa, versión 0.2-borrador (distinta de la 0.1 de la migración 052)', () => {
    const bloque = sql.match(/insert into legal_documents[\s\S]*?;/)[0]
    expect(bloque).toMatch(/'0\.2-borrador'/)
    expect(bloque).toMatch(/now\(\), now\(\), true\s*\)/)
  })

  it('sigue marcada como borrador pendiente de revision legal', () => {
    expect(sql).toMatch(/BORRADOR — pendiente de revisión legal profesional/)
  })
})
