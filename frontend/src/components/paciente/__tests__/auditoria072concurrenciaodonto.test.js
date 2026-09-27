import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_MIGRACIONES = join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations')
const sql = readFileSync(join(RUTA_MIGRACIONES, '072_sirso_concurrencia_odontograma_periodontograma.sql'), 'utf8')

describe('072 - reutiliza fn_set_actualizado_en en las 4 tablas, sin duplicar logica', () => {
  it('no define ninguna funcion nueva', () => {
    expect(sql).not.toMatch(/create (or replace )?function/)
  })

  it('las 4 tablas tienen su trigger antes de update, apuntando a fn_set_actualizado_en', () => {
    for (const tabla of ['odontograma_piezas', 'odontograma_caras', 'periodontograma_piezas', 'periodontograma_sitios']) {
      const patronTrigger = new RegExp(`create trigger trg_set_actualizado_en_${tabla}\\s*\\nbefore update on ${tabla}\\s*\\nfor each row execute function fn_set_actualizado_en\\(\\);`)
      expect(sql, tabla).toMatch(patronTrigger)
    }
  })

  it('las 4 son seguras de re-aplicar (drop if exists antes de cada create)', () => {
    for (const tabla of ['odontograma_piezas', 'odontograma_caras', 'periodontograma_piezas', 'periodontograma_sitios']) {
      expect(sql, tabla).toMatch(new RegExp(`drop trigger if exists trg_set_actualizado_en_${tabla} on ${tabla}`))
    }
  })
})
