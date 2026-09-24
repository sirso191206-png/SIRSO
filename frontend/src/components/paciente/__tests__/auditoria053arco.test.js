import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_MIGRACIONES = join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations')
const sql = readFileSync(join(RUTA_MIGRACIONES, '053_sirso_arco.sql'), 'utf8')

describe('053 - arco_solicitudes: acepta solicitudes de gente sin cuenta en SIRO', () => {
  it('usuario_id, paciente_id y clinica_id son NULLABLE', () => {
    const bloque = sql.match(/create table if not exists arco_solicitudes[\s\S]*?\);/)[0]
    expect(bloque).not.toMatch(/usuario_id uuid not null/)
    expect(bloque).not.toMatch(/paciente_id uuid not null/)
    expect(bloque).not.toMatch(/clinica_id uuid not null/)
  })

  it('exige nombre y correo del solicitante como texto libre (para poder responderle sin cuenta)', () => {
    const bloque = sql.match(/create table if not exists arco_solicitudes[\s\S]*?\);/)[0]
    expect(bloque).toMatch(/solicitante_nombre text not null/)
    expect(bloque).toMatch(/solicitante_correo text not null/)
  })

  it('los 4 tipos y los 7 estados del documento estan presentes', () => {
    const bloque = sql.match(/create table if not exists arco_solicitudes[\s\S]*?\);/)[0]
    for (const tipo of ['acceso', 'rectificacion', 'cancelacion', 'oposicion']) {
      expect(bloque, tipo).toMatch(new RegExp(`'${tipo}'`))
    }
    for (const estado of ['recibida', 'en_revision', 'requiere_informacion', 'aprobada', 'rechazada', 'atendida', 'cerrada']) {
      expect(bloque, estado).toMatch(new RegExp(`'${estado}'`))
    }
  })
})

describe('053 - RLS: publico puede crear, solo owner/super_admin ve y gestiona', () => {
  it('insert publico exige que usuario_id, si se manda, sea el propio — nadie finge ser otro usuario', () => {
    const bloque = sql.match(/create policy arco_insert_publico[\s\S]*?;\n/)[0]
    expect(bloque).toMatch(/usuario_id is null or usuario_id = auth\.uid\(\)/)
  })

  it('select: owner ve las de su clinica, el solicitante ve la suya, super_admin ve las de plataforma', () => {
    const bloque = sql.match(/create policy arco_select_clinica[\s\S]*?;\n/)[0]
    expect(bloque).toMatch(/auth_rol\(\) = 'owner'/)
    expect(bloque).toMatch(/usuario_id = auth\.uid\(\)/)
    expect(bloque).toMatch(/es_super_admin/)
  })

  it('anon solo recibe grant de select+insert, nunca update (la policy lo bloquearia igual, pero el grant tambien queda minimo)', () => {
    expect(sql).toMatch(/grant select, insert on arco_solicitudes to anon/)
    expect(sql).not.toMatch(/grant[^;]*update[^;]*to anon/)
  })
})

describe('053 - auditoria: reutiliza el trigger generico existente', () => {
  it('usa fn_auditoria() ya existente, no crea una funcion de auditoria nueva', () => {
    expect(sql).toMatch(/execute function fn_auditoria\(\)/)
    expect(sql).not.toMatch(/create (or replace )?function fn_auditoria/)
  })
})
