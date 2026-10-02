// Réplica local de una VENTANA de la agenda de la clínica (pasado
// reciente + próximos días) — distinta de la caché por-rango-exacto de
// obtenerCitasRango() (lib/cacheLectura.js, clave `citas-rango:...`),
// que solo sirve el filtro EXACTO que ya se pidió antes. Esta cubre
// cualquier filtro DENTRO de la ventana ya replicada, sin depender de
// haber consultado ese rango/dentista/estado exacto con anterioridad.

// Sin almacén de cursor a propósito: syncAgenda() (lib/clinicDataSync.js)
// vuelve a traer la ventana completa cada corrida en vez de avanzar un
// cursor por `actualizado_en` — ver el comentario ahí sobre por qué un
// cursor incremental sería incorrecto para una ventana relativa a "hoy".
const DB_NOMBRE = 'siro-citas-clinica'
const DB_VERSION = 1
const ALMACEN = 'citas'
const ALMACEN_MARCA = 'marca'
const CLAVE_MARCA = 'ultima_sincronizacion_completa'

function abrirDB() {
  return new Promise((resolve, reject) => {
    const peticion = indexedDB.open(DB_NOMBRE, DB_VERSION)
    peticion.onupgradeneeded = () => {
      const db = peticion.result
      if (!db.objectStoreNames.contains(ALMACEN)) {
        db.createObjectStore(ALMACEN, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(ALMACEN_MARCA)) {
        db.createObjectStore(ALMACEN_MARCA, { keyPath: 'clave' })
      }
    }
    peticion.onsuccess = () => resolve(peticion.result)
    peticion.onerror = () => reject(peticion.error)
  })
}

// NO es un cursor (ver nota arriba sobre por qué uno por fila sería
// incorrecto aquí) — solo responde "¿ya corrió syncAgenda() al menos
// una vez?". Sin esto, una ventana sin ninguna cita (un día de verdad
// tranquilo) sería indistinguible de "nunca se sincronizó esta
// ventana", y un array vacío inventaría un día vacío que no lo es.
export async function marcarSincronizacionCompleta() {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN_MARCA, 'readwrite')
    tx.objectStore(ALMACEN_MARCA).put({ clave: CLAVE_MARCA, valor: Date.now() })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function huboSincronizacionCompleta() {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN_MARCA, 'readonly')
    const peticion = tx.objectStore(ALMACEN_MARCA).get(CLAVE_MARCA)
    peticion.onsuccess = () => resolve(!!peticion.result)
    peticion.onerror = () => reject(peticion.error)
  })
}

export async function guardarCitasEnReplica(citas) {
  if (!citas?.length) return
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readwrite')
    const almacen = tx.objectStore(ALMACEN)
    for (const c of citas) almacen.put(c)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// Filtra en memoria por lo que pida la pantalla — la réplica ya viene
// acotada a la ventana (ver syncAgenda en lib/clinicDataSync.js), así
// que esto no necesita saber cuál es esa ventana, solo aplicar los
// mismos criterios que ya usa obtenerCitasRango().
export async function buscarEnReplicaCitas({ desde, hasta, dentistaId, estado, sucursalId }) {
  const db = await abrirDB()
  const todas = await new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readonly')
    const peticion = tx.objectStore(ALMACEN).getAll()
    peticion.onsuccess = () => resolve(peticion.result)
    peticion.onerror = () => reject(peticion.error)
  })
  return todas
    .filter((c) => c.inicio >= desde && c.inicio <= hasta)
    .filter((c) => !dentistaId || c.dentista_id === dentistaId)
    .filter((c) => !estado || c.estado === estado)
    .filter((c) => !sucursalId || c.sucursal_id === sucursalId)
    .sort((a, b) => (a.inicio < b.inicio ? -1 : 1))
}

// Se usa al cerrar sesión y al cambiar de cuenta (ver lib/cierreSesion.js)
// — misma razón que pacientesReplica.js: es una réplica de toda la
// clínica, el aislamiento multi-clínica depende de vaciar esto también.
export async function vaciarReplicaCitas() {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([ALMACEN, ALMACEN_MARCA], 'readwrite')
    tx.objectStore(ALMACEN).clear()
    tx.objectStore(ALMACEN_MARCA).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
