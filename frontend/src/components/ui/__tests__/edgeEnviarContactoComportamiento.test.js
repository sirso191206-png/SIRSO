// Comportamiento REAL del código de la Edge Function enviar-contacto (pública), ejecutado en Node con una «base» y un «Resend» simulados.
// LIMITE: no es el runtime de Deno ni Resend/Supabase reales (PENDIENTE DE ENTORNO).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { transformSync } from 'esbuild'

const FUENTE = readFileSync(new URL('../../../../../supabase/functions/enviar-contacto/index.ts', import.meta.url), 'utf8')
const ID = '11111111-1111-4111-8111-111111111111'
const ahora = () => new Date().toISOString()

function cargar(esc = {}) {
  const correos = [], llamadas = []
  const filas = { [ID]: { nombre: 'Ana', correo: 'ana@x.mx', mensaje: 'Mensaje GUARDADO <b>x</b>', correo_enviado: false, creado_en: ahora(), ...(esc.fila ?? {}) }, ...(esc.otras ?? {}) }
  const crear = () => ({
    from: () => {
      const filtro = {}; let cambios = null
      const q = {
        select: () => q, eq: (c, v) => { filtro[c] = v; return q }, update: (c) => { cambios = c; return q },
        single: async () => { const f = filas[filtro.id]; return f ? { data: { ...f }, error: null } : { data: null, error: { message: 'no rows' } } },
        then: (res) => {
          if (!cambios) return res({ data: null, error: null })
          const f = filas[filtro.id]; const coincide = f && Object.entries(filtro).every(([k, v]) => k === 'id' || f[k] === v)
          llamadas.push(['update', filtro, cambios]); if (coincide) Object.assign(f, cambios)
          return res({ data: coincide ? [{ id: filtro.id }] : [], error: null })
        }
      }
      return q
    }
  })
  const fetchSim = async (url, init) => { const cuerpo = JSON.parse(init.body); correos.push(cuerpo); return esc.resend ? esc.resend(cuerpo) : { ok: true, status: 200, text: async () => '' } }
  let handler
  const { code } = transformSync(FUENTE.replace(/^import .*$/gm, ''), { loader: 'ts', format: 'esm' })
  const env = { SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 'svc', ...(esc.sinResend ? {} : { RESEND_API_KEY: 're_secreto_123' }) }
  new Function('serve', 'createClient', 'buildCorsHeaders', 'Deno', 'fetch', code)((h) => { handler = h }, crear, () => ({}), { env: { get: (k) => env[k] } }, fetchSim)
  const pedir = async (cuerpo, crudo) => { const r = await handler(new Request('https://x/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: crudo ?? JSON.stringify(cuerpo) })); return { status: r.status, json: await r.json() } }
  return { pedir, correos, filas, llamadas }
}

describe('enviar-contacto — envía el mensaje GUARDADO, una sola vez', () => {
  it('manda por correo el contenido GUARDADO (escapado), no el que diga el llamante, y marca el mensaje como enviado', async () => {
    const e = cargar(); const r = await e.pedir({ mensajeId: ID, nombre: 'ATACANTE', correo: 'atacante@evil.mx', mensaje: 'contenido falso' })
    expect(r.status).toBe(200); expect(r.json.ok).toBe(true); expect(e.correos).toHaveLength(1)
    const c = e.correos[0]; expect(c.html).toContain('Mensaje GUARDADO &lt;b&gt;x&lt;/b&gt;'); expect(c.html).not.toContain('contenido falso'); expect(JSON.stringify(c)).not.toMatch(/ATACANTE|evil\.mx/)
    expect(c.reply_to).toBe('ana@x.mx'); expect(e.filas[ID].correo_enviado).toBe(true)
  })
  it('es IDEMPOTENTE: repetir la llamada (o 5 llamadas a la vez) no envía más de UN correo', async () => {
    const e = cargar(); const rs = await Promise.all([1, 2, 3, 4, 5].map(() => e.pedir({ mensajeId: ID })))
    expect(rs.every((r) => r.status === 200)).toBe(true); expect(e.correos).toHaveLength(1)
    expect((await e.pedir({ mensajeId: ID })).json.yaEnviado).toBe(true); expect(e.correos).toHaveLength(1)
  })
  it('un mensaje que NO existe, o uno ya antiguo (más de 15 minutos), se rechaza sin enviar nada', async () => {
    const e = cargar({ fila: { creado_en: new Date(Date.now() - 20 * 60000).toISOString() } })
    expect((await e.pedir({ mensajeId: ID })).json.error).toMatch(/demasiado tiempo/); expect((await e.pedir({ mensajeId: '22222222-2222-4222-8222-222222222222' })).json.error).toMatch(/no encontrado/i); expect(e.correos).toHaveLength(0)
  })
})

describe('enviar-contacto — entradas inválidas (nada llega a Resend ni a la base)', () => {
  it.each([[{}], [{ mensajeId: 'no-uuid' }], [{ mensajeId: 123 }], [{ mensajeId: [ID] }], [{ mensajeId: `${ID}'; drop table x;--` }], [{ nombre: 'a', correo: 'a@x.mx', mensaje: 'sin mensajeId (antes se enviaba igual)' }]])('%j → 400', async (cuerpo) => {
    const e = cargar(); const r = await e.pedir(cuerpo); expect(r.status).toBe(400); expect(e.correos).toHaveLength(0); expect(e.llamadas).toHaveLength(0)
  })
  it.each(['null', '[]', '5', '"texto"', '{no es json'])('cuerpo %s → 400 controlado', async (crudo) => { const e = cargar(); const r = await e.pedir(null, crudo); expect(r.status).toBe(400); expect(typeof r.json.error).toBe('string'); expect(e.correos).toHaveLength(0) })
})

describe('enviar-contacto — fallos y secretos', () => {
  it('si Resend FALLA: no se devuelve su respuesta cruda al llamante, el mensaje NO queda marcado como enviado (se puede reintentar) y la respuesta es genérica', async () => {
    const e = cargar({ resend: () => ({ ok: false, status: 403, text: async () => 'domain not verified; account re_secreto_123 ...' }) }); const r = await e.pedir({ mensajeId: ID })
    expect(r.status).toBeGreaterThanOrEqual(500); expect(JSON.stringify(r.json)).not.toMatch(/domain not verified|re_secreto|Resend/); expect(r.json.error).toMatch(/No se pudo enviar/); expect(e.filas[ID].correo_enviado).toBe(false)
  })
  it('sin la llave de Resend configurada se dice con claridad (sin enviar ni marcar nada)', async () => {
    const e = cargar({ sinResend: true }); const r = await e.pedir({ mensajeId: ID }); expect(r.json.error).toMatch(/RESEND_API_KEY/); expect(e.correos).toHaveLength(0); expect(e.filas[ID].correo_enviado).toBe(false)
  })
  it('la llave de Resend NUNCA aparece en ninguna respuesta', async () => {
    for (const esc of [{}, { sinResend: true }, { resend: () => ({ ok: false, status: 500, text: async () => 'x' }) }]) { const e = cargar(esc); const r = await e.pedir({ mensajeId: ID }); expect(JSON.stringify(r.json)).not.toContain('re_secreto_123') }
  })
})
