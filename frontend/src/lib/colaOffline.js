// Cola de operaciones pendientes de subir — IndexedDB nativo, sin
// ninguna librería nueva. Cada operación: { id, tipo, payload,
// creado_en, intentos }. "tipo" identifica QUÉ hacer al subirla
// (ver procesadorColaOffline.js); "id" es el mismo id que ya se le
// asignó al registro localmente (generado con crypto.randomUUID()),
// así que reintentar la subida nunca crea un duplicado.

const DB_NOMBRE = 'siro-cola-offline'
const DB_VERSION = 1
const ALMACEN = 'operaciones'

function abrirDB() {
  return new Promise((resolve, reject) => {
    const peticion = indexedDB.open(DB_NOMBRE, DB_VERSION)
    peticion.onupgradeneeded = () => {
      const db = peticion.result
      if (!db.objectStoreNames.contains(ALMACEN)) {
        db.createObjectStore(ALMACEN, { keyPath: 'id' })
      }
    }
    peticion.onsuccess = () => resolve(peticion.result)
    peticion.onerror = () => reject(peticion.error)
  })
}

export async function encolarOperacion(operacion) {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readwrite')
    tx.objectStore(ALMACEN).put({ intentos: 0, ...operacion })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function listarOperacionesPendientes() {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readonly')
    const peticion = tx.objectStore(ALMACEN).getAll()
    peticion.onsuccess = () => resolve(peticion.result.sort((a, b) => a.creado_en - b.creado_en))
    peticion.onerror = () => reject(peticion.error)
  })
}

export async function quitarOperacion(id) {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readwrite')
    tx.objectStore(ALMACEN).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function marcarIntentoFallido(operacion) {
  await encolarOperacion({ ...operacion, intentos: (operacion.intentos ?? 0) + 1 })
}
