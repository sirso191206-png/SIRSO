import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_MIGRACIONES = join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations')
const sql = readFileSync(join(RUTA_MIGRACIONES, '061_sirso_superadmin_administra_incidentes.sql'), 'utf8')

describe('061 - super_admin administra (UPDATE) incidentes de cualquier clinica', () => {
  it('la rama de super_admin en incidentes_update ya no exige clinica_id is null', () => {
    const bloque = sql.match(/create policy incidentes_update[\s\S]*?;\n/)[0]
    const ramaSuperAdmin = bloque.split(' or ')[1]
    expect(ramaSuperAdmin).not.toMatch(/clinica_id is null/)
    expect(ramaSuperAdmin).toMatch(/es_super_admin/)
  })

  it('el owner sigue restringido a su propia clinica', () => {
    const bloque = sql.match(/create policy incidentes_update[\s\S]*?;\n/)[0]
    expect(bloque).toMatch(/clinica_id is not null and auth_rol\(\) = 'owner' and clinica_id = auth_clinica_id\(\)/)
  })
})
