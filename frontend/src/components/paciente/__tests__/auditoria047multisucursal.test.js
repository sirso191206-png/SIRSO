import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_MIGRACIONES = join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations')
const sql = readFileSync(join(RUTA_MIGRACIONES, '047_sirso_multisucursal_fundacion.sql'), 'utf8')

describe('047 - estructura fisica: sucursales -> consultorios -> sillones', () => {
  it('las 4 tablas existen: sucursales, consultorios, sillones, sucursal_usuarios', () => {
    for (const tabla of ['sucursales', 'consultorios', 'sillones', 'sucursal_usuarios']) {
      expect(sql, tabla).toMatch(new RegExp(`create table if not exists ${tabla}`))
    }
  })

  it('sucursales pertenece a una clinica_id (FK), no es global', () => {
    const bloque = sql.match(/create table if not exists sucursales[\s\S]*?\);/)[0]
    expect(bloque).toMatch(/clinica_id uuid not null references clinicas\(id\)/)
  })

  it('consultorios pertenece a una sucursal_id, sillones a un consultorio_id (jerarquia correcta)', () => {
    const consultorios = sql.match(/create table if not exists consultorios[\s\S]*?\);/)[0]
    expect(consultorios).toMatch(/sucursal_id uuid not null references sucursales\(id\)/)
    const sillones = sql.match(/create table if not exists sillones[\s\S]*?\);/)[0]
    expect(sillones).toMatch(/consultorio_id uuid not null references consultorios\(id\)/)
  })

  it('sucursal_usuarios valida con trigger que el usuario sea de la MISMA clinica que la sucursal', () => {
    expect(sql).toMatch(/create or replace function fn_validar_sucursal_usuarios/)
    expect(sql).toMatch(/v_clinica_sucursal is distinct from v_clinica_usuario/)
    expect(sql).toMatch(/create trigger trg_validar_sucursal_usuarios/)
  })
})

describe('047 - auth_sucursal_permitida(): unica fuente de verdad, compatible hacia atras', () => {
  it('devuelve true cuando el sucursal_id es NULL - sin restriccion para quien no usa multi-sucursal', () => {
    const funcion = sql.match(/create or replace function auth_sucursal_permitida[\s\S]*?\$\$;/)[0]
    expect(funcion).toMatch(/p_sucursal_id is null/)
  })

  it('owner siempre pasa, sin necesitar fila en sucursal_usuarios', () => {
    const funcion = sql.match(/create or replace function auth_sucursal_permitida[\s\S]*?\$\$;/)[0]
    expect(funcion).toMatch(/auth_rol\(\) = 'owner'/)
  })

  it('para los demas roles, exige una fila activa en sucursal_usuarios', () => {
    const funcion = sql.match(/create or replace function auth_sucursal_permitida[\s\S]*?\$\$;/)[0]
    expect(funcion).toMatch(/from sucursal_usuarios su/)
    expect(funcion).toMatch(/su\.activo/)
  })
})

describe('047 - RLS de las tablas nuevas', () => {
  it('las 4 tablas tienen RLS habilitado', () => {
    for (const tabla of ['sucursales', 'consultorios', 'sillones', 'sucursal_usuarios']) {
      expect(sql, tabla).toMatch(new RegExp(`alter table ${tabla} enable row level security`))
    }
  })

  it('solo owner puede crear/editar/borrar sucursales (sucursales_write)', () => {
    const bloque = sql.match(/create policy sucursales_write[\s\S]*?;\n/)[0]
    expect(bloque).toMatch(/auth_rol\(\) = 'owner'/)
  })

  it('sucursales_select respeta clinica_id y asignacion (owner ve todas, el resto solo las suyas)', () => {
    const bloque = sql.match(/create policy sucursales_select[\s\S]*?;\n/)[0]
    expect(bloque).toMatch(/clinica_id = auth_clinica_id\(\)/)
    expect(bloque).toMatch(/auth_rol\(\) = 'owner'/)
  })
})

describe('047 - citas y pagos: compatibilidad hacia atras real', () => {
  it('sucursal_id, consultorio_id, sillon_id se agregan a CITAS como NULLABLE', () => {
    const lineaCitas = sql.split('\n').find((l) => l.includes('alter table citas add column if not exists sucursal_id'))
    expect(lineaCitas).not.toMatch(/not null/)
    expect(lineaCitas).toMatch(/uuid references sucursales\(id\)/)
  })

  it('las politicas de citas/pagos reutilizan auth_sucursal_permitida, no inventan una segunda logica', () => {
    for (const politica of ['citas_select', 'citas_update_dentista', 'citas_write', 'pagos_select', 'pagos_write']) {
      const bloque = sql.match(new RegExp(`create policy ${politica}[\\s\\S]*?;\\n`))[0]
      expect(bloque, politica).toMatch(/auth_sucursal_permitida\(sucursal_id\)/)
    }
  })

  it('citas_select conserva exactamente su logica de asignacion de paciente previa', () => {
    const bloque = sql.match(/create policy citas_select[\s\S]*?;\n/)[0]
    expect(bloque).toMatch(/auth_paciente_asignado\(paciente_id\)/)
  })

  it('conflicto de sillon: EXCLUDE using gist, mismo mecanismo que ya protege dentista_id', () => {
    expect(sql).toMatch(/alter table citas add constraint chk_sillon_no_traslape/)
    expect(sql).toMatch(/exclude using gist \(\s*\n\s*sillon_id with =/)
    expect(sql).toMatch(/sillon_id is not null/)
  })

  it('trigger de defensa: sucursal_id debe ser de la misma clinica que el paciente, en citas Y pagos', () => {
    expect(sql).toMatch(/create trigger trg_validar_sucursal_citas/)
    expect(sql).toMatch(/create trigger trg_validar_sucursal_pagos/)
    const funcion = sql.match(/create or replace function fn_validar_sucursal_misma_clinica[\s\S]*?\$\$;/)[0]
    expect(funcion).toMatch(/if new\.sucursal_id is null then\s*\n\s*return new;/)
  })
})

describe('047 - no toca nada clinico (alcance deliberadamente limitado)', () => {
  it('ninguna tabla clinica recibe DDL real (alter table / policy on) en esta migracion — solo se mencionan en el comentario de contexto', () => {
    for (const tabla of [
      'notas_clinicas', 'tratamientos', 'recetas', 'documentos_clinicos',
      'odontograma_piezas', 'odontograma_caras', 'periodontograma_piezas',
      'periodontograma_sitios', 'fotografias', 'signos_vitales',
    ]) {
      expect(sql, tabla).not.toMatch(new RegExp(`alter table ${tabla}\\b`))
      expect(sql, tabla).not.toMatch(new RegExp(`\\bon ${tabla}\\b`))
    }
  })

  it('pacientes no recibe ninguna columna nueva', () => {
    expect(sql).not.toMatch(/alter table pacientes/)
  })
})
