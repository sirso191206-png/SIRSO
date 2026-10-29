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
// SOLO se gestionan peticiones GET del MISMO ORIGEN: el shell de SIRO (HTML, JS, CSS, imágenes, modelo 3D). Todo lo
// demás pasa de largo, sin tocarlo, para que el navegador lo trate como siempre:
//   · Supabase (API, Auth, Storage) — datos clínicos y financieros: nunca se cachean aquí.
//   · Recursos de OTROS dominios (scripts o estilos de terceros, extensiones, analíticas). Antes también se
//     interceptaban: si uno fallaba por un bloqueador, DNS o CSP, este archivo fabricaba un "503 Sin conexión" aunque
//     SÍ hubiera Internet, y además guardaba en caché copias de código ajeno que ya no se actualizaban.
self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  if (new URL(request.url).origin !== self.location.origin) return
  event.respondWith(responder(request))
})

// Una navegación a una ruta de la app (/pacientes/123, /consulta/abc) no
// tiene un archivo propio: en una SPA todas sirven el mismo index.html.
// Una navegación a un ARCHIVO (algo.glb) no es una ruta de la app.
function esRutaDeLaApp(request) {
  return request.mode === 'navigate' && !/\.[a-z0-9]+$/i.test(new URL(request.url).pathname)
}

// ¿La URL pide un ARCHIVO (js, css, glb, png…) y no una página? Un archivo nunca debe responderse con HTML.
function pideUnArchivo(request) {
  return /\.(?!html?$)[a-z0-9]+$/i.test(new URL(request.url).pathname)
}

function esHtml(respuesta) {
  return /text\/html/i.test(respuesta.headers.get('Content-Type') ?? '')
}

// Tiempo máximo para traer algo de la red: sin esto, con un wifi "conectado" que no sale a Internet la petición se
// queda colgada para siempre y la pantalla nunca sabe que falló.
const TIEMPO_MAX_RED_MS = 20000

async function pedirALaRed(request) {
  const control = new AbortController()
  const temporizador = setTimeout(() => control.abort(), TIEMPO_MAX_RED_MS)
  try {
    return await fetch(request, { signal: control.signal })
  } finally {
    clearTimeout(temporizador)
  }
}

async function shellDeOtraBuild() {
  const nombres = (await caches.keys()).filter((n) => n.startsWith(PREFIJO_CACHE) && n !== NOMBRE_CACHE).sort().reverse()
  for (const nombre of nombres) {
    const shell = await (await caches.open(nombre)).match(SHELL)
    if (shell) return shell
  }
  return null
}

function paginaSinConexion(sinConexion) {
  const titulo = sinConexion ? 'Sin conexión' : 'SIRO no respondió a tiempo'
  const texto = sinConexion
    ? 'Este dispositivo no tiene conexión y SIRO todavía no se había guardado aquí. Conéctate y vuelve a intentarlo.'
    : 'La conexión con el servidor se interrumpió. Vuelve a intentarlo en unos segundos.'
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SIRO · ${titulo}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;font-family:system-ui,sans-serif;color:#1e293b;padding:24px;box-sizing:border-box}
div{max-width:420px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:32px;text-align:center}h1{font-size:20px;margin:0 0 8px}p{font-size:14px;color:#64748b;margin:0 0 24px}
a{display:inline-block;background:#1e5f8c;color:#fff;text-decoration:none;border-radius:12px;padding:10px 18px;font-size:14px}</style></head>
<body><div role="alert"><h1>${titulo}</h1><p>${texto} Tus cambios pendientes de sincronizar no se pierden.</p><a href="">Reintentar</a></div></body></html>`
  return new Response(html, { status: 503, statusText: sinConexion ? 'Sin conexión' : 'No disponible', headers: { 'Content-Type': 'text/html; charset=utf-8' } })
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
    const respuesta = await pedirALaRed(request)

    // Un ARCHIVO que no existe NO debe contestarse con la página de inicio (un servidor de SPA devuelve el
    // index.html con 200 para cualquier ruta desconocida). Si se guardara, un .js o un .glb quedaría "cacheado"
    // como HTML hasta el siguiente deploy y la app fallaría con "Unexpected token '<'". Se responde un 404 honesto.
    if (respuesta.ok && pideUnArchivo(request) && esHtml(respuesta)) {
      console.warn('[SIRO SW] Se pidió un archivo que no existe en el servidor:', request.url)
      return new Response('Archivo no encontrado.', { status: 404, statusText: 'No encontrado', headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    }

    // Solo respuestas correctas. Guardar un 500 o un 404 pasajero lo
    // dejaría fijo hasta el siguiente deploy. Una ruta de la app que llegó de la red repara el shell de esta build
    // (si alguien borró el caché, la siguiente vez vuelve a abrir sin red).
    if (respuesta.ok) cache.put(esRutaDeLaApp(request) && esHtml(respuesta) ? SHELL : request, respuesta.clone()).catch(() => {})
    return respuesta
  } catch (causa) {
    // Ni caché ni red. "Sin conexión" solo cuando de verdad no hay conexión; si hay red y aun así no se pudo traer
    // (tiempo agotado, DNS, bloqueo), se dice eso — no se disfraza de "offline". Se deja constancia (con la URL) para
    // poder diagnosticarlo: aparece en la consola del service worker (DevTools → Application → Service Workers).
    const sinConexion = self.navigator && self.navigator.onLine === false
    console.warn('[SIRO SW] No se pudo obtener', request.url, '·', sinConexion ? 'sin conexión' : (causa && causa.name) || 'error de red')
    if (esRutaDeLaApp(request)) {
      // Una PÁGINA nunca se contesta con texto plano: primero el shell de cualquier build guardada (la más reciente);
      // si no hay ninguno, una página con «Reintentar».
      const guardado = await shellDeOtraBuild()
      if (guardado) return guardado
      return paginaSinConexion(sinConexion)
    }
    return new Response(
      sinConexion ? 'Sin conexión, y este archivo todavía no se había guardado localmente.' : 'No se pudo obtener este archivo (el servidor no respondió a tiempo).',
      { status: 503, statusText: sinConexion ? 'Sin conexión' : 'No disponible', headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    )
  }
}
