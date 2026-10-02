// Mapeo offlineId -> serverId. Un paciente creado sin conexión vive
// primero solo en el navegador con un id local (`offline-<uuid>`); al
// subirse, Supabase le asigna su UUID real. Este mapeo es lo que
// permite que todo lo que se creó DESPUÉS apuntando al id local (una
// nota, una receta, la propia URL abierta) encuentre el registro real.
//
// A propósito NUNCA se borra al cerrar sesión (igual que la cola de
// operaciones, ver lib/cierreSesion.js): si el mapeo desapareciera
// antes de que todo lo que depende de él terminara de subirse, se
// perdería la única forma de saber a qué paciente real correspondía
// cada cambio pendiente.

const DB_NOMBRE = 'siro-mapeo-ids-offline'
const DB_VERSION = 1
const ALMACEN = 'mapeos'

function abrirDB() {
  return new Promise((resolve, reject) => {
    const peticion = indexedDB.open(DB_NOMBRE, DB_VERSION)
    peticion.onupgradeneeded = () => {
      const db = peticion.result
      if (!db.objectStoreNames.contains(ALMACEN)) {
        db.createObjectStore(ALMACEN, { keyPath: 'offlineId' })
      }
    }
    peticion.onsuccess = () => resolve(peticion.result)
    peticion.onerror = () => reject(peticion.error)
  })
}

export function esIdOffline(id) {
  return typeof id === 'string' && id.startsWith('offline-')
}

export async function guardarMapeoId(offlineId, serverId) {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readwrite')
    tx.objectStore(ALMACEN).put({ offlineId, serverId, resuelto_en: Date.now() })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// Si `id` es un id offline con mapeo ya resuelto, regresa el id real.
// Cualquier otro caso (id real, o id offline TODAVÍA sin sincronizar)
// regresa el mismo id sin tocar — nunca inventa un mapeo que no existe.
// Se usa al cambiar de usuario en el mismo equipo. Este mapeo no
// guarda datos clínicos (solo dos uuids), pero se vacía junto con
// pacientesOffline/indicePacientesOffline por ser parte de la misma
// vida útil: si el paciente local de la cuenta anterior ya no está,
// tampoco tiene sentido conservar a qué se mapeaba.
export async function vaciarMapeoIdsOffline() {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readwrite')
    tx.objectStore(ALMACEN).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function resolverId(id) {
  if (!esIdOffline(id)) return id
  const db = await abrirDB()
  const registro = await new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readonly')
    const peticion = tx.objectStore(ALMACEN).get(id)
    peticion.onsuccess = () => resolve(peticion.result ?? null)
    peticion.onerror = () => reject(peticion.error)
  })
  return registro ? registro.serverId : id
}
