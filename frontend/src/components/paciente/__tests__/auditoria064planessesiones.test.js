import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_MIGRACIONES = join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations')
const sql = readFileSync(join(RUTA_MIGRACIONES, '064_sirso_planes_catalogo_limite_sesiones.sql'), 'utf8')

describe('064 - planes_catalogo: la fuente central que faltaba', () => {
  it('crea la tabla con los 4 planes reales (basico, profesional, clinica, empresarial)', () => {
    expect(sql).toMatch(/create table if not exists planes_catalogo/)
    for (const plan of ['basico', 'profesional', 'clinica', 'empresarial']) {
      expect(sql, plan).toMatch(new RegExp(`'${plan}',`))
    }
  })

  it('agrega empresarial al check constraint de clinicas.plan (faltaba desde el diagnostico original)', () => {
    expect(sql).toMatch(/check \(plan in \('basico', 'profesional', 'clinica', 'empresarial'\)\)/)
  })

  it('clinicas.plan tiene FK real hacia planes_catalogo', () => {
    expect(sql).toMatch(/alter table clinicas add constraint clinicas_plan_fkey foreign key \(plan\) references planes_catalogo\(plan\)/)
  })
})

describe('064 - no se toca la semantica existente de limite_usuarios/limite_pacientes', () => {
  it('no agrega ningun coalesce ni fallback al catalogo para limite_usuarios o limite_pacientes', () => {
    expect(sql).not.toMatch(/coalesce\([^)]*limite_usuarios/)
    expect(sql).not.toMatch(/coalesce\([^)]*limite_pacientes/)
  })

  it('limite_sesiones_override si tiene fallback al catalogo (via fn_limite_sesiones_de) - comportamiento nuevo, sin nada que preservar', () => {
    const funcion = sql.match(/create or replace function fn_limite_sesiones_de[\s\S]*?\$\$;/)[0]
    expect(funcion).toMatch(/coalesce\(c\.limite_sesiones_override, pc\.limite_sesiones_simultaneas\)/)
  })
})

describe('064 - super_admin exento, limite se aplica cerrando la sesion mas antigua', () => {
  it('fn_limite_sesiones_de devuelve null (sin limite) para super_admin', () => {
    const funcion = sql.match(/create or replace function fn_limite_sesiones_de[\s\S]*?\$\$;/)[0]
    expect(funcion).toMatch(/when u\.es_super_admin then null/)
  })

  it('el trigger corre en BEFORE INSERT sobre sesiones_usuario', () => {
    expect(sql).toMatch(/create trigger trg_limitar_sesiones_simultaneas\s*\nbefore insert on sesiones_usuario/)
  })

  it('cuando se alcanza el limite, cierra la sesion activa mas antigua (order by iniciada_en asc), no rechaza el nuevo login', () => {
    const funcion = sql.match(/create or replace function fn_limitar_sesiones_simultaneas[\s\S]*?\$\$;/)[0]
    expect(funcion).toMatch(/order by iniciada_en asc/)
    expect(funcion).toMatch(/update sesiones_usuario set finalizada_en = now\(\)/)
    expect(funcion).not.toMatch(/raise exception/)
  })
})
