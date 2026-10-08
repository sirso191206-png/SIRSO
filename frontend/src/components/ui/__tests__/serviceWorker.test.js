// Service worker real (public/sw.js) ejecutado en un entorno simulado: caché, red y reloj controlados.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const CODIGO = readFileSync(new URL('../../../../public/sw.js', import.meta.url), 'utf8').replace('__SIRO_BUILD__', 'build-test')
const ORIGEN = 'https://siro.test'

function crearEntorno({ enLinea = true } = {}) {
  const oyentes = {}
  const caches_ = { actual: new Map(), previa: new Map() }
  const cacheDe = (mapa) => ({ match: async (req) => mapa.get(req.url ?? req)?.clone() ?? undefined, put: async (req, res) => { mapa.set(req.url ?? req, res) } })
  const entorno = {
    self: { location: { origin: ORIGEN }, navigator: { onLine: enLinea }, addEventListener: (t, f) => { oyentes[t] = f }, skipWaiting: vi.fn() },
    caches: {
      open: async (nombre) => cacheDe(nombre.endsWith('build-test') ? caches_.actual : caches_.previa),
      match: async (req) => caches_.actual.get(req.url)?.clone() ?? caches_.previa.get(req.url)?.clone() ?? undefined,
      keys: async () => [], delete: async () => true
    },
    fetch: vi.fn(), Response, URL, AbortController, setTimeout, clearTimeout, console: { warn: vi.fn(), error: vi.fn(), log: vi.fn() }, Promise
  }
  vm.runInNewContext(CODIGO, entorno)
  const pedir = async (url, { metodo = 'GET', modo = 'cors' } = {}) => {
    let respuesta; let intercepto = false
    oyentes.fetch({ request: { method: metodo, url, mode: modo, headers: new Headers() }, respondWith: (p) => { intercepto = true; respuesta = p } })
    return { intercepto, respuesta: intercepto ? await respuesta : undefined }
  }
  return { entorno, caches_, pedir }
}
const html = (cuerpo = '<!doctype html>') => new Response(cuerpo, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
const js = () => new Response('export {}', { status: 200, headers: { 'Content-Type': 'text/javascript' } })

describe('service worker: solo gestiona SU shell', () => {
  it('NO intercepta peticiones que no son GET', async () => {
    const { pedir } = crearEntorno(); expect((await pedir(`${ORIGEN}/api`, { metodo: 'POST' })).intercepto).toBe(false)
  })
  it('NO intercepta Supabase (datos clínicos/financieros nunca pasan por aquí)', async () => {
    const { pedir, entorno } = crearEntorno()
    expect((await pedir('https://abc.supabase.co/rest/v1/pacientes?select=*')).intercepto).toBe(false); expect(entorno.fetch).not.toHaveBeenCalled()
  })
  it('NO intercepta recursos de OTROS dominios (scripts de terceros, extensiones, analíticas): así no fabrica un falso "503 Sin conexión" ni cachea código ajeno', async () => {
    const { pedir, entorno, caches_ } = crearEntorno({ enLinea: true })
    entorno.fetch.mockRejectedValue(new TypeError('Failed to fetch'))
    for (const url of ['https://cdn.tercero.com/x.js', 'https://vercel.live/_next-live/feedback/feedback.js', 'https://va.vercel-scripts.com/v1/speed-insights/script.js', 'http://localhost:9999/y']) expect((await pedir(url)).intercepto, url).toBe(false)
    expect(entorno.fetch).not.toHaveBeenCalled(); expect(caches_.actual.size).toBe(0)
  })
  it('un origen que SOLO se parece al propio (subdominio, puerto) tampoco se intercepta', async () => {
    const { pedir } = crearEntorno()
    for (const url of ['https://siro.test.evil.com/a.js', 'https://api.siro.test/a.js', 'https://siro.test:8443/a.js', 'http://siro.test/a.js']) expect((await pedir(url)).intercepto, url).toBe(false)
  })
  it('SÍ intercepta lo del mismo origen', async () => { const { pedir, entorno } = crearEntorno(); entorno.fetch.mockResolvedValue(js()); expect((await pedir(`${ORIGEN}/assets/a.js`)).intercepto).toBe(true) })
})

describe('service worker: caché y red del shell', () => {
  it('un archivo ya guardado se sirve del caché SIN tocar la red', async () => {
    const { pedir, entorno, caches_ } = crearEntorno(); caches_.actual.set(`${ORIGEN}/assets/a.js`, js())
    const { respuesta } = await pedir(`${ORIGEN}/assets/a.js`); expect(respuesta.status).toBe(200); expect(entorno.fetch).not.toHaveBeenCalled()
  })
  it('uno que solo está en una build ANTERIOR se sirve de ahí (fragmentos con hash que una pestaña vieja aún necesita)', async () => {
    const { pedir, entorno, caches_ } = crearEntorno(); caches_.previa.set(`${ORIGEN}/assets/viejo.js`, js())
    expect((await pedir(`${ORIGEN}/assets/viejo.js`)).respuesta.status).toBe(200); expect(entorno.fetch).not.toHaveBeenCalled()
  })
  it('lo que no está en caché se pide a la red y, si fue correcto, se guarda', async () => {
    const { pedir, entorno, caches_ } = crearEntorno(); entorno.fetch.mockResolvedValue(js())
    const { respuesta } = await pedir(`${ORIGEN}/assets/nuevo.js`); expect(respuesta.status).toBe(200); expect(caches_.actual.has(`${ORIGEN}/assets/nuevo.js`)).toBe(true)
  })
  it('un 500 o un 404 pasajero NO se guarda (quedaría fijo hasta el siguiente deploy)', async () => {
    const { pedir, entorno, caches_ } = crearEntorno()
    entorno.fetch.mockResolvedValueOnce(new Response('x', { status: 500 })); expect((await pedir(`${ORIGEN}/assets/a.js`)).respuesta.status).toBe(500)
    entorno.fetch.mockResolvedValueOnce(new Response('x', { status: 404 })); expect((await pedir(`${ORIGEN}/assets/b.js`)).respuesta.status).toBe(404)
    expect(caches_.actual.size).toBe(0)
  })
  it('una navegación a una ruta de la app (/pacientes/123) sirve el index.html guardado, sin red', async () => {
    const { pedir, entorno, caches_ } = crearEntorno(); caches_.actual.set('/index.html', html('SHELL'))
    const { respuesta } = await pedir(`${ORIGEN}/pacientes/123`, { modo: 'navigate' }); expect(await respuesta.text()).toBe('SHELL'); expect(entorno.fetch).not.toHaveBeenCalled()
  })
})

describe('service worker: un archivo inexistente NO se disfraza de página ni se cachea', () => {
  it('un .js/.glb/.png que el servidor contesta con HTML 200 (reescritura de SPA) recibe un 404 honesto y NO se guarda', async () => {
    const { pedir, entorno, caches_ } = crearEntorno(); entorno.fetch.mockResolvedValue(html())
    for (const ruta of ['/assets/Odontograma3D-viejo.js', '/models/odontograma.glb', '/logo.png', '/algo.css']) {
      const { respuesta } = await pedir(`${ORIGEN}${ruta}`); expect(respuesta.status, ruta).toBe(404)
    }
    expect(caches_.actual.size).toBe(0); expect(entorno.console.warn).toHaveBeenCalled()
  })
  it('un archivo .html legítimo y una ruta sin extensión que devuelven HTML sí pasan', async () => {
    const { pedir, entorno } = crearEntorno(); entorno.fetch.mockResolvedValue(html())
    expect((await pedir(`${ORIGEN}/index.html`)).respuesta.status).toBe(200); expect((await pedir(`${ORIGEN}/pacientes/9`)).respuesta.status).toBe(200)
  })
  it('un archivo que devuelve su tipo correcto (js, glb) pasa y se guarda', async () => {
    const { pedir, entorno, caches_ } = crearEntorno(); entorno.fetch.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'model/gltf-binary' } }))
    expect((await pedir(`${ORIGEN}/models/odontograma.glb`)).respuesta.status).toBe(200); expect(caches_.actual.has(`${ORIGEN}/models/odontograma.glb`)).toBe(true)
  })
})

