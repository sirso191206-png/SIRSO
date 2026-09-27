import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_MIGRACIONES = join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations')
const sql = readFileSync(join(RUTA_MIGRACIONES, '065_sirso_indices_rendimiento.sql'), 'utf8')

describe('065 - indices verificados contra patrones reales de consulta', () => {
  it('agrega usuarios(clinica_id)', () => {
    expect(sql).toMatch(/create index if not exists idx_usuarios_clinica on usuarios\(clinica_id\)/)
  })

  it('citas y pagos por sucursal son indices parciales (where sucursal_id is not null)', () => {
    expect(sql).toMatch(/create index if not exists idx_citas_sucursal on citas\(sucursal_id\) where sucursal_id is not null/)
    expect(sql).toMatch(/create index if not exists idx_pagos_sucursal on pagos\(sucursal_id\) where sucursal_id is not null/)
  })

  it('auditoria(clinica_id, creado_en desc) coincide con el orden que usa obtenerActividadReciente', () => {
    expect(sql).toMatch(/create index if not exists idx_auditoria_clinica_creado on auditoria\(clinica_id, creado_en desc\)/)
  })

  it('auditoria(entidad, entidad_id) para el patron natural de historial por registro', () => {
    expect(sql).toMatch(/create index if not exists idx_auditoria_entidad on auditoria\(entidad, entidad_id\)/)
  })

  it('NO agrega un indice redundante sobre sucursal_usuarios - ya cubierto por su unique constraint', () => {
    expect(sql).not.toMatch(/create index.*sucursal_usuarios/)
  })

  it('todos usan if not exists - seguros de reintentar', () => {
    // Anclado al inicio de línea (^ con flag m) para no contar la
    // mención de "`create index`" dentro de un comentario explicativo.
    const creaciones = sql.match(/^create index.*/gm) ?? []
    expect(creaciones.every((linea) => linea.includes('if not exists'))).toBe(true)
    expect(creaciones.length).toBe(5)
  })
})
