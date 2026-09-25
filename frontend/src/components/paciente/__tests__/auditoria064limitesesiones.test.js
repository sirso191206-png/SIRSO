import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_MIGRACIONES = join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations')
const sql = readFileSync(join(RUTA_MIGRACIONES, '064_sirso_limite_sesiones_por_plan.sql'), 'utf8')

describe('064 - una sola fuente de verdad para el limite por plan', () => {
  it('fn_limite_sesiones_por_plan cubre los 3 planes reales (basico, profesional, clinica)', () => {
    const funcion = sql.match(/create or replace function fn_limite_sesiones_por_plan[\s\S]*?\$\$;/)[0]
    expect(funcion).toMatch(/when 'basico' then 1/)
    expect(funcion).toMatch(/when 'profesional' then 3/)
    expect(funcion).toMatch(/when 'clinica' then 10/)
  })

  it('el trigger reutiliza fn_limite_sesiones_por_plan en vez de repetir los numeros', () => {
    const trigger = sql.match(/create or replace function fn_aplicar_limite_sesiones[\s\S]*?\$\$;/)[0]
    expect(trigger).toMatch(/fn_limite_sesiones_por_plan\(v_plan\)/)
    expect(trigger).not.toMatch(/when 'basico' then 1/)
  })

  it('mi_limite_sesiones tambien reutiliza la misma funcion central, no duplica la tabla de limites', () => {
    const rpc = sql.match(/create or replace function mi_limite_sesiones[\s\S]*?\$\$;/)[0]
    expect(rpc).toMatch(/fn_limite_sesiones_por_plan\(c\.plan\)/)
  })
})

describe('064 - mi_limite_sesiones: solo revela el limite del propio usuario', () => {
  it('resuelve la clinica via auth.uid(), no recibe un id externo como parametro', () => {
    const rpc = sql.match(/create or replace function mi_limite_sesiones[\s\S]*?\$\$;/)[0]
    expect(rpc).toMatch(/where u\.id = auth\.uid\(\)/)
    expect(sql).not.toMatch(/mi_limite_sesiones\(p_usuario_id/)
  })

  it('se otorga a authenticated para poder llamarse desde el frontend', () => {
    expect(sql).toMatch(/grant execute on function mi_limite_sesiones\(\) to authenticated/)
  })
})

describe('064 - al exceder el limite, cierra las sesiones mas antiguas primero', () => {
  it('el trigger corre en BEFORE INSERT sobre sesiones_usuario', () => {
    expect(sql).toMatch(/create trigger trg_aplicar_limite_sesiones\s*\nbefore insert on sesiones_usuario/)
  })

  it('ordena por iniciada_en ascendente (la mas antigua primero) al elegir cuales cerrar', () => {
    const trigger = sql.match(/create or replace function fn_aplicar_limite_sesiones[\s\S]*?\$\$;/)[0]
    expect(trigger).toMatch(/order by iniciada_en asc/)
  })

  it('nunca bloquea el nuevo inicio de sesion - solo cierra sesiones existentes, siempre retorna new', () => {
    const trigger = sql.match(/create or replace function fn_aplicar_limite_sesiones[\s\S]*?\$\$;/)[0]
    expect(trigger).not.toMatch(/raise exception/)
    expect(trigger).toMatch(/return new;/)
  })
})
