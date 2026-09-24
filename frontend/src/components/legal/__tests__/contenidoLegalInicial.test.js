import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_MIGRACIONES = join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations')
const sql = readFileSync(join(RUTA_MIGRACIONES, '051_sirso_contenido_legal_inicial.sql'), 'utf8')

describe('051 - contenido legal inicial: siempre marcado como borrador', () => {
  it('los 3 documentos se insertan con clinica_id null (documento de plataforma, no de una clinica)', () => {
    const bloque = sql.match(/insert into legal_documents[\s\S]*?;/)[0]
    const coincidencias = bloque.match(/\(\s*null, '/g) ?? []
    expect(coincidencias.length).toBe(3)
  })

  it('cada uno de los 3 documentos incluye la advertencia de borrador pendiente de revision legal', () => {
    const advertencias = sql.match(/BORRADOR — pendiente de revisión legal profesional/g) ?? []
    expect(advertencias.length).toBe(3)
  })

  it('usa variables {{RESPONSABLE}}/{{DOMICILIO}}/{{CORREO_PRIVACIDAD}} en vez de datos inventados', () => {
    expect(sql).toMatch(/\{\{RESPONSABLE\}\}/)
    expect(sql).toMatch(/\{\{DOMICILIO\}\}/)
    expect(sql).toMatch(/\{\{CORREO_PRIVACIDAD\}\}/)
  })

  it('los tres tipos correctos estan presentes: privacy_simplified, privacy_integral, terms', () => {
    expect(sql).toMatch(/'privacy_simplified'/)
    expect(sql).toMatch(/'privacy_integral'/)
    expect(sql).toMatch(/'terms'/)
  })

  it('los puntos genuinamente indefinidos (jurisdiccion, modelo de pagos, SLA) quedan marcados TODO LEGAL, no inventados', () => {
    expect(sql).toMatch(/TODO LEGAL: definir jurisdicción/)
    expect(sql).toMatch(/TODO LEGAL: definir el modelo comercial/)
  })

  it('nunca afirma cumplimiento absoluto ("100% seguro", "100% legal", "cumple NOM-004")', () => {
    expect(sql.toLowerCase()).not.toMatch(/100% segur/)
    expect(sql.toLowerCase()).not.toMatch(/100% legal/)
    expect(sql).not.toMatch(/cumple(\scon)? (la )?nom-004/i)
  })
})
