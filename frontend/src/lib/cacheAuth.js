// Caché local de perfil y clínica — para que la app pueda arrancar
// (mostrar el rol correcto, el nombre de la clínica, etc.) aunque
// Supabase no responda en ese momento, siempre que ya haya una sesión
// previamente autenticada y sincronizada.
//
// Qué se guarda: perfil (fila de `usuarios` — nombre, rol, clinica_id,
// permisos que ya vienen en esa fila), nombre y estado de la clínica.
// Qué NO se guarda: contraseñas (nunca se tienen del lado del
// cliente), tokens (esos ya los maneja Supabase Auth por su cuenta, en
// su propio almacenamiento — esto es solo el perfil, un dato de
// negocio, no una credencial).
//
// Expira a las 24 horas — pasado ese tiempo, aunque el registro siga
// en IndexedDB, se trata como si no existiera y se exige reconectar.
// Esto es deliberado: un perfil offline "para siempre" sería un
// riesgo de seguridad (un rol/clínica suspendida no se enteraría
// nunca), no una comodidad.

const DB_NOMBRE = 'siro-auth-cache'
const DB_VERSION = 1
const ALMACEN = 'perfil'
const EXPIRACION_MS = 24 * 60 * 60 * 1000 // 24 horas

function abrirDB() {
  return new Promise((resolve, reject) => {
    const peticion = indexedDB.open(DB_NOMBRE, DB_VERSION)
    peticion.onupgradeneeded = () => {
      const db = peticion.result
      if (!db.objectStoreNames.contains(ALMACEN)) {
        db.createObjectStore(ALMACEN, { keyPath: 'userId' })
      }
    }
    peticion.onsuccess = () => resolve(peticion.result)
    peticion.onerror = () => reject(peticion.error)
  })
}

export async function guardarPerfilOffline({ userId, perfil, clinicaNombre, clinicaEstado }) {
  try {
    const db = await abrirDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ALMACEN, 'readwrite')
      tx.objectStore(ALMACEN).put({
        userId,
        perfil,
        clinicaNombre: clinicaNombre ?? null,
        clinicaEstado: clinicaEstado ?? null,
        lastSyncedAt: Date.now()
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // IndexedDB puede fallar en modo privado de algunos navegadores —
    // no es crítico, solo significa que no habrá respaldo offline la
    // próxima vez.
  }
}

// Devuelve null si no hay nada guardado para este usuario, O si lo
// guardado ya pasó la ventana de 24 horas — en ambos casos, quien
// llama debe tratarlo como "hace falta reconectar", nunca inventar un
// perfil.
export async function leerPerfilOffline(userId) {
  try {
    const db = await abrirDB()
    const registro = await new Promise((resolve, reject) => {
      const tx = db.transaction(ALMACEN, 'readonly')
      const peticion = tx.objectStore(ALMACEN).get(userId)
      peticion.onsuccess = () => resolve(peticion.result ?? null)
      peticion.onerror = () => reject(peticion.error)
    })
    if (!registro) return null
    const expirado = Date.now() - registro.lastSyncedAt > EXPIRACION_MS
    return expirado ? null : registro
  } catch {
    return null
  }
}
