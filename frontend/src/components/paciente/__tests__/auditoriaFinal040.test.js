import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_MIGRACIONES = join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations')
const sql038 = readFileSync(join(RUTA_MIGRACIONES, '038_sirso_permisos_por_asignacion.sql'), 'utf8')
const sql040 = readFileSync(join(RUTA_MIGRACIONES, '040_sirso_auditoria_final_seguridad.sql'), 'utf8')

describe('Hallazgo 1 — v_tratamientos_recepcion realmente funciona para recepción', () => {
  it('la definición original (038) tenía security_invoker=true — confirma el bug antes de la corrección', () => {
    const vistaOriginal = sql038.match(/create or replace view v_tratamientos_recepcion[\s\S]*?from tratamientos;/)[0]
    expect(vistaOriginal).toMatch(/security_invoker = true/)
  })

  it('tratamientos_select (038, sin tocar) NO incluye a recepción — confirma por qué security_invoker=true rompía la vista', () => {
    const politica = sql038.match(/create policy tratamientos_select[\s\S]*?;\n/)[0]
    expect(politica).not.toMatch(/recepcion/)
  })

  it('040 reescribe la vista SIN security_invoker=true — seguridad propia, desacoplada de tratamientos_select', () => {
    const vistaNueva = sql040.match(/create view v_tratamientos_recepcion[\s\S]*?;\n/)[0]
    expect(vistaNueva).not.toMatch(/security_invoker/)
  })

  it('la vista nueva exige clinica_id = auth_clinica_id() Y auth_rol() in (owner, recepcion) en su propio WHERE', () => {
    const vistaNueva = sql040.match(/create view v_tratamientos_recepcion[\s\S]*?;\n\n/)[0]
    expect(vistaNueva).toMatch(/p\.clinica_id = auth_clinica_id\(\)/)
    expect(vistaNueva).toMatch(/auth_rol\(\) in \('owner', 'recepcion'\)/)
  })

  it('la vista nueva jamás selecciona "descripcion" — ni siquiera enmascarada', () => {
    const vistaNueva = sql040.match(/create view v_tratamientos_recepcion[\s\S]*?;\n\n/)[0]
    expect(vistaNueva).not.toMatch(/descripcion/)
  })

  it('la vista nueva sí expone costo y estado (el propósito original)', () => {
    const vistaNueva = sql040.match(/create view v_tratamientos_recepcion[\s\S]*?;\n\n/)[0]
    expect(vistaNueva).toMatch(/\bcosto\b/)
    expect(vistaNueva).toMatch(/\bestado\b/)
  })
})

describe('Hallazgo 2 — columna archivado_en faltante', () => {
  it('v_pacientes_seguro (038) selecciona archivado_en sin que exista ningún ALTER TABLE que la declare en todo el historial', () => {
    expect(sql038).toMatch(/archivado_en/)
  })

  it('040 agrega la columna que faltaba', () => {
    expect(sql040).toMatch(/alter table pacientes add column if not exists archivado_en timestamptz/)
  })
})

describe('Hallazgo 3 — restricción de columnas en pacientes UPDATE (lista blanca)', () => {
  it('existe el trigger, aplicado en BEFORE UPDATE', () => {
    expect(sql040).toMatch(/create or replace function fn_restringir_columnas_pacientes_update/)
    expect(sql040).toMatch(/before update on pacientes/)
  })

  it('owner y dentista quedan exentos de la restricción por columna (return new sin comparar)', () => {
    const funcion = sql040.match(/create or replace function fn_restringir_columnas_pacientes_update[\s\S]*?\$\$;/)[0]
    expect(funcion).toMatch(/if auth_rol\(\) in \('owner', 'dentista'\) then\s*\n\s*return new;/)
  })

  it('dentista_responsable_id NO está en la lista blanca — recepción/asistente no pueden tocarla ni por esta vía (capa extra sobre el trigger que ya lo bloquea)', () => {
    const funcion = sql040.match(/v_columnas_administrativas text\[\] := array\[[\s\S]*?\];/)[0]
    expect(funcion).not.toMatch(/dentista_responsable_id/)
  })

  it('columnas clínicas/sensibles NO están en la lista blanca: notas_generales, contacto_emergencia, seguro_medico, tutor_legal, curp', () => {
    const lista = sql040.match(/v_columnas_administrativas text\[\] := array\[[\s\S]*?\];/)[0]
    for (const columna of ['notas_generales', 'contacto_emergencia', 'seguro_medico', 'tutor_legal', 'curp']) {
      expect(lista, `${columna} no debería estar en la lista blanca`).not.toContain(`'${columna}'`)
    }
  })

  it('columnas administrativas SÍ están en la lista blanca: nombre, teléfono, domicilio, correo', () => {
    const lista = sql040.match(/v_columnas_administrativas text\[\] := array\[[\s\S]*?\];/)[0]
    for (const columna of ['nombre_completo', 'telefono', 'correo', 'calle', 'colonia', 'codigo_postal']) {
      expect(lista, `${columna} debería estar en la lista blanca`).toContain(`'${columna}'`)
    }
  })

  it('la comparación usa to_jsonb + resta de claves (lista blanca genérica) — cualquier columna futura queda protegida por defecto', () => {
    const funcion = sql040.match(/create or replace function fn_restringir_columnas_pacientes_update[\s\S]*?\$\$;/)[0]
    expect(funcion).toMatch(/to_jsonb\(old\)/)
    expect(funcion).toMatch(/to_jsonb\(new\)/)
    expect(funcion).toMatch(/is distinct from/)
  })
})
