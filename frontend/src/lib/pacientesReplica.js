// Réplica local de la lista completa de pacientes de la clínica —
// distinta de lib/indicePacientesOffline.js (que solo guarda lo que
// ya se vio o se creó en este equipo). Esta sí busca cubrir TODA la
// clínica: nombre, teléfono, folio y los demás campos de
// v_pacientes_seguro para cualquier paciente, se haya abierto antes
// o no. La información clínica detallada (notas, odontograma,
// tratamientos…) sigue dependiendo de lib/cacheLectura.js por
// paciente — esta réplica solo cubre "encontrar y reconocer" al
// paciente, no su expediente completo.

const DB_NOMBRE = 'siro-pacientes-clinica'
const DB_VERSION = 1
const ALMACEN = 'pacientes'
const ALMACEN_CURSOR = 'cursor'
const CLAVE_CURSOR = 'ultimo_actualizado_en_visto'

function abrirDB() {
  return new Promise((resolve, reject) => {
    const peticion = indexedDB.open(DB_NOMBRE, DB_VERSION)
    peticion.onupgradeneeded = () => {
      const db = peticion.result
      if (!db.objectStoreNames.contains(ALMACEN)) {
        db.createObjectStore(ALMACEN, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(ALMACEN_CURSOR)) {
        db.createObjectStore(ALMACEN_CURSOR, { keyPath: 'clave' })
      }
    }
    peticion.onsuccess = () => resolve(peticion.result)
    peticion.onerror = () => reject(peticion.error)
  })
}

// Una sola transacción para toda la página — mucho más rápido que un
// put() por paciente, que es lo que de verdad importa cuando esto
// corre con cientos de filas en segundo plano.
export async function guardarPacientesEnReplica(pacientes) {
  if (!pacientes?.length) return
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readwrite')
    const almacen = tx.objectStore(ALMACEN)
    for (const p of pacientes) almacen.put(p)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function obtenerPacienteDeReplica(id) {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readonly')
    const peticion = tx.objectStore(ALMACEN).get(id)
    peticion.onsuccess = () => resolve(peticion.result ?? null)
    peticion.onerror = () => reject(peticion.error)
  })
}

function normalizar(texto) {
  return (texto ?? '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export async function buscarEnReplicaClinica(termino, { incluirArchivados = false } = {}) {
  const db = await abrirDB()
  const todos = await new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readonly')
    const peticion = tx.objectStore(ALMACEN).getAll()
    peticion.onsuccess = () => resolve(peticion.result)
    peticion.onerror = () => reject(peticion.error)
  })
  const t = normalizar(termino)
  return todos
    .filter((p) => incluirArchivados || !p.archivado_en)
    .filter((p) => !t || normalizar(p.nombre_completo).includes(t) || normalizar(p.telefono).includes(t) || normalizar(p.numero_expediente).includes(t))
    .sort((a, b) => (a.nombre_completo ?? '').localeCompare(b.nombre_completo ?? ''))
    .slice(0, 50)
}

// El cursor es el `actualizado_en` más reciente ya guardado — la
// siguiente sincronización solo pide lo posterior a esto, nunca la
// clínica completa de nuevo.
export async function leerCursorReplica() {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN_CURSOR, 'readonly')
    const peticion = tx.objectStore(ALMACEN_CURSOR).get(CLAVE_CURSOR)
    peticion.onsuccess = () => resolve(peticion.result?.valor ?? null)
    peticion.onerror = () => reject(peticion.error)
  })
}

export async function guardarCursorReplica(valor) {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN_CURSOR, 'readwrite')
    tx.objectStore(ALMACEN_CURSOR).put({ clave: CLAVE_CURSOR, valor })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// Se usa al cerrar sesión y al cambiar de cuenta en el mismo equipo
// (ver lib/cierreSesion.js) — es la réplica de TODA la clínica, así
// que el aislamiento multi-clínica depende de vaciar esto igual que
// el índice ligero y los pacientes creados offline.
export async function vaciarReplicaPacientes() {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([ALMACEN, ALMACEN_CURSOR], 'readwrite')
    tx.objectStore(ALMACEN).clear()
    tx.objectStore(ALMACEN_CURSOR).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
