import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_MIGRACIONES = join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations')
const sql045 = readFileSync(join(RUTA_MIGRACIONES, '045_sirso_cierre_sis_supabase.sql'), 'utf8')

describe('045 — elimina sis_catalogo_establecimientos, sin CASCADE', () => {
  it('drop table if exists, sin CASCADE (no hay nada que dependa de esta tabla)', () => {
    expect(sql045).toMatch(/drop table if exists sis_catalogo_establecimientos;/)
    expect(sql045).not.toMatch(/sis_catalogo_establecimientos.*cascade/i)
  })
})

describe('045 — elimina las 14 columnas SIS-exclusivas confirmadas sin uso', () => {
  const COLUMNAS_USUARIOS = ['primer_apellido', 'segundo_apellido', 'tipo_personal_sis', 'pais_nacimiento', 'programa_smym_g']
  const COLUMNAS_PACIENTES = [
    'pais_nacimiento', 'entidad_nacimiento', 'sexo_biologico', 'genero',
    'se_autodenomina_afromexicano', 'se_considera_indigena', 'migrante',
    'pais_procedencia', 'derechohabiencia',
  ]

  it('elimina las 5 columnas SIS de usuarios', () => {
    for (const col of COLUMNAS_USUARIOS) {
      expect(sql045, col).toMatch(new RegExp(`alter table usuarios drop column if exists ${col};`))
    }
  })

  it('elimina las 9 columnas SIS de pacientes', () => {
    for (const col of COLUMNAS_PACIENTES) {
      expect(sql045, col).toMatch(new RegExp(`alter table pacientes drop column if exists ${col};`))
    }
  })

  it('ningún DROP COLUMN usa CASCADE (se verificó que ninguna columna tiene índice propio ni es referenciada por vistas/funciones)', () => {
    expect(sql045).not.toMatch(/drop column.*cascade/i)
  })
})

describe('045 — NO toca lo que sigue en uso, ni lo que se pidió conservar explícitamente', () => {
  it('NO elimina usuarios.curp (conservación explícita pedida por el usuario)', () => {
    expect(sql045).not.toMatch(/alter table usuarios drop column if exists curp;/)
  })

  it('NO elimina ninguna columna de pacientes.curp/primer_apellido/segundo_apellido (en uso activo real, tabla distinta a usuarios)', () => {
    expect(sql045).not.toMatch(/alter table pacientes drop column if exists curp;/)
    expect(sql045).not.toMatch(/alter table pacientes drop column if exists primer_apellido;/)
    expect(sql045).not.toMatch(/alter table pacientes drop column if exists segundo_apellido;/)
  })

  it('NO toca notas_clinicas.accion_salud_bucal (parte del flujo clínico activo de ConsultaUnificada.jsx, protegido explícitamente)', () => {
    expect(sql045).not.toMatch(/accion_salud_bucal/)
  })

  it('NO toca signos_vitales.presion_sistolica/presion_diastolica (signos vitales legítimos, ya usados fuera de SIS)', () => {
    expect(sql045).not.toMatch(/presion_sistolica/)
    expect(sql045).not.toMatch(/presion_diastolica/)
  })

  it('todos los DROP son sobre objetos vivos actuales (tablas/columnas), nunca sobre archivos de migración', () => {
    expect(sql045).not.toMatch(/alter migration|drop migration/i)
  })
})
