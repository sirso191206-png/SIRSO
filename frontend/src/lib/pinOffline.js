// PIN local para desbloquear una sesión OFFLINE previamente autenticada.
//
// ══ QUÉ ES ══
// Una llave de pantalla. Cuando no hay internet y el token de Supabase
// ya venció (por defecto dura 1 hora), la app no puede saber quién eres
// sin red. Si antes —con internet y con tu contraseña— activaste un PIN,
// este archivo permite volver a entrar SOLO a tu propia sesión offline:
// ver lo que ya estaba sincronizado y encolar cambios.
//
// ══ QUÉ NO ES ══
// - NO sustituye a Supabase Auth. Con internet, el PIN no da acceso a
//   nada: hace falta una sesión real de Supabase. Al recuperar la red,
//   la sesión se renueva contra el servidor; si el servidor la rechaza,
//   el PIN se revoca y hay que iniciar sesión con contraseña.
// - NO da acceso al servidor. Sin un token válido, RLS rechaza todo.
// - NO cifra los datos clínicos guardados en este equipo. Solo controla
//   el acceso desde la interfaz de SIRO.
//
// ══ MODELO DE AMENAZAS (lee esto antes de confiar en el PIN) ══
// Protege contra: alguien que se sienta en un equipo con SIRO cerrado y
// sin internet y prueba PINs en la pantalla de desbloqueo.
// NO protege contra: alguien con acceso al perfil del navegador (puede
// abrir DevTools, leer IndexedDB —los datos no están cifrados— y borrar
// el contador de intentos), ni contra quien cambie el reloj del equipo
// para saltarse el bloqueo temporal. Un PIN numérico de 6 dígitos tiene
// solo 1 000 000 de combinaciones: ninguna derivación de clave lo
// vuelve resistente a un ataque fuera de línea contra el hash guardado.
// Para eso haría falta cifrar los datos locales con una clave derivada
// del PIN, y eso NO está hecho.
//
// ══ ALMACENAMIENTO ══
// Nunca se guarda el PIN. Se guarda una derivación PBKDF2-HMAC-SHA256
// (600 000 iteraciones, recomendación de OWASP para PBKDF2-SHA256) con
// una sal aleatoria de 16 bytes por PIN. Un solo PIN por equipo.

const DB_NOMBRE = 'siro-pin-offline'
const DB_VERSION = 1
const ALMACEN = 'pin'
const RANURA = 'dispositivo'
const HORA_MS = 60 * 60 * 1000
const ITERACIONES_MINIMAS = 1000 // piso absoluto; solo para poder probar rápido

// Todo lo ajustable vive aquí, en un solo lugar.
export const CONFIG_PIN = Object.freeze({
  iteraciones: 600_000,
  longitudMin: 6,
  longitudMax: 10,
  // Desde el 5.º error seguido, cada error bloquea 15 minutos.
  intentosAntesDeBloqueo: 5,
  bloqueoTemporalMs: 15 * 60 * 1000,
  // Al 10.º error seguido el PIN se revoca: hay que volver a entrar con
  // contraseña, con internet.
  intentosAntesDeRevocar: 10,
  // Cuánto tiempo sin internet sigue valiendo el PIN, contado desde la
  // última vez que la sesión se validó contra el servidor.
  opcionesDuracionHoras: Object.freeze([8, 24, 72, 168]),
  duracionPorDefectoHoras: 72
})

// ─── Persistencia ───────────────────────────────────────────────────────
function abrirDB() {
  return new Promise((resolve, reject) => {
    const peticion = indexedDB.open(DB_NOMBRE, DB_VERSION)
    peticion.onupgradeneeded = () => {
      const db = peticion.result
      if (!db.objectStoreNames.contains(ALMACEN)) db.createObjectStore(ALMACEN, { keyPath: 'ranura' })
    }
    peticion.onsuccess = () => resolve(peticion.result)
    peticion.onerror = () => reject(peticion.error)
  })
}

async function leerRegistro() {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const peticion = db.transaction(ALMACEN, 'readonly').objectStore(ALMACEN).get(RANURA)
    peticion.onsuccess = () => resolve(peticion.result ?? null)
    peticion.onerror = () => reject(peticion.error)
  })
}

