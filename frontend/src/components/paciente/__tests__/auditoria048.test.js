import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_MIGRACIONES = join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations')
const sql = readFileSync(join(RUTA_MIGRACIONES, '048_sirso_correcciones_produccion.sql'), 'utf8')

describe('048 - Bug 1 real: eliminar usuario rechazado por el trigger de lista blanca', () => {
  it('fn_restringir_columnas_pacientes_update ahora exime auth_rol() IS NULL (contexto service_role/sistema)', () => {
    const funcion = sql.match(/create or replace function fn_restringir_columnas_pacientes_update[\s\S]*?\$\$;/)[0]
    expect(funcion).toMatch(/if auth_rol\(\) in \('owner', 'dentista'\) or auth_rol\(\) is null then/)
  })

  it('la lista blanca de columnas y el mensaje de error se conservan exactamente, solo cambia la condicion de exencion', () => {
    const funcion = sql.match(/create or replace function fn_restringir_columnas_pacientes_update[\s\S]*?\$\$;/)[0]
    expect(funcion).toMatch(/'curp', 'tipo_paciente'/)
    expect(funcion).toMatch(/El rol % solo puede modificar los datos administrativos permitidos/)
  })
})

describe('048 - Hallazgo 3 (auditoria adicional): reasignacion con manejo explicito de contexto de sistema', () => {
  it('fn_validar_reasignacion_paciente ahora trata auth_rol() IS NULL explicitamente, no por accidente de NULL <> owner', () => {
    const funcion = sql.match(/create or replace function fn_validar_reasignacion_paciente[\s\S]*?\$\$;/)[0]
    expect(funcion).toMatch(/if auth_rol\(\) is not null and auth_rol\(\) <> 'owner' then/)
  })

  it('la validacion de misma clinica para el dentista elegido se conserva sin cambios', () => {
    const funcion = sql.match(/create or replace function fn_validar_reasignacion_paciente[\s\S]*?\$\$;/)[0]
    expect(funcion).toMatch(/u\.rol = 'dentista'/)
    expect(funcion).toMatch(/u\.clinica_id = new\.clinica_id/)
  })
})

describe('048 - Bug 2 real: traslape de citas contra citas ya completadas/no-asistidas', () => {
  it('busca dinamicamente el nombre real del constraint original en vez de asumirlo', () => {
    expect(sql).toMatch(/select conname into v_nombre_restriccion/)
    expect(sql).toMatch(/contype = 'x'/)
    expect(sql).toMatch(/conname <> 'chk_sillon_no_traslape'/)
  })

  it('no toca chk_sillon_no_traslape (047) — solo el constraint de dentista_id', () => {
    const bloqueDo = sql.match(/do \$\$[\s\S]*?end \$\$;/)[0]
    expect(bloqueDo).toMatch(/chk_sillon_no_traslape/)
    // Confirma que la exclusión explícita está presente en la búsqueda,
    // no que se borre ese constraint.
    expect(sql).not.toMatch(/drop constraint chk_sillon_no_traslape/)
  })

  it('el nuevo constraint excluye completada y no_asistio, ademas de cancelada', () => {
    const nuevo = sql.match(/alter table citas add constraint chk_dentista_no_traslape[\s\S]*?;/)[0]
    expect(nuevo).toMatch(/where \(estado not in \('cancelada', 'completada', 'no_asistio'\)\)/)
  })

  it('conserva exactamente el mismo mecanismo (EXCLUDE USING GIST sobre dentista_id + rango de tiempo)', () => {
    const nuevo = sql.match(/alter table citas add constraint chk_dentista_no_traslape[\s\S]*?;/)[0]
    expect(nuevo).toMatch(/dentista_id with =/)
    expect(nuevo).toMatch(/tstzrange\(inicio, fin\) with &&/)
  })

  it('en_consulta sigue bloqueando traslapes (no está en la lista de exclusion) — una consulta activa debe seguir impidiendo doble reserva', () => {
    const nuevo = sql.match(/alter table citas add constraint chk_dentista_no_traslape[\s\S]*?;/)[0]
    expect(nuevo).not.toMatch(/en_consulta/)
  })
})
