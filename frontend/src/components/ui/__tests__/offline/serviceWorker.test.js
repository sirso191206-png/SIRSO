import { describe, it, expect, vi } from 'vitest'
import vm from 'node:vm'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Carga el sw.js REAL (el mismo archivo que se despliega) en un
// contexto aislado con un `caches` y un `fetch` simulados. No es un
// navegador: no prueba que el navegador respete el service worker,
// prueba que la LÓGICA del archivo hace lo correcto ante cada evento.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CODIGO_SW = fs.readFileSync(path.resolve(__dirname, '../../../../../public/sw.js'), 'utf8')

const ORIGEN = 'https://siro.test'
const abs = (u) => new URL(u, ORIGEN).href
const json = (o) => new Response(JSON.stringify(o), { status: 200 })
const texto = (t, status = 200) => new Response(t, { status })
const sinRed = () => { throw new TypeError('Failed to fetch') }

// Lo que sirve el "servidor" para una build dada.
function despliegue(build, extra = {}) {
  const archivos = ['/index.html', '/assets/app.js', '/assets/app.css', '/models/odontograma.glb']
  return {
    '/precache-manifest.json': () => json({ version: build, archivos }),
    '/index.html': () => texto(`<html>shell ${build}</html>`),
    '/assets/app.js': () => texto(`js ${build}`),
    '/assets/app.css': () => texto(`css ${build}`),
    '/models/odontograma.glb': () => texto(`glb ${build}`),
    ...extra
  }
}
const servidor = (rutas) => (url) => {
  const r = rutas[new URL(url).pathname]
  return r ? r() : texto('no encontrado', 404)
}

// CacheStorage simulado. `match` global recorre las cachés en orden de
// creación (la más vieja primero), igual que el navegador real.
function crearCaches(almacenes, fetchFn) {
  const llave = (req) => abs(typeof req === 'string' ? req : req.url)
  return {
    async open(nombre) {
      if (!almacenes.has(nombre)) almacenes.set(nombre, new Map())
      const a = almacenes.get(nombre)
      return {
        async add(req) {
          const r = await fetchFn(llave(req))
          if (!r.ok) throw new TypeError(`add falló con ${r.status}`)
          a.set(llave(req), r)
        },
        async put(req, res) { a.set(llave(req), res) },
        async match(req) { return a.get(llave(req))?.clone() }
      }
    },
    async match(req) {
      for (const a of almacenes.values()) { const r = a.get(llave(req)); if (r) return r.clone() }
    },
    async keys() { return [...almacenes.keys()] },
    async delete(nombre) { return almacenes.delete(nombre) }
  }
}

function levantarSW({ build = 'build-1', red, almacenes = new Map(), enLinea = true }) {
  const handlers = {}
  // El navegador resuelve las rutas relativas contra el origen antes de pedirlas.
  const fetchMock = vi.fn(async (req) => red(abs(typeof req === 'string' ? req : req.url)))
  // Lo que un service worker REAL tiene a mano: su origen (el SW solo gestiona el suyo), el estado de la conexión y los
  // temporizadores/cancelación con los que acota la espera de la red.
  const self = { addEventListener: (t, f) => { handlers[t] = f }, skipWaiting: vi.fn(), clients: { claim: vi.fn() }, location: { origin: ORIGEN }, navigator: { onLine: enLinea } }
  const contexto = vm.createContext({ self, caches: crearCaches(almacenes, fetchMock), fetch: fetchMock, Response, URL, Promise, console, AbortController, setTimeout, clearTimeout })
  vm.runInContext(CODIGO_SW.replaceAll('__SIRO_BUILD__', build), contexto)

  const despachar = async (tipo) => {
    const promesas = []
    handlers[tipo]({ waitUntil: (p) => promesas.push(p) })
    await Promise.all(promesas)
  }
  return {
    almacenes, fetchMock, self,
    instalar: () => despachar('install'),
    activar: () => despachar('activate'),
    mensaje: (data) => handlers.message({ data }),
    async pedir(url, { method = 'GET', mode = 'cors' } = {}) {
      let promesa = null
      handlers.fetch({ request: { method, url: abs(url), mode }, respondWith: (p) => { promesa = p } })
      if (promesa === null) return { manejado: false }
      const respuesta = await promesa
      return { manejado: true, status: respuesta?.status, texto: respuesta ? await respuesta.clone().text() : undefined }
    }
  }
}

