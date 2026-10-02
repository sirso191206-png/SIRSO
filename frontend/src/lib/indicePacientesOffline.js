// Índice local de pacientes — SOLO lo mínimo para poder buscar un
// nombre/teléfono sin conexión: no es una copia del expediente clínico
// (eso ya lo maneja cacheLectura.js por separado, paciente por
// paciente, cuando de verdad se abre). Guardar aquí solo nombre,
// teléfono y folio evita "descargar toda la clínica al navegador" —
// exactamente lo que se pidió NO hacer.
//
// Se alimenta solo: cada vez que services/pacientes.js resuelve un
// paciente por lectura (online) o lo crea offline, se llama a
// indexarPaciente() con ese resumen. Nunca se borra al cerrar sesión a
// propósito — es un ÍNDICE de qué existe, no un dato clínico sensible
// por sí mismo, y perderlo en cada logout dejaría la búsqueda offline
// vacía justo después de haber estado usando la app con normalidad.

const DB_NOMBRE = 'siro-indice-pacientes'
const DB_VERSION = 1
const ALMACEN = 'indice'

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

export async function indexarPaciente(resumen) {
  if (!resumen?.id) return
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readwrite')
    tx.objectStore(ALMACEN).put(resumen)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// Se usa al cambiar de usuario en el mismo equipo (ver
// lib/cierreSesion.js): sin esto, el índice de búsqueda —
// nombre/teléfono de pacientes de la clínica anterior— seguiría
// respondiendo búsquedas sin conexión para la cuenta nueva, aunque sea
// de OTRA clínica. RLS no aplica offline; este índice es la única
// defensa.
export async function vaciarIndicePacientesOffline() {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readwrite')
    tx.objectStore(ALMACEN).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function normalizar(texto) {
  return (texto ?? '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// Búsqueda simple por substring en nombre/teléfono/folio — nada de
// full-text ni de librerías nuevas, el índice es pequeño a propósito.
export async function buscarEnIndiceLocal(termino, { limite = 20 } = {}) {
  const db = await abrirDB()
  const todos = await new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readonly')
    const peticion = tx.objectStore(ALMACEN).getAll()
    peticion.onsuccess = () => resolve(peticion.result)
    peticion.onerror = () => reject(peticion.error)
  })
  const t = normalizar(termino)
  const filtrados = t
    ? todos.filter((p) => normalizar(p.nombre_completo).includes(t) || normalizar(p.telefono).includes(t) || normalizar(p.numero_expediente).includes(t))
    : todos
  return filtrados.sort((a, b) => (a.nombre_completo ?? '').localeCompare(b.nombre_completo ?? '')).slice(0, limite)
}
