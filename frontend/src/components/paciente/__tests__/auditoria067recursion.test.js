import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_MIGRACIONES = join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations')
const sql = readFileSync(join(RUTA_MIGRACIONES, '067_sirso_fix_recursion_sucursales.sql'), 'utf8')

describe('067 - captura el fix de recursion que solo vivia en produccion', () => {
  it('auth_sucursal_permitida ya no consulta sucursal_usuarios directo con el id de sucursal sin pasar por sucursales primero (la causa de la recursion)', () => {
    const funcion = sql.match(/create or replace function auth_sucursal_permitida[\s\S]*?\$\$;/)[0]
    expect(funcion).toMatch(/from sucursales s where s\.id = p_sucursal_id/)
  })

  it('sucursales_select usa la funcion en vez de una subconsulta directa contra sucursal_usuarios (rompe el ciclo)', () => {
    const politica = sql.match(/create policy sucursales_select[\s\S]*?;\n/)[0]
    expect(politica).toMatch(/using \(auth_sucursal_permitida\(id\)\)/)
  })

  it('sucursal_usuarios_select deja ver la propia fila sin pasar por auth_sucursal_permitida primero (evita el otro lado del ciclo)', () => {
    const politica = sql.match(/create policy sucursal_usuarios_select[\s\S]*?;\n/)[0]
    expect(politica).toMatch(/usuario_id = auth\.uid\(\) or auth_sucursal_permitida\(sucursal_id\)/)
  })

  it('ambas policies se recrean con drop if exists - segura de re-aplicar sobre una base que ya tenia el fix en vivo', () => {
    expect(sql).toMatch(/drop policy if exists sucursales_select on sucursales/)
    expect(sql).toMatch(/drop policy if exists sucursal_usuarios_select on sucursal_usuarios/)
  })
})
