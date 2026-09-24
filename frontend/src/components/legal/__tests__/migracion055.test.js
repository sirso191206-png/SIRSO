import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_MIGRACIONES = join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations')
const sql = readFileSync(join(RUTA_MIGRACIONES, '055_sirso_seguridad_retencion_acuerdo.sql'), 'utf8')

describe('055 - seguridad, retencion, acuerdo: borradores marcados, nada inventado', () => {
  it('los 3 documentos se insertan con clinica_id null y activo true', () => {
    const coincidencias = sql.match(/\(\s*null, '(security|retention|data_processing_agreement)'/g) ?? []
    expect(coincidencias).toHaveLength(3)
  })

  it('cada uno incluye la advertencia de borrador', () => {
    const advertencias = sql.match(/BORRADOR — pendiente de revisión legal profesional/g) ?? []
    expect(advertencias).toHaveLength(3)
  })

  it('retencion usa "Definir con asesoria juridica" en vez de inventar plazos legales', () => {
    const bloqueRetencion = sql.match(/'retention'[\s\S]*?now\(\), now\(\), true\s*\)/)[0]
    expect(bloqueRetencion).toMatch(/Definir con asesoría jurídica/)
    expect((bloqueRetencion.match(/Definir con asesoría jurídica/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })

  it('seguridad no afirma "100% seguro" ni garantiza ser invulnerable (solo lo niega explícitamente, que es lo correcto)', () => {
    const bloqueSeguridad = sql.match(/'security'[\s\S]*?now\(\), now\(\), true\s*\)/)[0]
    expect(bloqueSeguridad.toLowerCase()).not.toMatch(/100% segur/)
    expect(bloqueSeguridad.toLowerCase()).not.toMatch(/es invulnerable|garantiza(mos)? (ser|que es) invulnerable/)
    expect(bloqueSeguridad.toLowerCase()).toMatch(/no es.*invulnerable/)
  })
})
