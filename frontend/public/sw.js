// SIRO — Service worker mínimo (Nivel 1 de "offline": que la app
// pueda al menos CARGAR sin internet, mostrando lo último que ya se
// había visto). No es sincronización de datos ni guardado sin
// conexión — eso es una decisión aparte, mucho más delicada, que no
// se toma aquí.
//
// Estrategia: red primero, caché como respaldo solo si la red falla.
// Las llamadas a Supabase (API, Auth, Storage) NUNCA se cachean — un
// dato clínico o financiero viejo mostrado como si fuera actual es
// peor que no mostrar nada. Solo se cachea el shell estático de la
// app (JS, CSS, HTML, imágenes propias).

const CACHE_NAME = 'siro-shell-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((claves) =>
      Promise.all(claves.filter((c) => c !== CACHE_NAME).map((c) => caches.delete(c)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Solo GET, y nunca nada que vaya hacia Supabase — datos siempre
  // frescos o, si falla, que falle de verdad (el propio manejo de
  // errores de la app ya sabe qué hacer con eso).
  if (request.method !== 'GET' || request.url.includes('supabase.co')) {
    return
  }

  event.respondWith(
    fetch(request)
      .then((respuesta) => {
        const copia = respuesta.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copia)).catch(() => {})
        return respuesta
      })
      .catch(async () => {
        const enCache = await caches.match(request)
        if (enCache) return enCache
        // Ni la red ni el caché tienen este archivo (p. ej. la primera
        // vez que se prueba sin conexión, antes de que hubiera algo
        // guardado) — se devuelve una respuesta explícita en vez de
        // "nada". Dejar la promesa sin resolver a un Response válido es
        // justo lo que el navegador reporta como "TypeError: Load
        // failed" / "Failed to fetch".
        return new Response(
          'Sin conexión, y este archivo todavía no se había guardado localmente.',
          { status: 503, statusText: 'Sin conexión', headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
        )
      })
  )
})
