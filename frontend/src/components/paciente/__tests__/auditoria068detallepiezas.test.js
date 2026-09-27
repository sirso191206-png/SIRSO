import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_MIGRACIONES = join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations')
const sql = readFileSync(join(RUTA_MIGRACIONES, '068_sirso_detalle_piezas_odontograma.sql'), 'utf8')

describe('068 - detalle de piezas: aditivo, texto libre, sin tocar el enum de estado', () => {
  it('agrega material_corona, tipo_incrustacion y tipo_ausencia como texto libre nullable', () => {
    expect(sql).toMatch(/alter table odontograma_piezas add column if not exists material_corona text;/)
    expect(sql).toMatch(/alter table odontograma_piezas add column if not exists tipo_incrustacion text;/)
    expect(sql).toMatch(/alter table odontograma_piezas add column if not exists tipo_ausencia text;/)
  })

  it('no toca el check constraint de estado ni crea ninguna tabla nueva', () => {
    expect(sql).not.toMatch(/check \(estado in/)
    expect(sql).not.toMatch(/create table/)
  })

  it('no modifica ninguna politica ni funcion - es puramente aditivo sobre una tabla existente', () => {
    expect(sql).not.toMatch(/create policy|create or replace function/)
  })
})
