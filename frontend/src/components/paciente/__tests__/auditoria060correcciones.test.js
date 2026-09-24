import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_MIGRACIONES = join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations')
const sql = readFileSync(join(RUTA_MIGRACIONES, '060_sirso_incidentes_superadmin_y_realtime_sesiones.sql'), 'utf8')

describe('060 - super_admin ve incidentes de cualquier clinica, no solo los de plataforma', () => {
  it('la politica ya no exige clinica_id is null para la rama de super_admin', () => {
    const bloque = sql.match(/create policy incidentes_select[\s\S]*?;\n/)[0]
    // La rama del owner sigue exigiendo su propia clinica.
    expect(bloque).toMatch(/clinica_id is not null and auth_rol\(\) = 'owner' and clinica_id = auth_clinica_id\(\)/)
    // La rama de super_admin ya NO debe tener "clinica_id is null" como condicion.
    const ramaSuperAdmin = bloque.split(' or ')[1]
    expect(ramaSuperAdmin).not.toMatch(/clinica_id is null/)
    expect(ramaSuperAdmin).toMatch(/es_super_admin/)
  })

  it('solo se corrige select - insert y update de la migracion 058 no se tocan en este archivo', () => {
    expect(sql).not.toMatch(/create policy incidentes_insert/)
    expect(sql).not.toMatch(/create policy incidentes_update/)
  })
})

describe('060 - Realtime en sesiones_usuario para cierre remoto casi inmediato', () => {
  it('agrega la tabla a la publicacion supabase_realtime', () => {
    expect(sql).toMatch(/alter publication supabase_realtime add table sesiones_usuario/)
  })

  it('no crea ninguna tabla ni politica nueva para esto - reutiliza el RLS ya existente de 057', () => {
    expect(sql).not.toMatch(/create table/)
    expect(sql).not.toMatch(/create policy.*sesiones_usuario/)
  })
})
