import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_MIGRACIONES = join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations')

const sqlCorrecta = readFileSync(join(RUTA_MIGRACIONES, '038_sirso_permisos_por_asignacion.sql'), 'utf8')
const sqlCorreccion = readFileSync(join(RUTA_MIGRACIONES, '039_sirso_correccion_auditoria_permisos.sql'), 'utf8')

// No hay Postgres real disponible — inspección estructural del SQL:
// confirma que cada patrón exigido existe literalmente en el archivo
// correcto. La validación en vivo (usuarios reales de cada rol) sigue
// pendiente de aplicar esto a una base real.
//
// La migración duplicada (038_sirso_roles_permisos_asignacion.sql, la
// que había quedado neutralizada) se ELIMINÓ del repositorio en la
// ronda de cierre de V1 — el usuario confirmó que nunca se aplicó
// contra un Supabase real, así que no había historial que conservar.
describe('Auditoría de la duplicación 038 — solo queda UNA arquitectura activa', () => {
  it('038_sirso_permisos_por_asignacion.sql (correcta) usa exactamente los nombres pedidos: auth_paciente_asignado y asistente_dentista_asignaciones', () => {
    expect(sqlCorrecta).toMatch(/create or replace function auth_paciente_asignado\(p_paciente_id uuid\)/)
    expect(sqlCorrecta).toMatch(/create table if not exists asistente_dentista_asignaciones/)
  })

  it('039 limpia defensivamente los objetos de la arquitectura descartada (con IF EXISTS, seguro de correr aunque nunca se hayan creado)', () => {
    expect(sqlCorreccion).toMatch(/drop table if exists asistentes_dentistas/)
    expect(sqlCorreccion).toMatch(/drop function if exists auth_puede_acceder_clinicamente/)
    expect(sqlCorreccion).toMatch(/drop trigger if exists trg_solo_owner_reasigna_paciente/)
  })
})

describe('038 (correcta) — auth_paciente_asignado(paciente_id): única fuente de verdad', () => {
  it('owner: acceso total', () => {
    expect(sqlCorrecta).toMatch(/auth_rol\(\) = 'owner'/)
  })

  it('dentista: solo si dentista_responsable_id coincide (SIN pool de "sin asignar" — invisible hasta que el owner asigne)', () => {
    const funcion = sqlCorrecta.match(/create or replace function auth_paciente_asignado[\s\S]*?\$\$;/)[0]
    expect(funcion).toMatch(/auth_rol\(\) = 'dentista' and p\.dentista_responsable_id = auth\.uid\(\)/)
    // Confirmar explícitamente que NO existe una cláusula "or ... is null"
    // para el caso dentista dentro de esa función — la regla es
    // "sin asignar = NO visible para dentista", no un pool compartido.
    const lineaDentista = funcion.split('\n').find((l) => l.includes("auth_rol() = 'dentista'"))
    expect(lineaDentista).not.toMatch(/is null/)
  })

  it('asistente: solo si el dentista responsable está en su lista de asignaciones, y NUNCA si el paciente está sin asignar', () => {
    const funcion = sqlCorrecta.match(/create or replace function auth_paciente_asignado[\s\S]*?\$\$;/)[0]
    expect(funcion).toMatch(/auth_rol\(\) = 'asistente'/)
    expect(funcion).toMatch(/p\.dentista_responsable_id is not null/)
    expect(funcion).toMatch(/asistente_dentista_asignaciones/)
  })

  it('recepción: no aparece en ningún caso de la función (siempre false salvo por las policies que la excluyen explícitamente)', () => {
    const funcion = sqlCorrecta.match(/create or replace function auth_paciente_asignado[\s\S]*?\$\$;/)[0]
    expect(funcion).not.toMatch(/recepcion/)
  })

  it('la función exige clinica_id = auth_clinica_id() como condición base, siempre', () => {
    const funcion = sqlCorrecta.match(/create or replace function auth_paciente_asignado[\s\S]*?\$\$;/)[0]
    expect(funcion).toMatch(/p\.clinica_id = auth_clinica_id\(\)/)
  })
})

