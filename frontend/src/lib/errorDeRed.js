// ¿Este error significa "no pude hablar con el servidor" (red caída, DNS, timeout) — o significa "el servidor
// respondió y dijo que no"? La diferencia decide qué hacer: un fallo de red es transitorio (seguimos offline y
// reintentamos); un rechazo del servidor (token revocado, credenciales inválidas, RLS) es definitivo.
//
// supabase-js marca los fallos de red con AuthRetryableFetchError; los fetch() crudos lanzan TypeError
// ("Failed to fetch" / "Load failed"); y la espera máxima de lib/fetchConTimeout.js lanza TimeoutError.
const NOMBRES_DE_RED = ['AuthRetryableFetchError', 'TypeError', 'TimeoutError', 'AbortError']

export function esErrorDeRed(error) {
  if (!error) return false
  if (NOMBRES_DE_RED.includes(error.name)) return true
  return /failed to fetch|load failed|network ?error|networkerror|tiempo de espera|timed? ?out/i.test(String(error.message ?? ''))
}

// El servidor SÍ respondió, pero no puede atender en este momento (5xx). Es transitorio: reintentar tiene sentido.
// Un 4xx (permisos, datos inválidos) NO lo es: repetirlo da el mismo resultado.
export function esErrorDeServidor(error) {
  if (!error) return false
  const estado = Number(error.status ?? error.statusCode ?? error.code)
  if (Number.isFinite(estado) && estado >= 500 && estado < 600) return true
  return /service unavailable|bad gateway|gateway time-?out|upstream|temporarily unavailable/i.test(String(error.message ?? ''))
}

// Texto para la persona (nunca el mensaje técnico del servidor).
export function mensajeErrorDeCarga(error, recurso = 'la información') {
  if (esErrorDeRed(error)) return `No se pudo cargar ${recurso}: no hay conexión o el servidor tardó demasiado en responder.`
  if (esErrorDeServidor(error)) return `El servidor no está disponible en este momento, así que no se pudo cargar ${recurso}. Intenta de nuevo en unos segundos.`
  return `No se pudo cargar ${recurso}.`
}