async function escribirRegistro(registro) {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readwrite')
    tx.objectStore(ALMACEN).put({ ...registro, ranura: RANURA })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function borrarRegistro() {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readwrite')
    tx.objectStore(ALMACEN).delete(RANURA)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// Las operaciones que leen-y-luego-escriben el contador de intentos se
// ejecutan una a la vez: si no, dos verificaciones simultáneas leerían el
// mismo contador y una "se comería" un intento fallido.
let turno = Promise.resolve()
function enSerie(tarea) {
  const resultado = turno.then(tarea, tarea)
  turno = resultado.catch(() => {})
  return resultado
}

// ─── Utilidades criptográficas ──────────────────────────────────────────
const aBase64 = (bytes) => btoa(String.fromCharCode(...bytes))
const deBase64 = (texto) => Uint8Array.from(atob(texto), (c) => c.charCodeAt(0))

// Compara sin salir en el primer byte distinto, para que el tiempo que
// tarda no revele cuántos bytes coincidían.
export function igualesEnTiempoConstante(a, b) {
  if (a.length !== b.length) return false
  let diferencia = 0
  for (let i = 0; i < a.length; i++) diferencia |= a[i] ^ b[i]
  return diferencia === 0
}

async function derivar(pin, sal, iteraciones) {
  const material = await globalThis.crypto.subtle.importKey(
    'raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']
  )
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteraciones }, material, 256
  )
  return new Uint8Array(bits)
}

const hayCripto = () => !!globalThis.crypto?.subtle

// ─── Validación del formato ─────────────────────────────────────────────
function esPrevisible(pin) {
  if (/^(\d)\1+$/.test(pin)) return true // 000000, 111111
  const digitos = [...pin].map(Number)
  const pasos = digitos.slice(1).map((d, i) => d - digitos[i])
  if (pasos.every((p) => p === 1) || pasos.every((p) => p === -1)) return true // 123456, 654321
  // Patrones cortos repetidos: 121212, 123123, 112112
  for (let periodo = 1; periodo <= 3; periodo++) {
    if (pin.length % periodo === 0 && pin === pin.slice(0, periodo).repeat(pin.length / periodo)) return true
  }
  return false
}

export function validarFormatoPin(pin) {
  if (typeof pin !== 'string' || !/^\d+$/.test(pin)) return { valido: false, motivo: 'SOLO_DIGITOS' }
  if (pin.length < CONFIG_PIN.longitudMin) return { valido: false, motivo: 'MUY_CORTO' }
  if (pin.length > CONFIG_PIN.longitudMax) return { valido: false, motivo: 'MUY_LARGO' }
  if (esPrevisible(pin)) return { valido: false, motivo: 'MUY_PREVISIBLE' }
  return { valido: true }
}

// ─── Configurar ─────────────────────────────────────────────────────────
// Solo debe llamarse con una sesión REAL de Supabase y con internet
// (lo exige useAuthStore, que es quien la invoca).
export function configurarPin(userId, pin, { duracionHoras = CONFIG_PIN.duracionPorDefectoHoras, iteraciones = CONFIG_PIN.iteraciones } = {}) {
  return enSerie(async () => {
    if (!hayCripto()) return { ok: false, motivo: 'SIN_CRIPTO' }
    const formato = validarFormatoPin(pin)
    if (!formato.valido) return { ok: false, motivo: formato.motivo }
    if (!CONFIG_PIN.opcionesDuracionHoras.includes(duracionHoras)) return { ok: false, motivo: 'DURACION_INVALIDA' }

    const iter = Math.max(iteraciones, ITERACIONES_MINIMAS)
    const sal = globalThis.crypto.getRandomValues(new Uint8Array(16))
    const hash = await derivar(pin, sal, iter)
    const ahora = Date.now()

    await escribirRegistro({
      userId,
      version: 1,
      algoritmo: 'PBKDF2-SHA256',
      iteraciones: iter,
      sal: aBase64(sal),
      hash: aBase64(hash),
      creadoEn: ahora,
      validadoEn: ahora,
      duracionHoras,
      intentosFallidos: 0,
      bloqueadoHasta: null
    })
    return { ok: true, expiraEn: ahora + duracionHoras * HORA_MS }
  })
}

// ─── Consultar (nunca devuelve sal ni hash) ─────────────────────────────
export async function obtenerEstadoPin(userId) {
  const r = await leerRegistro()
  if (!r || r.userId !== userId) return { configurado: false }
  const expiraEn = r.validadoEn + r.duracionHoras * HORA_MS
  return {
    configurado: true,
    expirado: Date.now() > expiraEn,
    duracionHoras: r.duracionHoras,
    expiraEn,
    intentosFallidos: r.intentosFallidos,
    bloqueadoHasta: r.bloqueadoHasta
  }
}

