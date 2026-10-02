// Réplica incremental del expediente LIGERO de toda la clínica —
// alergias, enfermedades, medicamentos actuales, antecedentes
// familiares. Mismo patrón que lib/pacientesReplica.js (un cursor por
// `actualizado_en`, correcto aquí porque el expediente de CUALQUIER
// paciente está siempre "dentro del alcance", sin el problema de
// ventana relativa al tiempo que tiene la agenda — ver
// lib/citasReplica.js). A propósito NO incluye notas clínicas,
// odontograma, periodontograma, tratamientos ni recetas: eso es una
// cantidad de datos por paciente mucho mayor (un periodontograma solo
// ya son 224 filas), y replicarlo para TODA la clínica —no solo quien
// se abre— sería exactamente lo que este proyecto decidió no hacer
// (ver límite en GUIA_OFFLINE.md). Lo que sí se replica aquí es
// deliberadamente lo más chico y lo más crítico para seguridad
// clínica: saber que alguien es alérgico a algo antes de atenderlo,
// aunque sea la primera vez que se abre su ficha en este equipo.

const DB_NOMBRE = 'siro-expedientes-clinica'
const DB_VERSION = 1
const ALMACEN = 'expedientes'
const ALMACEN_CURSOR = 'cursor'
const CLAVE_CURSOR = 'ultimo_actualizado_en_visto'

function abrirDB() {
  return new Promise((resolve, reject) => {
    const peticion = indexedDB.open(DB_NOMBRE, DB_VERSION)
    peticion.onupgradeneeded = () => {
      const db = peticion.result
      if (!db.objectStoreNames.contains(ALMACEN)) {
        db.createObjectStore(ALMACEN, { keyPath: 'paciente_id' })
      }
      if (!db.objectStoreNames.contains(ALMACEN_CURSOR)) {
        db.createObjectStore(ALMACEN_CURSOR, { keyPath: 'clave' })
      }
    }
    peticion.onsuccess = () => resolve(peticion.result)
    peticion.onerror = () => reject(peticion.error)
  })
}

export async function guardarExpedientesEnReplica(expedientes) {
  if (!expedientes?.length) return
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readwrite')
    const almacen = tx.objectStore(ALMACEN)
    for (const e of expedientes) almacen.put(e)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function obtenerExpedienteDeReplica(pacienteId) {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readonly')
    const peticion = tx.objectStore(ALMACEN).get(pacienteId)
    peticion.onsuccess = () => resolve(peticion.result ?? null)
    peticion.onerror = () => reject(peticion.error)
  })
}

export async function leerCursorExpedientes() {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN_CURSOR, 'readonly')
    const peticion = tx.objectStore(ALMACEN_CURSOR).get(CLAVE_CURSOR)
    peticion.onsuccess = () => resolve(peticion.result?.valor ?? null)
    peticion.onerror = () => reject(peticion.error)
  })
}

export async function guardarCursorExpedientes(valor) {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN_CURSOR, 'readwrite')
    tx.objectStore(ALMACEN_CURSOR).put({ clave: CLAVE_CURSOR, valor })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// Se usa al cerrar sesión y al cambiar de cuenta (ver lib/cierreSesion.js)
// — mismo motivo que las otras réplicas de clínica: aislamiento
// multi-clínica en equipos compartidos.
export async function vaciarReplicaExpedientes() {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([ALMACEN, ALMACEN_CURSOR], 'readwrite')
    tx.objectStore(ALMACEN).clear()
    tx.objectStore(ALMACEN_CURSOR).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
