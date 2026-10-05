// Cola de operaciones pendientes de subir — IndexedDB nativo, sin
// ninguna librería nueva.
//
// Forma de cada operación:
//   id                — clave de la cola (permite "reemplazar si ya
//                       existe" en vez de acumular); para creaciones
//                       (notas, recetas) es el mismo id generado con
//                       crypto.randomUUID() que ya lleva el registro.
//   tipo               — qué hacer al subirla (ver procesadorColaOffline.js)
//   entidad, entidadId — a qué tabla/registro afecta, para poder
//                       mostrar "3 cambios pendientes: 1 nota,
//                       2 piezas de odontograma" sin tener que
//                       inspeccionar el payload de cada tipo.
//   payload            — lo que la función de servicio real necesita
//   creado_en          — timestamp de cuándo se encoló
//   usuarioId, clinicaId, sucursalId — quién y dónde, para auditoría
//   intentos           — cuántas veces se intentó subir sin éxito
//   estado             — 'pendiente' | 'sincronizando' | 'error'
//   ultimoError        — null, o el mensaje del último intento fallido
//   claveIdempotencia  — para creaciones, el mismo id (ya sirve como
//                       tal vía upsert); para actualizaciones, una
//                       marca propia — nunca se reintenta con una
//                       clave distinta a la original.

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
    tx.objectStore(ALMACEN).put({
      intentos: 0,
      estado: 'pendiente',
      ultimoError: null,
      ...operacion
    })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// Marca una operación como "en proceso de subir" justo antes de
// intentarlo — así, si alguien abre el indicador de sincronización a
// mitad del proceso, ve "sincronizando" en vez de "pendiente" para la
// que ya está en curso.
export async function marcarSincronizando(id) {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readwrite')
    const almacen = tx.objectStore(ALMACEN)
    const peticion = almacen.get(id)
    peticion.onsuccess = () => {
      const actual = peticion.result
      if (actual) almacen.put({ ...actual, estado: 'sincronizando' })
    }
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

// mensajeError: el texto real del fallo (network, validación, lo que
// haya sido) — se guarda en la operación para que el panel de
// sincronización pueda mostrar POR QUÉ no se subió algo, no solo que
// falló.
export async function marcarIntentoFallido(operacion, mensajeError) {
  await encolarOperacion({
    ...operacion,
    intentos: (operacion.intentos ?? 0) + 1,
    estado: 'error',
    ultimoError: mensajeError ?? null
  })
}

// Un conflicto NO es un error transitorio: reintentarlo igual (como
// si fuera una caída de red) nunca lo resolvería — p. ej. un CURP que
// ya pertenece a OTRO paciente de la clínica. La operación se conserva
// intacta (nada del trabajo clínico local se pierde), pero con su
// propio estado: procesarColaOffline() ya no la reintenta sola, y
// el mensaje guardado es el que la persona ve, no el error crudo de
// la base de datos.
export async function marcarConflicto(operacion, mensaje) {
  await encolarOperacion({
    ...operacion,
    intentos: (operacion.intentos ?? 0) + 1,
    estado: 'conflicto',
    ultimoError: mensaje ?? null
  })
}

// ¿Esta operación es de esta persona? Las hechas antes de que se
// guardara `usuarioId` (versiones anteriores) no traen dueño y se tratan
// como de quien esté usando el equipo. Las que SÍ traen dueño distinto
// nunca se suben ni se cuentan con otra sesión: subir cambios clínicos
// bajo la cuenta de otra persona sería falsificar quién los hizo.
export function operacionEsDe(operacion, userId) {
  return !operacion.usuarioId || operacion.usuarioId === userId
}