// ¿Hay un PIN utilizable ahora mismo en este equipo? Lo usa el arranque
// para decidir si ofrecer la pantalla de desbloqueo. Null si no hay PIN
// o ya venció su vigencia.
export async function obtenerPinDisponible() {
  const r = await leerRegistro()
  if (!r) return null
  const duracionMs = r.duracionHoras * HORA_MS
  if (Date.now() > r.validadoEn + duracionMs) return null
  return { userId: r.userId, duracionMs, expiraEn: r.validadoEn + duracionMs, bloqueadoHasta: r.bloqueadoHasta }
}

// ─── Verificar ──────────────────────────────────────────────────────────
// Resultados:
//   { ok: true }
//   { ok: false, motivo: 'SIN_PIN' }
//   { ok: false, motivo: 'EXPIRADO' }
//   { ok: false, motivo: 'BLOQUEADO_TEMPORAL', bloqueadoHasta }
//   { ok: false, motivo: 'PIN_INCORRECTO', intentosRestantes, bloqueadoHasta? }
//   { ok: false, motivo: 'REVOCADO_POR_INTENTOS' }
export function verificarPin(userId, pin) {
  return enSerie(async () => {
    const r = await leerRegistro()
    if (!r || r.userId !== userId) return { ok: false, motivo: 'SIN_PIN' }

    const ahora = Date.now()
    if (ahora > r.validadoEn + r.duracionHoras * HORA_MS) return { ok: false, motivo: 'EXPIRADO' }
    if (r.bloqueadoHasta && ahora < r.bloqueadoHasta) {
      return { ok: false, motivo: 'BLOQUEADO_TEMPORAL', bloqueadoHasta: r.bloqueadoHasta }
    }

    // El intento se cuenta y se GUARDA antes de verificar. Así, cerrar la
    // pestaña o que falle algo a mitad de la derivación no regala un
    // intento gratis: solo un acierto lo devuelve a cero.
    const intentos = r.intentosFallidos + 1
    await escribirRegistro({ ...r, intentosFallidos: intentos })

    const derivado = await derivar(String(pin), deBase64(r.sal), r.iteraciones)
    if (igualesEnTiempoConstante(derivado, deBase64(r.hash))) {
      await escribirRegistro({ ...r, intentosFallidos: 0, bloqueadoHasta: null })
      return { ok: true }
    }

    if (intentos >= CONFIG_PIN.intentosAntesDeRevocar) {
      await borrarRegistro()
      return { ok: false, motivo: 'REVOCADO_POR_INTENTOS' }
    }

    let bloqueadoHasta = null
    if (intentos >= CONFIG_PIN.intentosAntesDeBloqueo) {
      bloqueadoHasta = ahora + CONFIG_PIN.bloqueoTemporalMs
      await escribirRegistro({ ...r, intentosFallidos: intentos, bloqueadoHasta })
    }
    const intentosRestantes = intentos < CONFIG_PIN.intentosAntesDeBloqueo
      ? CONFIG_PIN.intentosAntesDeBloqueo - intentos
      : CONFIG_PIN.intentosAntesDeRevocar - intentos
    return { ok: false, motivo: 'PIN_INCORRECTO', intentosRestantes, ...(bloqueadoHasta ? { bloqueadoHasta } : {}) }
  })
}

// ─── Cambiar y revocar ──────────────────────────────────────────────────
// Cambiar exige el PIN actual: quien encuentre la sesión abierta no puede
// reemplazarlo en silencio por uno suyo.
export async function cambiarPin(userId, pinActual, pinNuevo, opciones = {}) {
  if (pinActual === pinNuevo) return { ok: false, motivo: 'IGUAL_AL_ACTUAL' }
  const actual = await verificarPin(userId, pinActual)
  if (!actual.ok) return actual
  const estado = await obtenerEstadoPin(userId)
  return configurarPin(userId, pinNuevo, { duracionHoras: estado.duracionHoras, ...opciones })
}

// Revoca sin pedir el PIN — es la salida para "olvidé mi PIN". Solo se
// ofrece con sesión real y con internet.
export function revocarPin() {
  return enSerie(() => borrarRegistro())
}

// ─── Ventana de vigencia ────────────────────────────────────────────────
// Se llama cada vez que la app confirma la sesión contra el servidor
// (con internet): desliza la vigencia. Y si quien acaba de iniciar sesión
// es OTRA persona, el PIN de la anterior se elimina.
export function registrarValidacionOnline(userId) {
  return enSerie(async () => {
    const r = await leerRegistro()
    if (!r) return
    if (r.userId !== userId) return borrarRegistro()
    await escribirRegistro({ ...r, validadoEn: Date.now() })
  })
}
