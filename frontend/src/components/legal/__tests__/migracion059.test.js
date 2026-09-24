import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_MIGRACIONES = join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations')
const sql = readFileSync(join(RUTA_MIGRACIONES, '059_sirso_arco_antispam_verificacion.sql'), 'utf8')

describe('059 - verificacion de identidad: candado real a nivel de base de datos', () => {
  it('agrega identidad_verificada (default false) y sus campos de evidencia', () => {
    expect(sql).toMatch(/add column if not exists identidad_verificada boolean not null default false/)
    expect(sql).toMatch(/add column if not exists identidad_verificada_por uuid references usuarios\(id\)/)
    expect(sql).toMatch(/add column if not exists identidad_verificada_en timestamptz/)
    expect(sql).toMatch(/add column if not exists metodo_verificacion text/)
  })

  it('el trigger rechaza marcar aprobada/atendida sin identidad_verificada = true', () => {
    const funcion = sql.match(/create or replace function fn_exigir_verificacion_arco[\s\S]*?\$\$;/)[0]
    expect(funcion).toMatch(/if new\.estado in \('aprobada', 'atendida'\) and not new\.identidad_verificada then/)
    expect(funcion).toMatch(/raise exception/)
  })

  it('el trigger corre en BEFORE UPDATE - se puede rechazar antes de que el cambio se guarde', () => {
    expect(sql).toMatch(/create trigger trg_exigir_verificacion_arco\s*\nbefore update on arco_solicitudes/)
  })
})

describe('059 - limite anti-spam: a nivel de base de datos, no solo frontend', () => {
  it('el trigger cuenta solicitudes del mismo correo en las ultimas 24 horas', () => {
    const funcion = sql.match(/create or replace function fn_limitar_solicitudes_arco[\s\S]*?\$\$;/)[0]
    expect(funcion).toMatch(/lower\(solicitante_correo\) = lower\(new\.solicitante_correo\)/)
    expect(funcion).toMatch(/creado_en > now\(\) - interval '24 hours'/)
    expect(funcion).toMatch(/v_conteo >= 3/)
  })

  it('el trigger corre en BEFORE INSERT - bloquea antes de que se cree la fila, no despues', () => {
    expect(sql).toMatch(/create trigger trg_limitar_solicitudes_arco\s*\nbefore insert on arco_solicitudes/)
  })

  it('no depende de ningun SDK de terceros - no hay codigo real de integracion (import, script, API key), solo la mencion en un comentario explicando que no se agregó', () => {
    // El comentario sí menciona "reCAPTCHA" para explicar por qué NO
    // se usó — lo que se descarta aquí es que exista una integración
    // REAL (una llamada, una clave, un script), no la palabra en sí.
    expect(sql).not.toMatch(/grecaptcha|g-recaptcha|sitekey|site_key/i)
    expect(sql).not.toMatch(/create extension.*http|net\.http_post/i)
  })
})
