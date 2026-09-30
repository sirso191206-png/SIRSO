// navigator.onLine SOLO dice "el sistema operativo cree que hay una
// interfaz de red activa" — una wifi conectada a un router sin salida
// a internet reporta `true` igual que una con internet de verdad. Para
// decisiones que importan (disparar la sincronización automática, no
// solo pintar un banner) hace falta confirmar contra el propio
// servidor, con límite de tiempo para no colgarse si la red está
// "a medias".
export async function verificarConexionReal(supabase, { tiempoLimiteMs = 5000 } = {}) {
  if (!navigator.onLine) return false
  const controlador = new AbortController()
  let idTimer
  // Carrera explícita contra un timeout propio — no depende únicamente
  // de que abortSignal() logre cancelar la petición de verdad (eso
  // requiere que el fetch subyacente coopere); si la consulta se queda
  // colgada por cualquier motivo, este timeout SIEMPRE gana.
  const limite = new Promise((resolve) => {
    idTimer = setTimeout(() => {
      controlador.abort()
      resolve({ error: new Error('Tiempo de espera agotado') })
    }, tiempoLimiteMs)
  })
  try {
    const { error } = await Promise.race([
      supabase.from('usuarios').select('id').limit(1).abortSignal(controlador.signal),
      limite
    ])
    return !error
  } catch {
    return false
  } finally {
    clearTimeout(idTimer)
  }
}
