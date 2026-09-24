import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_MIGRACIONES = join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations')
const sql = readFileSync(join(RUTA_MIGRACIONES, '057_sirso_sesiones_usuario.sql'), 'utf8')

describe('057 - sesiones_usuario: cada quien solo ve las suyas, ni el owner ve las de otro', () => {
  it('las 3 policies (select/insert/update) exigen usuario_id = auth.uid(), sin excepcion para owner', () => {
    for (const politica of ['sesiones_usuario_select', 'sesiones_usuario_insert', 'sesiones_usuario_update']) {
      const bloque = sql.match(new RegExp(`create policy ${politica}[\\s\\S]*?;\\n`))[0]
      expect(bloque, politica).toMatch(/usuario_id = auth\.uid\(\)/)
      expect(bloque, politica).not.toMatch(/auth_rol\(\) = 'owner'/)
    }
  })

  it('documenta explicitamente la limitacion tecnica real (no se puede cerrar una sesion especifica de otro dispositivo)', () => {
    expect(sql).toMatch(/no se puede\s*\n--?\s*hacer de verdad sin esa Edge Function/)
  })
})
