// ¿Este error significa "no pude hablar con el servidor" (red caída, DNS,
// timeout) — o significa "el servidor respondió y dijo que no"? La
// diferencia decide qué hacer: un fallo de red es transitorio (seguimos
// offline y reintentamos); un rechazo del servidor (token revocado,
// credenciales inválidas) es definitivo (hay que volver a iniciar sesión).
//
// supabase-js marca los fallos de red con AuthRetryableFetchError; los
// fetch() crudos lanzan TypeError ("Failed to fetch" / "Load failed").
export function esErrorDeRed(error) {
  if (!error) return false
  if (error.name === 'AuthRetryableFetchError' || error.name === 'TypeError') return true
  return /failed to fetch|load failed|network ?error|networkerror/i.test(String(error.message ?? ''))
}
