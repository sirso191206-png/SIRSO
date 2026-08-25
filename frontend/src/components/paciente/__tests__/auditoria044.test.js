import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_MIGRACIONES = join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations')
const sql044 = readFileSync(join(RUTA_MIGRACIONES, '044_sirso_cierre_permisos_pacientes.sql'), 'utf8')

describe('044 — no hay colisión de nombre de migración', () => {
  it('el archivo se llama 044, no 041 (041 ya existía de la ronda anterior)', () => {
    // Esta prueba en sí es trivial (el archivo existe con este nombre
    // por construcción), pero documenta explícitamente la decisión
    // de renumerar en vez de crear un 041 duplicado.
    expect(sql044).toMatch(/pero 041 ya existe/)
  })
})

describe('044 — Decisión 1: lista blanca separada recepción vs asistente', () => {
  it('CURP y tipo_paciente están en la lista de recepción', () => {
    const bloqueRecepcion = sql044.match(/if auth_rol\(\) = 'recepcion' then[\s\S]*?end if;/)[0]
    expect(bloqueRecepcion).toMatch(/'curp'/)
    expect(bloqueRecepcion).toMatch(/'tipo_paciente'/)
  })

  it('la rama "else" (asistente) usa SOLO la lista base, sin curp/tipo_paciente agregados', () => {
    const funcionCompleta = sql044.match(/create or replace function fn_restringir_columnas_pacientes_update[\s\S]*?\$\$;/)[0]
    const ramaElse = funcionCompleta.match(/else\s*\n\s*v_columnas_permitidas := v_columnas_base;/)
    expect(ramaElse).not.toBeNull()
  })

  it('estado_expediente NO está en ninguna de las dos listas (base ni la ampliada de recepción)', () => {
    const funcionCompleta = sql044.match(/create or replace function fn_restringir_columnas_pacientes_update[\s\S]*?\$\$;/)[0]
    expect(funcionCompleta).not.toMatch(/'estado_expediente'/)
  })

  it('dentista_responsable_id, clinica_id y rol NO están en ninguna lista (siguen protegidas por otros mecanismos también)', () => {
    const funcionCompleta = sql044.match(/create or replace function fn_restringir_columnas_pacientes_update[\s\S]*?\$\$;/)[0]
    for (const columna of ['dentista_responsable_id', 'clinica_id', 'rol']) {
      expect(funcionCompleta, columna).not.toMatch(new RegExp(`'${columna}'`))
    }
  })

  it('owner y dentista siguen exentos de la restricción (return new sin comparar)', () => {
    const funcionCompleta = sql044.match(/create or replace function fn_restringir_columnas_pacientes_update[\s\S]*?\$\$;/)[0]
    expect(funcionCompleta).toMatch(/if auth_rol\(\) in \('owner', 'dentista'\) then\s*\n\s*return new;/)
  })
})

describe('044 — Decisión 3: pacientes_insert restringido por rol', () => {
  it('solo owner, dentista y recepción pueden insertar — asistente excluido explícitamente', () => {
    const politica = sql044.match(/create policy pacientes_insert[\s\S]*?;\n/)[0]
    expect(politica).toMatch(/auth_rol\(\) in \('owner', 'dentista', 'recepcion'\)/)
    expect(politica).not.toMatch(/'asistente'/)
  })

  it('sigue exigiendo clinica_id = auth_clinica_id() (multi-clínica intacto)', () => {
    const politica = sql044.match(/create policy pacientes_insert[\s\S]*?;\n/)[0]
    expect(politica).toMatch(/clinica_id = auth_clinica_id\(\)/)
  })
})

describe('044 — Decisión 4: reglas de creación fortalecidas', () => {
  it('un dentista SIEMPRE se autoasigna, sin condición "is null" (el hueco encontrado: antes solo actuaba si venía NULL)', () => {
    const ramaDentista = sql044.match(/if auth_rol\(\) = 'dentista' then[\s\S]*?elsif/)[0]
    expect(ramaDentista).toMatch(/new\.dentista_responsable_id := auth\.uid\(\);/)
    expect(ramaDentista).not.toMatch(/is null/)
  })

  it('recepción SIEMPRE fuerza NULL — no puede decidir libremente el odontólogo, sin importar qué mande', () => {
    const ramaRecepcion = sql044.match(/elsif auth_rol\(\) = 'recepcion' then[\s\S]*?elsif/)[0]
    expect(ramaRecepcion).toMatch(/new\.dentista_responsable_id := null;/)
  })

  it('owner: el dentista elegido debe ser de la MISMA clínica, o se rechaza el INSERT completo', () => {
    const ramaOwner = sql044.match(/elsif auth_rol\(\) = 'owner' then[\s\S]*?end if;\n\s*end if;/)[0]
    expect(ramaOwner).toMatch(/u\.clinica_id = new\.clinica_id/)
    expect(ramaOwner).toMatch(/u\.rol = 'dentista'/)
    expect(ramaOwner).toMatch(/raise exception 'El odontólogo responsable debe ser un dentista de la misma clínica\./)
  })
})
