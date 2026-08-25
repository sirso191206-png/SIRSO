import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_MIGRACIONES = join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations')
const sql041 = readFileSync(join(RUTA_MIGRACIONES, '041_sirso_auditoria_fotos_storage_citas.sql'), 'utf8')
const sql042 = readFileSync(join(RUTA_MIGRACIONES, '042_sirso_logo_clinica.sql'), 'utf8')

describe('041 — Hallazgo: fotografías nunca se corrigió en rondas anteriores', () => {
  it('fotos_select y fotos_insert ahora usan auth_paciente_asignado', () => {
    for (const politica of ['fotos_select', 'fotos_insert']) {
      const bloque = sql041.match(new RegExp(`create policy ${politica}[\\s\\S]*?;\\n`))[0]
      expect(bloque, politica).toMatch(/auth_paciente_asignado\(paciente_id\)/)
    }
  })

  it('fotografías conserva asistente en la lista de roles (ya lo tenía antes de esta auditoría, no se quitó)', () => {
    const bloque = sql041.match(/create policy fotos_select[\s\S]*?;\n/)[0]
    expect(bloque).toMatch(/'asistente'/)
  })
})

describe('041 — Hallazgo GRAVE: storage.objects no verificaba clínica ni asignación, solo "authenticated"', () => {
  it('storage_fotos_select/insert ahora exigen auth_paciente_asignado sobre el segmento paciente_id del path', () => {
    for (const politica of ['storage_fotos_select', 'storage_fotos_insert']) {
      const bloque = sql041.match(new RegExp(`create policy ${politica}[\\s\\S]*?;\\n`))[0]
      expect(bloque, politica).toMatch(/auth_paciente_asignado\(\(storage\.foldername\(name\)\)\[1\]::uuid\)/)
    }
  })

  it('storage_documentos_select/insert exigen asignación Y excluyen a asistente (igual que la tabla documentos_clinicos)', () => {
    for (const politica of ['storage_documentos_select', 'storage_documentos_insert']) {
      const bloque = sql041.match(new RegExp(`create policy ${politica}[\\s\\S]*?;\\n`))[0]
      expect(bloque, politica).toMatch(/auth_paciente_asignado\(\(storage\.foldername\(name\)\)\[1\]::uuid\)/)
      expect(bloque, politica).toMatch(/auth_rol\(\) in \('owner', 'dentista'\)/)
    }
  })

  it('ninguna política nueva de storage se conforma solo con auth.role() = authenticated', () => {
    for (const politica of ['storage_fotos_select', 'storage_fotos_insert', 'storage_documentos_select', 'storage_documentos_insert']) {
      const bloque = sql041.match(new RegExp(`create policy ${politica}[\\s\\S]*?;\\n`))[0]
      expect(bloque, politica).not.toMatch(/auth\.role\(\) = 'authenticated'/)
    }
  })
})

describe('041 — Hallazgo: citas dependía de dentista_id directo, sin verificar asignación real del paciente', () => {
  it('citas_select ahora usa auth_paciente_asignado(paciente_id) para dentista/asistente, no citas.dentista_id', () => {
    const bloque = sql041.match(/create policy citas_select[\s\S]*?;\n/)[0]
    expect(bloque).toMatch(/auth_paciente_asignado\(paciente_id\)/)
    expect(bloque).not.toMatch(/dentista_id = auth\.uid\(\)/)
  })

  it('citas_update_dentista ahora usa auth_paciente_asignado(paciente_id), no dentista_id directo', () => {
    const bloque = sql041.match(/create policy citas_update_dentista[\s\S]*?;\n/)[0]
    expect(bloque).toMatch(/auth_paciente_asignado\(paciente_id\)/)
    expect(bloque).not.toMatch(/dentista_id = auth\.uid\(\)/)
  })

  it('owner/recepción conservan acceso administrativo completo a citas (sin cambio de comportamiento para ellos)', () => {
    const bloque = sql041.match(/create policy citas_select[\s\S]*?;\n/)[0]
    expect(bloque).toMatch(/auth_rol\(\) in \('owner', 'recepcion'\)/)
  })
})

describe('042 — Logo de clínica: pertenece a la clínica, no al odontólogo', () => {
  it('agrega logo_url a clinicas (no a usuarios)', () => {
    expect(sql042).toMatch(/alter table clinicas add column if not exists logo_url text/)
    expect(sql042).not.toMatch(/alter table usuarios add column if not exists logo/)
  })

  it('crea un bucket nuevo y público, dedicado (no reutiliza los buckets privados existentes)', () => {
    expect(sql042).toMatch(/values \('logos-clinicas', 'logos-clinicas', true\)/)
  })

  it('solo el owner de ESA clínica (verificado contra auth_clinica_id(), no un valor arbitrario) puede subir/actualizar/borrar', () => {
    for (const politica of ['storage_logos_insert', 'storage_logos_update', 'storage_logos_delete']) {
      const bloque = sql042.match(new RegExp(`create policy ${politica}[\\s\\S]*?;\\n`))[0]
      expect(bloque, politica).toMatch(/auth_rol\(\) = 'owner'/)
      expect(bloque, politica).toMatch(/\(storage\.foldername\(name\)\)\[1\]::uuid = auth_clinica_id\(\)/)
    }
  })

  it('NO crea ninguna política nueva de UPDATE en la tabla clinicas — reutiliza clinicas_update_owner existente', () => {
    expect(sql042).not.toMatch(/create policy clinicas_update/)
  })
})
