import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_MIGRACIONES = join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations')
const sql = readFileSync(join(RUTA_MIGRACIONES, '058_sirso_incidentes_seguridad.sql'), 'utf8')

describe('058 - incidentes_seguridad: solo owner/super_admin, nunca visible a otros roles', () => {
  it('los 4 estados y las 4 severidades del documento estan presentes', () => {
    const bloque = sql.match(/create table if not exists incidentes_seguridad[\s\S]*?\);/)[0]
    for (const estado of ['detectado', 'en_investigacion', 'contenido', 'resuelto', 'cerrado']) {
      expect(bloque, estado).toMatch(new RegExp(`'${estado}'`))
    }
    for (const severidad of ['baja', 'media', 'alta', 'critica']) {
      expect(bloque, severidad).toMatch(new RegExp(`'${severidad}'`))
    }
  })

  it('select/insert/update exigen owner de la clinica o super_admin para plataforma - ningun otro rol pasa', () => {
    for (const politica of ['incidentes_select', 'incidentes_insert', 'incidentes_update']) {
      const bloque = sql.match(new RegExp(`create policy ${politica}[\\s\\S]*?;\\n`))[0]
      expect(bloque, politica).toMatch(/auth_rol\(\) = 'owner'/)
      expect(bloque, politica).toMatch(/es_super_admin/)
    }
  })

  it('reutiliza fn_auditoria() existente, no crea una funcion nueva', () => {
    expect(sql).toMatch(/execute function fn_auditoria\(\)/)
    expect(sql).not.toMatch(/create (or replace )?function fn_auditoria/)
  })
})
