// Programa revisiones automáticas en segundo plano: cada `intervaloMs` y cada vez que la
// pestaña vuelve a estar visible. Es lo que permite que SIRO deje listos los datos para
// trabajar sin internet SIN que nadie tenga que pulsar nada. `intentar` decide por sí
// misma si hace falta trabajar (es barata cuando no hace falta). Devuelve la función que
// cancela todo (se llama al desmontar o al cambiar de sesión).
export function programarRevisiones(intentar, { intervaloMs, doc = typeof document !== 'undefined' ? document : null } = {}) {
  const alVolver = () => {
    if (doc?.visibilityState === 'visible') intentar()
  }
  doc?.addEventListener?.('visibilitychange', alVolver)
  const id = setInterval(intentar, intervaloMs)
  return () => {
    clearInterval(id)
    doc?.removeEventListener?.('visibilitychange', alVolver)
  }
}