describe('038 (correcta, tal como se escribió originalmente) — reglas de negocio del pedido (ítems 13, 14, 15)', () => {
  it('ítem 13: backfill solo si creado_por es dentista', () => {
    expect(sqlCorrecta).toMatch(/set dentista_responsable_id = p\.creado_por[\s\S]*?u\.rol = 'dentista'/)
  })

  // NOTA: fn_autoasignar_dentista_responsable() fue REDEFINIDA en la
  // migración 044 (create or replace function — el texto de la 038
  // sigue en el archivo, pero ya no es la versión que realmente
  // ejecuta Postgres). Ver auditoria044.test.js para las reglas
  // ACTUALES. Estas dos pruebas documentan la versión original —
  // 044 cerró exactamente el hueco que aquí se describe como
  // "if new.dentista_responsable_id is null" (un dentista que mandara
  // el UUID de otro dentista se colaba).
  it('ítem 14 (versión original de 038, ya refinada por 044): trigger de autoasignación existía desde el principio', () => {
    expect(sqlCorrecta).toMatch(/create or replace function fn_autoasignar_dentista_responsable/)
    expect(sqlCorrecta).toMatch(/if new\.dentista_responsable_id is null and auth_rol\(\) = 'dentista' then/)
    expect(sqlCorrecta).toMatch(/before insert on pacientes/)
  })

  it('ítem 15 (versión original de 038): pacientes creados por owner/recepción/asistente quedaban NULL en el diseño inicial', () => {
    const funcionAutoasignar = sqlCorrecta.match(/create or replace function fn_autoasignar_dentista_responsable[\s\S]*?\$\$;/)[0]
    expect(funcionAutoasignar).toMatch(/auth_rol\(\) = 'dentista'/)
    expect(funcionAutoasignar.match(/auth_rol\(\)/g).length).toBe(1)
  })
})

describe('038 (correcta) — ítems 9, 10, 11 del pedido', () => {
  it('ítem 9: recepción ve tratamientos SOLO vía v_tratamientos_recepcion (sin descripción clínica), nunca la tabla completa', () => {
    expect(sqlCorrecta).toMatch(/create or replace view v_tratamientos_recepcion/)
    const vista = sqlCorrecta.match(/create or replace view v_tratamientos_recepcion[\s\S]*?from tratamientos;/)[0]
    expect(vista).not.toMatch(/descripcion/)
    expect(vista).toMatch(/costo/)
    expect(vista).toMatch(/estado/)

    // Y tratamientos_select ya NO incluye a recepción en absoluto.
    const politica = sqlCorrecta.match(/create policy tratamientos_select[\s\S]*?;\n/)[0]
    expect(politica).not.toMatch(/recepcion/)
  })

  it('ítem 10: solo el owner puede reasignar — trigger explícito, no solo una policy', () => {
    expect(sqlCorrecta).toMatch(/create or replace function fn_validar_reasignacion_paciente/)
    expect(sqlCorrecta).toMatch(/if auth_rol\(\) <> 'owner' then/)
    expect(sqlCorrecta).toMatch(/raise exception 'Solo el owner de la clínica puede reasignar/)
  })

  it('ítem 11: el trigger de reasignación exige que el nuevo dentista responsable sea de la MISMA clínica', () => {
    const funcion = sqlCorrecta.match(/create or replace function fn_validar_reasignacion_paciente[\s\S]*?\$\$;/)[0]
    expect(funcion).toMatch(/u\.clinica_id = new\.clinica_id/)
    expect(funcion).toMatch(/raise exception 'El odontólogo responsable debe ser un dentista de la misma clínica/)
  })
})

describe('039 — corrige la vulnerabilidad real encontrada en pacientes_update/expedientes_insert', () => {
  it('pacientes_update ahora exige auth_paciente_asignado para dentista/asistente (antes: cualquier rol, cualquier paciente de la clínica)', () => {
    const politica = sqlCorreccion.match(/create policy pacientes_update[\s\S]*?;\n/)[0]
    expect(politica).toMatch(/auth_paciente_asignado\(id\)/)
    expect(politica).toMatch(/auth_rol\(\) in \('owner', 'recepcion'\)/)
  })

  it('expedientes_insert ahora exige asignación u owner/recepción (antes: cualquier rol, cualquier paciente)', () => {
    const politica = sqlCorreccion.match(/create policy expedientes_insert[\s\S]*?;\n/)[0]
    expect(politica).toMatch(/auth_paciente_asignado\(paciente_id\)/)
  })
})
