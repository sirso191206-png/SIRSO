import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_MIGRACIONES = join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations')
const sql043 = readFileSync(join(RUTA_MIGRACIONES, '043_sirso_auditoria_signos_vitales.sql'), 'utf8')

describe('043 - signos_vitales fue la unica tabla clinica que ningun 038-042 toco', () => {
  it('signos_vitales_select/insert ahora usan auth_paciente_asignado', () => {
    for (const politica of ['signos_vitales_select', 'signos_vitales_insert']) {
      const bloque = sql043.match(new RegExp(`create policy ${politica}[\\s\\S]*?;\\n`))[0]
      expect(bloque, politica).toMatch(/auth_paciente_asignado\(paciente_id\)/)
      expect(bloque, politica).toMatch(/auth_rol\(\) in \('owner', 'dentista'\)/)
    }
  })
})

describe('Barrido final - tablas estrictamente clinicas de la Fase 5', () => {
  it('cada tabla estrictamente clinica tiene al menos una politica con auth_paciente_asignado en 038, 041 o 043', () => {
    const combinado = [
      '038_sirso_permisos_por_asignacion.sql',
      '041_sirso_auditoria_fotos_storage_citas.sql',
      '043_sirso_auditoria_signos_vitales.sql',
    ].map((f) => readFileSync(join(RUTA_MIGRACIONES, f), 'utf8')).join('\n')

    const TABLAS_ESTRICTAMENTE_CLINICAS = [
      'notas_clinicas', 'tratamientos', 'recetas', 'documentos_clinicos',
      'odontograma_piezas', 'odontograma_caras', 'odontograma_historial',
      'periodontograma_piezas', 'periodontograma_sitios', 'periodontograma_historial',
      'fotografias', 'signos_vitales',
    ]
    for (const tabla of TABLAS_ESTRICTAMENTE_CLINICAS) {
      const regex = new RegExp(`create policy \\w+ on ${tabla}[\\s\\S]*?auth_paciente_asignado`)
      expect(combinado, `${tabla} sin auth_paciente_asignado en ningun archivo`).toMatch(regex)
    }
  })
})
