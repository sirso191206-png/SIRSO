// Pacientes creados SIN conexión. Viven aquí, completos, hasta que la
// cola logra subirlos — nunca se envían a Supabase con un id
// "offline-...", eso rompería la columna uuid de la tabla `pacientes`.
//
// Igual que la cola (lib/colaOffline.js) y el mapeo de ids
// (lib/mapeoIdsOffline.js), esto NUNCA se borra al cerrar sesión: es
// trabajo real sin subir, de la misma categoría que la cola.

import { encolarOperacion } from './colaOffline'
import { indexarPaciente } from './indicePacientesOffline'

const DB_NOMBRE = 'siro-pacientes-offline'
const DB_VERSION = 1
const ALMACEN = 'pacientes'

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

async function guardar(registro) {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readwrite')
    tx.objectStore(ALMACEN).put(registro)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function obtenerPacienteOfflineLocal(id) {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readonly')
    const peticion = tx.objectStore(ALMACEN).get(id)
    peticion.onsuccess = () => resolve(peticion.result ?? null)
    peticion.onerror = () => reject(peticion.error)
  })
}

// Crea un paciente SIN esperar red: genera un id local, lo guarda
// completo en este almacén, lo agrega al índice de búsqueda local
// (para que aparezca de inmediato aunque nadie más lo haya "visto
// online" todavía) y encola la operación real que lo creará en
// Supabase en cuanto vuelva la conexión.
//
// El id de la operación en la cola es EL MISMO id local del paciente:
// así cualquier otra operación que dependa de este paciente (una nota,
// una receta) puede referenciarlo con `dependeDe: [id]` sin necesitar
// un id de operación aparte.
export async function crearPacienteOffline(datosFormulario, { usuarioId, clinicaId, sucursalId } = {}) {
  // Dos ids: `idFuturo` es un UUID real, generado aquí mismo (igual que
  // ya se hace para notas/recetas), que viajará como `id` explícito en
  // el INSERT — así, si la subida se reintenta (p. ej. la respuesta se
  // perdió pero el insert sí llegó a pasar), un upsert con el MISMO id
  // nunca crea un segundo paciente. `id` (con el prefijo `offline-`) es
  // el que se usa mientras tanto en toda la app — URL, índice local,
  // referencia de otras operaciones — para que sea inconfundible con un
  // id real ya existente.
  const idFuturo = crypto.randomUUID()
  const id = `offline-${idFuturo}`
  const registro = {
    ...datosFormulario,
    id,
    idFuturo,
    creado_en: Date.now(),
    usuarioId: usuarioId ?? null,
    sincronizado: false
  }
  await guardar(registro)
  await indexarPaciente({
    id,
    nombre_completo: datosFormulario.nombre_completo,
    telefono: datosFormulario.telefono ?? null,
    numero_expediente: null,
    offline: true,
    actualizado_en: Date.now()
  }).catch(() => {})

  await encolarOperacion({
    id,
    tipo: 'crear_paciente',
    entidad: 'pacientes',
    entidadId: id,
    payload: { ...datosFormulario, id: idFuturo },
    dependeDe: [],
    creado_en: Date.now(),
    usuarioId: usuarioId ?? null,
    clinicaId: clinicaId ?? null,
    sucursalId: sucursalId ?? null,
    claveIdempotencia: id
  })

  return { ...registro, _offline: true }
}

// Se llama SOLO después de que la operación crear_paciente ya se subió
// con éxito (ver lib/procesadorColaOffline.js) — deja constancia local
// de que ya está sincronizado, pero NO borra el registro: sirve de
// historial y evita que una relectura accidental por el id viejo
// muestre "no encontrado" de la nada.
export async function marcarPacienteOfflineSincronizado(id, serverId) {
  const actual = await obtenerPacienteOfflineLocal(id)
  if (!actual) return
  await guardar({ ...actual, sincronizado: true, serverId })
}
