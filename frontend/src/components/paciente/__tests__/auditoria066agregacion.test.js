import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_MIGRACIONES = join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations')
const sql = readFileSync(join(RUTA_MIGRACIONES, '066_sirso_agregacion_tratamientos_top.sql'), 'utf8')

describe('066 - agregacion en SQL, no traer toda la tabla al navegador', () => {
  it('agrupa y ordena en la propia base de datos (group by, order by, limit)', () => {
    const funcion = sql.match(/create or replace function fn_tratamientos_mas_realizados[\s\S]*?\$\$;/)[0]
    expect(funcion).toMatch(/group by descripcion/)
    expect(funcion).toMatch(/order by cantidad desc/)
    expect(funcion).toMatch(/limit p_limite/)
  })

  it('es security invoker (hereda RLS real), no security definer', () => {
    const funcion = sql.match(/create or replace function fn_tratamientos_mas_realizados[\s\S]*?\$\$;/)[0]
    expect(funcion).toMatch(/security invoker/)
    expect(funcion).not.toMatch(/security definer/)
  })

  it('se otorga a authenticated para poder llamarse desde el frontend', () => {
    expect(sql).toMatch(/grant execute on function fn_tratamientos_mas_realizados\(integer\) to authenticated/)
  })
})