const cacheDe = (almacenes, build) => almacenes.get(`siro-shell-${build}`)
const vaciarTareas = () => new Promise((r) => setTimeout(r, 0))

describe('Service Worker — precache del App Shell (sección 1)', () => {
  it('al instalarse guarda TODO lo que lista el manifiesto, en un caché propio de esta build', async () => {
    const sw = levantarSW({ red: servidor(despliegue('build-1')) })
    await sw.instalar()

    const guardado = [...cacheDe(sw.almacenes, 'build-1').keys()].map((u) => new URL(u).pathname)
    expect(guardado.sort()).toEqual(['/assets/app.css', '/assets/app.js', '/index.html', '/models/odontograma.glb'])
  })

  it('pide el manifiesto sin usar la copia en caché HTTP (si no, precachearía la lista de una build vieja)', async () => {
    const sw = levantarSW({ red: servidor(despliegue('build-1')) })
    await sw.instalar()
    const [, opciones] = sw.fetchMock.mock.calls.find(([u]) => String(u).includes('precache-manifest'))
    expect(opciones).toMatchObject({ cache: 'no-store' })
  })

  it('tolera que un archivo secundario falle: guarda el resto y la instalación sigue', async () => {
    const rutas = despliegue('build-1', { '/assets/app.js': () => texto('error', 500) })
    const sw = levantarSW({ red: servidor(rutas) })
    await sw.instalar()

    const guardado = [...cacheDe(sw.almacenes, 'build-1').keys()].map((u) => new URL(u).pathname)
    expect(guardado).toContain('/index.html')
    expect(guardado).not.toContain('/assets/app.js')
  })
})

describe('Instalación fallida = rollback seguro (sección 17)', () => {
  it('si no se puede leer el manifiesto, la instalación FALLA — el navegador conserva el SW anterior', async () => {
    const sw = levantarSW({ red: servidor(despliegue('build-1', { '/precache-manifest.json': () => texto('x', 500) })) })
    await expect(sw.instalar()).rejects.toThrow()
  })

  it('si el shell (index.html) no se pudo guardar, también falla: un shell sin index.html no sirve', async () => {
    const sw = levantarSW({ red: servidor(despliegue('build-1', { '/index.html': () => texto('x', 500) })) })
    await expect(sw.instalar()).rejects.toThrow()
  })

  it('una instalación fallida NO deja un caché a medias, y NO toca el de la versión que ya funcionaba', async () => {
    const almacenes = new Map()
    const v1 = levantarSW({ build: 'build-1', red: servidor(despliegue('build-1')), almacenes })
    await v1.instalar(); await v1.activar()

    const v2 = levantarSW({ build: 'build-2', almacenes, red: servidor(despliegue('build-2', { '/precache-manifest.json': () => texto('x', 500) })) })
    await expect(v2.instalar()).rejects.toThrow()

    expect([...almacenes.keys()]).toEqual(['siro-shell-build-1'])
    expect(await v1.pedir('/index.html')).toMatchObject({ texto: '<html>shell build-1</html>' })
  })
})

