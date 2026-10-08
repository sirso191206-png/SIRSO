// fetch con TIEMPO MÁXIMO de espera para todas las peticiones a Supabase (REST, Auth, Storage, Edge Functions). Sin
// esto, un servidor que no responde deja la pantalla esperando indefinidamente (con un wifi "conectado" que no sale a
// Internet, la petición nunca falla ni termina). Al agotarse lanza un TimeoutError, que lib/errorDeRed.js trata como
// error de red: la cola offline reintenta y la pantalla muestra un mensaje claro.
//   * Peticiones normales: 30 s.   * Subidas de archivos (Storage): 120 s (un archivo grande en una red lenta).
// Respeta la señal de cancelación que ya traiga la petición.
export const TIEMPO_MAX_MS = 30000
export const TIEMPO_MAX_SUBIDA_MS = 120000

function esSubida(url, metodo) {
  return /\/storage\/v1\/object\//.test(url) && metodo !== 'GET' && metodo !== 'HEAD'
}

export function crearFetchConTimeout({ fetchBase = (...args) => fetch(...args), ms = TIEMPO_MAX_MS, msSubida = TIEMPO_MAX_SUBIDA_MS } = {}) {
  return function fetchConTimeout(entrada, init = {}) {
    const url = typeof entrada === 'string' ? entrada : (entrada?.url ?? String(entrada))
    const metodo = String(init.method ?? entrada?.method ?? 'GET').toUpperCase()
    const limite = esSubida(url, metodo) ? msSubida : ms
    const control = new AbortController()
    const externa = init.signal ?? entrada?.signal
    if (externa) {
      if (externa.aborted) control.abort(externa.reason)
      else externa.addEventListener('abort', () => control.abort(externa.reason), { once: true })
    }
    const temporizador = setTimeout(() => {
      const error = new Error(`Tiempo de espera agotado (${Math.round(limite / 1000)} s) al hablar con el servidor.`)
      error.name = 'TimeoutError'
      control.abort(error)
    }, limite)
    return fetchBase(entrada, { ...init, signal: control.signal }).finally(() => clearTimeout(temporizador))
  }
}
