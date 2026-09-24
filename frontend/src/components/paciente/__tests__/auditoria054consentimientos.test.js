import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_MIGRACIONES = join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations')
const sql = readFileSync(join(RUTA_MIGRACIONES, '054_sirso_consentimientos_estado.sql'), 'utf8')

describe('054 - campos nuevos genuinamente ausentes antes', () => {
  it('agrega indicaciones, contraindicaciones, observaciones y tratamiento_id', () => {
    expect(sql).toMatch(/add column if not exists indicaciones text/)
    expect(sql).toMatch(/add column if not exists contraindicaciones text/)
    expect(sql).toMatch(/add column if not exists observaciones text/)
    expect(sql).toMatch(/add column if not exists tratamiento_id uuid references tratamientos\(id\)/)
  })

  it('estado solo permite firmado/revocado/cancelado - no borrador/pendiente que la UI no puede producir todavia', () => {
    const bloque = sql.match(/add column if not exists estado text[\s\S]*?;/)[0]
    expect(bloque).toMatch(/check \(estado in \('firmado', 'revocado', 'cancelado'\)\)/)
    expect(bloque).not.toMatch(/borrador/)
    expect(bloque).not.toMatch(/pendiente/)
  })
})

describe('054 - inmutabilidad extendida, no reemplazada a medias', () => {
  it('conserva TODOS los campos que ya protegia la migracion 036 en su lista de bloqueo', () => {
    const funcion = sql.match(/create or replace function fn_solo_revocacion_consentimiento[\s\S]*?\$\$;/)[0]
    for (const campo of [
      'procedimiento', 'riesgos', 'beneficios', 'alternativas', 'diagnostico', 'pronostico',
      'molestias_efectos_secundarios', 'motivo_eleccion', 'grado_urgencia', 'lugar',
      'fecha_procedimiento', 'firma_paciente_png', 'firma_medico_png', 'paciente_id', 'dentista_id', 'creado_en'
    ]) {
      expect(funcion, campo).toMatch(new RegExp(`new\\.${campo} is distinct from old\\.${campo}`))
    }
  })

  it('agrega los 4 campos nuevos a esa misma lista de bloqueo', () => {
    const funcion = sql.match(/create or replace function fn_solo_revocacion_consentimiento[\s\S]*?\$\$;/)[0]
    for (const campo of ['indicaciones', 'contraindicaciones', 'observaciones', 'tratamiento_id']) {
      expect(funcion, campo).toMatch(new RegExp(`new\\.${campo} is distinct from old\\.${campo}`))
    }
  })

  it('sincroniza estado a revocado automaticamente cuando revocado_en pasa de null a un valor', () => {
    const funcion = sql.match(/create or replace function fn_solo_revocacion_consentimiento[\s\S]*?\$\$;/)[0]
    expect(funcion).toMatch(/if new\.revocado_en is not null and old\.revocado_en is null then/)
    expect(funcion).toMatch(/new\.estado := 'revocado'/)
  })
})