describe('Abrir SIRO sin internet después de una visita online (prueba #1)', () => {
  async function conVisitaPrevia() {
    const estado = { red: servidor(despliegue('build-1')) }
    const sw = levantarSW({ red: (u) => estado.red(u) })
    await sw.instalar(); await sw.activar()
    return { sw, cortarInternet: () => { estado.red = sinRed } }
  }

  it('sin red, sirve del caché el HTML, JS, CSS y el modelo 3D — sin tocar la red', async () => {
    const { sw, cortarInternet } = await conVisitaPrevia()
    cortarInternet()
    const llamadasAntes = sw.fetchMock.mock.calls.length

    for (const [ruta, esperado] of [
      ['/index.html', '<html>shell build-1</html>'],
      ['/assets/app.js', 'js build-1'],
      ['/assets/app.css', 'css build-1'],
      ['/models/odontograma.glb', 'glb build-1']
    ]) {
      expect(await sw.pedir(ruta)).toMatchObject({ manejado: true, status: 200, texto: esperado })
    }
    expect(sw.fetchMock.mock.calls.length).toBe(llamadasAntes)
  })

  it('recargar en CUALQUIER ruta de la app (/pacientes/123, /consulta/abc) sin internet abre el shell, no un error', async () => {
    const { sw, cortarInternet } = await conVisitaPrevia()
    cortarInternet()

    for (const ruta of ['/', '/pacientes/123', '/consulta/abc-def', '/agenda']) {
      expect(await sw.pedir(ruta, { mode: 'navigate' })).toMatchObject({ status: 200, texto: '<html>shell build-1</html>' })
    }
  })

  it('una navegación a un ARCHIVO (p. ej. un .glb escrito en la barra) no se confunde con una ruta de la app', async () => {
    const { sw, cortarInternet } = await conVisitaPrevia()
    cortarInternet()
    const r = await sw.pedir('/models/otro-modelo.glb', { mode: 'navigate' })
    expect(r.status).toBe(503)
  })
})

describe('Peticiones que no le corresponden (sección 1: no cachear indiscriminadamente)', () => {
  it('Supabase (API, Auth, Storage) nunca pasa por el service worker', async () => {
    const sw = levantarSW({ red: servidor(despliegue('build-1')) })
    await sw.instalar()
    for (const u of ['https://abc.supabase.co/rest/v1/pacientes', 'https://abc.supabase.co/auth/v1/token']) {
      expect((await sw.pedir(u)).manejado).toBe(false)
    }
  })

  it('las escrituras (POST/PATCH/DELETE) tampoco', async () => {
    const sw = levantarSW({ red: servidor(despliegue('build-1')) })
    await sw.instalar()
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      expect((await sw.pedir('/algo', { method })).manejado).toBe(false)
    }
  })
})

describe('Validación de respuestas y fallos de red', () => {
  it('un recurso nuevo que sí llega por la red se sirve y se guarda en el caché de ESTA build', async () => {
    const sw = levantarSW({ red: servidor(despliegue('build-1', { '/assets/nuevo.js': () => texto('nuevo') })) })
    await sw.instalar()

    expect(await sw.pedir('/assets/nuevo.js')).toMatchObject({ status: 200, texto: 'nuevo' })
    await vaciarTareas()
    expect(cacheDe(sw.almacenes, 'build-1').has(abs('/assets/nuevo.js'))).toBe(true)
  })

  it('una respuesta de ERROR (500/404) NUNCA se guarda — si no, un fallo pasajero quedaría fijo hasta el próximo deploy', async () => {
    const sw = levantarSW({ red: servidor(despliegue('build-1', { '/assets/roto.js': () => texto('boom', 500) })) })
    await sw.instalar()

    expect((await sw.pedir('/assets/roto.js')).status).toBe(500)
    await vaciarTareas()
    expect(cacheDe(sw.almacenes, 'build-1').has(abs('/assets/roto.js'))).toBe(false)
  })

  it('sin caché y sin red devuelve un 503 explícito — nunca "nada" (la causa de "TypeError: Load failed")', async () => {
    const sw = levantarSW({ red: servidor(despliegue('build-1')) })
    await sw.instalar()
    const r = await sw.pedir('/assets/nunca-visto.js')
    // (el servidor simulado responde 404 para lo desconocido; ahora cortamos la red)
    expect(r.status).toBe(404)

    const sw2 = levantarSW({ red: sinRed })
    const sinNada = await sw2.pedir('/assets/nunca-visto.js')
    expect(sinNada).toMatchObject({ manejado: true, status: 503 })
  })

  it('el SW reiniciado por el navegador (memoria vacía) sigue guardando en el caché correcto de la build', async () => {
    const almacenes = new Map()
    const primero = levantarSW({ red: servidor(despliegue('build-1', { '/assets/tarde.js': () => texto('tarde') })), almacenes })
    await primero.instalar()

    // El navegador mata el SW por inactividad y lo relanza: sin install,
    // sin variables en memoria de la ejecución anterior.
    const reiniciado = levantarSW({ red: servidor(despliegue('build-1', { '/assets/tarde.js': () => texto('tarde') })), almacenes })
    await reiniciado.pedir('/assets/tarde.js')
    await vaciarTareas()

    expect([...almacenes.keys()]).toEqual(['siro-shell-build-1'])
    expect(cacheDe(almacenes, 'build-1').has(abs('/assets/tarde.js'))).toBe(true)
  })
})

