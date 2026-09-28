// Caché de lectura — IndexedDB nativo, sin librerías nuevas. Guarda el
// resultado de cada consulta exitosa; si la misma consulta falla
// después (sin conexión), devuelve lo último que sí se guardó en vez
// de tronar. Es de SOLO LECTURA — nunca decide qué mostrar como
// "verdad", solo evita una pantalla vacía cuando no hay nada mejor.
//
// A diferencia de la cola de operaciones pendientes (colaOffline.js),
// esto no es para escribir después — es para que lo que YA viste una
// vez siga viéndose si te quedas sin conexión más tarde.

const DB_NOMBRE = 'siro-cache-lectura'
const DB_VERSION = 1
const ALMACEN = 'lecturas'

function abrirDB() {
  return new Promise((resolve, reject) => {
    const peticion = indexedDB.open(DB_NOMBRE, DB_VERSION)
    peticion.onupgradeneeded = () => {
      const db = peticion.result
      if (!db.objectStoreNames.contains(ALMACEN)) {
        db.createObjectStore(ALMACEN, { keyPath: 'clave' })
      }
    }
    peticion.onsuccess = () => resolve(peticion.result)
    peticion.onerror = () => reject(peticion.error)
  })
}

async function guardarEnCache(clave, datos) {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readwrite')
    tx.objectStore(ALMACEN).put({ clave, datos, guardado_en: Date.now() })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function leerDeCache(clave) {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readonly')
    const peticion = tx.objectStore(ALMACEN).get(clave)
    peticion.onsuccess = () => resolve(peticion.result ?? null)
    peticion.onerror = () => reject(peticion.error)
  })
}

// Metadatos simples (no el resultado de una consulta real) — se
// reutiliza el mismo almacén en vez de abrir una base de datos aparte
// solo para esto. Hoy sirve para "Sincronizar mi día" (guardar cuándo
// fue la última vez y qué se sincronizó).
export async function guardarMetadato(clave, valor) {
  await guardarEnCache(clave, valor)
}

export async function leerMetadato(clave) {
  const registro = await leerDeCache(clave)
  return registro?.datos ?? null
}

// clave: identifica QUÉ se está pidiendo (p. ej. `paciente:${id}`) —
// debe ser estable para el mismo dato, distinta entre datos distintos.
// funcionReal: la consulta real a Supabase, tal cual ya existía.
//
// Devuelve siempre la misma forma — { datos, deCache, guardadoEn } —
// en vez de mezclar campos de control dentro de `datos`: si `datos`
// resulta ser un arreglo (una lista de pacientes, por ejemplo),
// mezclarle campos encima lo dejaría de ser un arreglo de verdad.
export async function conCacheDeLectura(clave, funcionReal) {
  try {
    const datos = await funcionReal()
    guardarEnCache(clave, datos).catch(() => {})
    return { datos, deCache: false, guardadoEn: null }
  } catch (err) {
    const registro = await leerDeCache(clave).catch(() => null)
    if (registro) {
      return { datos: registro.datos, deCache: true, guardadoEn: registro.guardado_en }
    }
    throw err
  }
}
