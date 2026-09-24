import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_MIGRACIONES = join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations')
const sql = readFileSync(join(RUTA_MIGRACIONES, '049_sirso_modulo_legal_fase1.sql'), 'utf8')

describe('049 - legal_documents: version publica y por clinica', () => {
  it('clinica_id es nullable - null significa documento de plataforma SIRO', () => {
    const bloque = sql.match(/create table if not exists legal_documents[\s\S]*?\);/)[0]
    expect(bloque).toMatch(/clinica_id uuid references clinicas\(id\)/)
    expect(bloque).not.toMatch(/clinica_id uuid not null/)
  })

  it('solo puede existir UN documento activo por tipo y clinica a la vez (indice unico)', () => {
    expect(sql).toMatch(/create unique index idx_legal_documents_un_activo_por_tipo/)
    expect(sql).toMatch(/where activo = true/)
  })

  it('los documentos activos son legibles por anon (deben verse antes de iniciar sesion)', () => {
    const bloque = sql.match(/create policy legal_documents_select_publico[\s\S]*?;\n/)[0]
    expect(bloque).toMatch(/using \(activo = true\)/)
    expect(sql).toMatch(/grant select on legal_documents to anon/)
  })

  it('un owner solo puede insertar/actualizar documentos de SU PROPIA clinica, nunca de plataforma (clinica_id null)', () => {
    const insert = sql.match(/create policy legal_documents_insert[\s\S]*?;\n/)[0]
    expect(insert).toMatch(/clinica_id = auth_clinica_id\(\)/)
    expect(insert).not.toMatch(/clinica_id is null/)
  })
})

describe('049 - legal_acceptances: evidencia inmutable', () => {
  it('exige usuario_id O paciente_id (nunca ambos vacios)', () => {
    const bloque = sql.match(/create table if not exists legal_acceptances[\s\S]*?\);/)[0]
    expect(bloque).toMatch(/check \(usuario_id is not null or paciente_id is not null\)/)
  })

  it('cada quien solo ve su propia aceptacion, mas el owner de la clinica', () => {
    expect(sql).toMatch(/create policy legal_acceptances_select_propia[\s\S]*?usuario_id = auth\.uid\(\)/)
    expect(sql).toMatch(/create policy legal_acceptances_select_clinica[\s\S]*?auth_rol\(\) = 'owner'/)
  })

  it('el insert exige que usuario_id sea el propio - nadie registra aceptaciones a nombre de otro', () => {
    const bloque = sql.match(/create policy legal_acceptances_insert[\s\S]*?;\n/)[0]
    expect(bloque).toMatch(/usuario_id = auth\.uid\(\)/)
  })

  it('no existe NINGUNA politica de update ni delete - una aceptacion nunca se modifica ni se borra', () => {
    expect(sql).not.toMatch(/create policy legal_acceptances_update/)
    expect(sql).not.toMatch(/create policy legal_acceptances_delete/)
  })
})

describe('049 - auditoria: extension para eventos de lectura, sin tocar lo existente', () => {
  it('agrega clinica_id, ip, user_agent como columnas nuevas y NULLABLE (compatibilidad con filas existentes)', () => {
    expect(sql).toMatch(/alter table auditoria add column if not exists clinica_id uuid/)
    expect(sql).toMatch(/alter table auditoria add column if not exists ip text/)
    expect(sql).toMatch(/alter table auditoria add column if not exists user_agent text/)
  })

  it('usuario_id obtiene default auth.uid() para el nuevo camino de insercion directa', () => {
    expect(sql).toMatch(/alter table auditoria alter column usuario_id set default auth\.uid\(\)/)
  })

  it('la nueva politica de insert exige que usuario_id sea el propio - no se puede registrar a nombre de otro', () => {
    const bloque = sql.match(/create policy auditoria_insert_eventos[\s\S]*?;\n/)[0]
    expect(bloque).toMatch(/usuario_id = auth\.uid\(\)/)
  })

  it('no se toca ni se redefine fn_auditoria() ni ningun trigger existente', () => {
    expect(sql).not.toMatch(/create or replace function fn_auditoria/)
    expect(sql).not.toMatch(/drop trigger/)
  })

  it('no se crea una tabla de auditoria paralela - se reutiliza la existente', () => {
    expect(sql).not.toMatch(/create table.*auditoria/)
  })
})