describe('Actualización del Service Worker (sección 17, prueba #20)', () => {
  async function conDosBuilds() {
    const almacenes = new Map()
    const v1 = levantarSW({
      build: 'build-1', almacenes,
      red: servidor(despliegue('build-1', {
        '/precache-manifest.json': () => json({ version: 'build-1', archivos: ['/index.html', '/assets/app.js', '/assets/fragmento-viejo.js'] }),
        '/assets/fragmento-viejo.js': () => texto('fragmento de build-1')
      }))
    })
    await v1.instalar(); await v1.activar()

    const v2 = levantarSW({ build: 'build-2', almacenes, red: servidor(despliegue('build-2')) })
    await v2.instalar(); await v2.activar()
    return { almacenes, v1, v2 }
  }

  it('la build nueva sirve SU shell, no el de la anterior (aunque la vieja siga en el navegador)', async () => {
    const { v2 } = await conDosBuilds()
    expect(await v2.pedir('/index.html')).toMatchObject({ texto: '<html>shell build-2</html>' })
    expect(await v2.pedir('/', { mode: 'navigate' })).toMatchObject({ texto: '<html>shell build-2</html>' })
    expect(await v2.pedir('/assets/app.js')).toMatchObject({ texto: 'js build-2' })
  })

  it('una pestaña que sigue abierta con la build vieja todavía puede cargar sus fragmentos (no se rompe a media consulta)', async () => {
    const { v2 } = await conDosBuilds()
    // build-2 ya no lista fragmento-viejo.js, pero el caché de build-1 se conserva una generación:
    expect(await v2.pedir('/assets/fragmento-viejo.js')).toMatchObject({ status: 200, texto: 'fragmento de build-1' })
  })

  it('se conserva la build actual + la anterior; las más viejas se eliminan (no crece sin límite)', async () => {
    const { almacenes } = await conDosBuilds()
    expect([...almacenes.keys()].sort()).toEqual(['siro-shell-build-1', 'siro-shell-build-2'])

    const v3 = levantarSW({ build: 'build-3', almacenes, red: servidor(despliegue('build-3')) })
    await v3.instalar(); await v3.activar()
    expect([...almacenes.keys()].sort()).toEqual(['siro-shell-build-2', 'siro-shell-build-3'])
  })

  it('no toca cachés que no son de SIRO (otra app en el mismo origen)', async () => {
    const almacenes = new Map([['otra-app-v9', new Map()]])
    const v1 = levantarSW({ build: 'build-1', almacenes, red: servidor(despliegue('build-1')) })
    await v1.instalar(); await v1.activar()
    const v2 = levantarSW({ build: 'build-2', almacenes, red: servidor(despliegue('build-2')) })
    await v2.instalar(); await v2.activar()
    const v3 = levantarSW({ build: 'build-3', almacenes, red: servidor(despliegue('build-3')) })
    await v3.instalar(); await v3.activar()

    expect(almacenes.has('otra-app-v9')).toBe(true)
  })

  it('al activarse reclama las pestañas abiertas, y el mensaje SKIP_WAITING lo acelera bajo demanda', async () => {
    const sw = levantarSW({ red: servidor(despliegue('build-1')) })
    await sw.instalar(); await sw.activar()
    expect(sw.self.clients.claim).toHaveBeenCalled()

    sw.self.skipWaiting.mockClear()
    sw.mensaje('SKIP_WAITING')
    expect(sw.self.skipWaiting).toHaveBeenCalledTimes(1)
    sw.mensaje('otro-mensaje')
    expect(sw.self.skipWaiting).toHaveBeenCalledTimes(1)
  })
})