describe('service worker: fallas honestas', () => {
  it('con red caída DE VERDAD → 503 "Sin conexión"', async () => {
    const { pedir, entorno } = crearEntorno({ enLinea: false }); entorno.fetch.mockRejectedValue(new TypeError('Failed to fetch'))
    const { respuesta } = await pedir(`${ORIGEN}/assets/x.js`); expect(respuesta.status).toBe(503); expect(respuesta.statusText).toBe('Sin conexión'); expect(await respuesta.text()).toMatch(/Sin conexión/)
  })
  it('con conexión pero sin poder traer el archivo NO se dice "Sin conexión" (no se disfraza una falla del servidor o un bloqueo)', async () => {
    const { pedir, entorno } = crearEntorno({ enLinea: true }); entorno.fetch.mockRejectedValue(new TypeError('Failed to fetch'))
    const { respuesta } = await pedir(`${ORIGEN}/assets/x.js`); expect(respuesta.status).toBe(503); expect(respuesta.statusText).toBe('No disponible'); expect(await respuesta.text()).not.toMatch(/Sin conexión/)
  })
  it('deja constancia de QUÉ URL falló (para poder diagnosticarlo)', async () => {
    const { pedir, entorno } = crearEntorno(); entorno.fetch.mockRejectedValue(new TypeError('Failed to fetch'))
    await pedir(`${ORIGEN}/assets/x.js`); const llamada = entorno.console.warn.mock.calls.flat().join(' ')
    expect(llamada).toContain(`${ORIGEN}/assets/x.js`); expect(llamada).toContain('[SIRO SW]')
  })
})

describe('service worker: tiempo máximo de espera', () => {
  beforeEach(() => vi.useFakeTimers()); afterEach(() => vi.useRealTimers())
  it('si la red no responde en 20 s, se cancela y se responde 503 (antes se quedaba colgado para siempre con un wifi sin salida)', async () => {
    const { pedir, entorno } = crearEntorno({ enLinea: true })
    entorno.fetch.mockImplementation((_req, init) => new Promise((_ok, ko) => init.signal.addEventListener('abort', () => ko(Object.assign(new Error('abortado'), { name: 'AbortError' })))))
    const promesa = pedir(`${ORIGEN}/assets/lento.js`); let terminado = false; promesa.then(() => { terminado = true })
    await vi.advanceTimersByTimeAsync(19000); expect(terminado).toBe(false)
    await vi.advanceTimersByTimeAsync(2000); const { respuesta } = await promesa
    expect(respuesta.status).toBe(503); expect(respuesta.statusText).toBe('No disponible')
  })
  it('una respuesta a tiempo limpia el temporizador (no queda nada pendiente)', async () => {
    const { pedir, entorno } = crearEntorno(); entorno.fetch.mockResolvedValue(js()); await pedir(`${ORIGEN}/assets/a.js`)
    expect(vi.getTimerCount()).toBe(0)
  })
})
