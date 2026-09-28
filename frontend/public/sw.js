// SIRO — Service worker: App Shell offline.
//
// QUÉ HACE: al instalarse descarga y guarda TODO el shell de la app
// (HTML, JS, CSS, imágenes propias, modelo 3D del odontograma), usando
// la lista exacta que genera vite-plugin-precache-manifest.js en cada
// build. Después, la app abre aunque no haya internet.
//
// QUÉ NUNCA HACE: cachear Supabase (API, Auth, Storage). Un dato clínico
// o financiero viejo mostrado como si fuera actual es peor que no
// mostrar nada. Los datos clínicos offline viven en IndexedDB
// (cacheLectura.js / colaOffline.js), no aquí.
//
// El marcador de abajo lo reemplaza el plugin de Vite con la versión de
// cada build. Eso hace que los bytes de este archivo cambien en cada
// deploy — que es lo ÚNICO que hace que el navegador detecte y aplique
// una actualización.
const BUILD_ID = '__SIRO_BUILD__'

const PREFIJO_CACHE = 'siro-shell-'
const NOMBRE_CACHE = PREFIJO_CACHE + BUILD_ID
const MANIFIESTO_URL = '/precache-manifest.json'
const SHELL = '/index.html'

// ─── Instalación: precache, o falla del todo ────────────────────────────
// Si algo esencial no se puede guardar, la instalación se RECHAZA. Es el
// mecanismo estándar de rollback: el navegador descarta esta versión y
// sigue usando la anterior, que sí funcionaba. Tragarse el error (como
// hacía la versión anterior) activaba un worker con el caché vacío o a
// medias.
self.addEventListener('install', (event) => {
  event.waitUntil(precachear())
  self.skipWaiting()
})

async function precachear() {
  try {
    const respuesta = await fetch(MANIFIESTO_URL, { cache: 'no-store' })
    if (!respuesta.ok) throw new Error(`manifiesto no disponible (${respuesta.status})`)
    const { archivos } = await respuesta.json()
    if (!Array.isArray(archivos) || !archivos.includes(SHELL)) {
      throw new Error('el manifiesto no incluye el shell de la app')
    }

    const cache = await caches.open(NOMBRE_CACHE)
    // Uno por uno, no cache.addAll(): addAll falla completo si UN solo
    // archivo no carga. Solo el shell es imprescindible; cualquier otro
    // recurso que falle se guardará después, la primera vez que se pida
    // con internet.
    const guardados = await Promise.all(
      archivos.map((url) => cache.add(url).then(() => true, () => false))
    )
    if (!guardados[archivos.indexOf(SHELL)]) throw new Error('no se pudo guardar index.html')
  } catch (error) {
    await caches.delete(NOMBRE_CACHE) // nunca dejar un caché a medias
    throw error
  }
}

// ─── Activación: limpiar versiones viejas ───────────────────────────────
// Se conserva la build actual y la INMEDIATAMENTE anterior: una pestaña
// que sigue abierta con la build vieja (un dentista a media consulta)
// todavía puede cargar sus fragmentos de JS bajo demanda. Solo se tocan
// cachés de SIRO — nunca los de otra app en el mismo origen.
self.addEventListener('activate', (event) => {
  event.waitUntil(limpiarCachesViejos().then(() => self.clients.claim()))
})

async function limpiarCachesViejos() {
  const nombres = (await caches.keys()).filter((n) => n.startsWith(PREFIJO_CACHE)).sort()
  const anterior = nombres.filter((n) => n !== NOMBRE_CACHE).slice(-1)
  const conservar = new Set([NOMBRE_CACHE, ...anterior])
  await Promise.all(nombres.filter((n) => !conservar.has(n)).map((n) => caches.delete(n)))
}

// Permite que la app pida activar la versión nueva de inmediato.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

// ─── Peticiones ─────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || request.url.includes('supabase.co')) return
  event.respondWith(responder(request))
})

// Una navegación a una ruta de la app (/pacientes/123, /consulta/abc) no
// tiene un archivo propio: en una SPA todas sirven el mismo index.html.
// Una navegación a un ARCHIVO (algo.glb) no es una ruta de la app.
function esRutaDeLaApp(request) {
  return request.mode === 'navigate' && !/\.[a-z0-9]+$/i.test(new URL(request.url).pathname)
}

async function responder(request) {
  const cache = await caches.open(NOMBRE_CACHE)

  if (esRutaDeLaApp(request)) {
    // Shell de ESTA build, directo del caché: abre al instante y sin
    // depender de la red — importante con un wifi "conectado" que en
    // realidad no sale a internet, donde esperar a la red se cuelga.
    const shell = await cache.match(SHELL)
    if (shell) return shell
  } else {
    // Primero el caché de esta build. Solo si no está ahí, se busca en
    // cachés de builds anteriores (fragmentos con hash que una pestaña
    // vieja todavía necesita). Ese orden importa: buscar directo en
    // todos serviría el index.html VIEJO, porque el navegador recorre
    // las cachés de la más antigua a la más nueva.
    const propio = await cache.match(request)
    if (propio) return propio
    const previo = await caches.match(request)
    if (previo) return previo
  }

  try {
    const respuesta = await fetch(request)
    // Solo respuestas correctas. Guardar un 500 o un 404 pasajero lo
    // dejaría fijo hasta el siguiente deploy.
    if (respuesta.ok) cache.put(request, respuesta.clone()).catch(() => {})
    return respuesta
  } catch {
    // Ni caché ni red. Devolver "nada" es lo que el navegador reporta
    // como "TypeError: Load failed" / "Failed to fetch".
    return new Response(
      'Sin conexión, y este archivo todavía no se había guardado localmente.',
      { status: 503, statusText: 'Sin conexión', headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    )
  }
}
