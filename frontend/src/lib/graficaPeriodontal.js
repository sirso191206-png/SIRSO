// Cálculos puros para dibujar la gráfica de zigzag periodontal estándar
// (sondaje vestibular arriba de la numeración, lingual/palatino abajo,
// espejados) — separado del componente React para poder probarlo sin
// necesidad de un entorno de DOM.

export const SITIOS_VESTIBULAR = ['mesial_v', 'medio_v', 'distal_v']
export const SITIOS_LINGUAL = ['mesial_l', 'medio_l', 'distal_l']

// Profundidades clínicamente típicas van de 0 a ~10-12mm — valores
// mayores se acotan visualmente (la gráfica no crece sin límite), pero
// el dato real guardado en la base nunca se altera, solo su dibujo.
export const PROFUNDIDAD_MAX_ESCALA = 12
export const ALTURA_ZONA = 70
export const ANCHO_DIENTE = 54

// mm -> píxeles dentro de una zona de ALTURA_ZONA de alto.
export function alturaPorProfundidad(mm) {
  const valor = Math.max(0, Number(mm) || 0)
  const acotado = Math.min(valor, PROFUNDIDAD_MAX_ESCALA)
  return (acotado / PROFUNDIDAD_MAX_ESCALA) * ALTURA_ZONA
}

function obtenerSitio(pieza, sitio) {
  return pieza?.sitios?.find((s) => s.sitio === sitio) ?? null
}

// Construye los puntos {x, y, profundidad, sangrado, numeroPieza, sitio}
// de una fila completa (superior o inferior) para un lado dado
// (vestibular o lingual). esVestibular=true dibuja con y=0 pegado al
// borde INFERIOR de su zona (cerca de la numeración) creciendo hacia
// arriba; esVestibular=false (lingual) hace lo espejado: y=0 pegado al
// borde SUPERIOR, creciendo hacia abajo. Así, vestibular arriba +
// lingual abajo de la tira de números quedan simétricos entre sí.
export function construirPuntosZigzag(piezas, sitios, esVestibular) {
  const puntos = []
  piezas.forEach((pieza, indicePieza) => {
    sitios.forEach((sitio, indiceSitio) => {
      const sitioData = obtenerSitio(pieza, sitio)
      const profundidad = sitioData?.profundidad_sondaje ?? 0
      const x = indicePieza * ANCHO_DIENTE + (indiceSitio + 0.5) * (ANCHO_DIENTE / SITIOS_VESTIBULAR.length)
      const distancia = alturaPorProfundidad(profundidad)
      const y = esVestibular ? ALTURA_ZONA - distancia : distancia
      puntos.push({
        x,
        y,
        profundidad,
        sangrado: sitioData?.sangrado ?? false,
        placa: sitioData?.placa ?? false,
        calculo: sitioData?.calculo ?? false,
        numeroPieza: pieza?.numero_pieza ?? null,
        indicePieza,
        sitio
      })
    })
  })
  return puntos
}

export function puntosATextoPolilinea(puntos) {
  return puntos.map((p) => `${p.x},${p.y}`).join(' ')
}

// Ancho total de la gráfica para N dientes — usado para el viewBox.
export function anchoTotal(numDientes) {
  return numDientes * ANCHO_DIENTE
}
