// ============================================================
// Posición anatómica REAL — derivada directo del .glb, no de una
// curva sintética independiente.
// ------------------------------------------------------------
// HALLAZGO (con datos, ver informe de diagnóstico): configuracionDental.js
// calcula su propia elipse sintética, que NO corresponde a la
// disposición real que ya trae el modelo de Blender. La diferencia
// entre el centro real de cada diente y la posición sintética llega
// hasta 5.19 unidades en la arcada inferior — más que el ancho total
// del arco — porque el ORDEN del arreglo FILA_INFERIOR coloca esa
// arcada con los lados izquierdo/derecho invertidos respecto al
// modelo real (confirmado: en el .glb, 41 y 48 caen del lado X
// positivo; en la curva sintética, del lado negativo).
//
// Se verificó también que las posiciones reales trazan una curva
// suave y sin saltos anómalos (distancias entre dientes consecutivos
// entre 0.5 y 1.1 unidades, sin outliers) — es una arcada real
// coherente, no datos desordenados.
//
// configuracionDental.js NO se modifica — sigue siendo el respaldo
// para cualquier pieza que use geometría placeholder (FDI sin
// geometría real en el .glb).
// ============================================================

const FILA_SUPERIOR_ORDEN = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28']
const FILA_INFERIOR_ORDEN = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38']

/**
 * rotationX=+90° aplicado a un punto: (x,y,z) -> (x,-z,y). Mismo signo
 * ya verificado con datos en ROTACION_BASE_MODELO (Diente3D.jsx) —
 * ambas correcciones deben usar exactamente la misma transformación,
 * por eso se centraliza aquí en vez de reimplementarla dos veces.
 */
export function transformarPuntoAEjesThree(x, y, z) {
  return [x, -z, y]
}

function centroDeGeometria(geometry) {
  geometry.computeBoundingBox()
  const bb = geometry.boundingBox
  return [
    (bb.min.x + bb.max.x) / 2,
    (bb.min.y + bb.max.y) / 2,
    (bb.min.z + bb.max.z) / 2,
  ]
}

/**
 * Dado `nodes` (de useGLTF), calcula { [fdi]: { posicion, rotacion } }
 * para cada FDI que tenga geometría real. La rotación es la tangente
 * entre este diente y su vecino más cercano en la misma arcada (el
 * siguiente, o el anterior si es la última pieza de la fila) — para
 * que cada pieza "mire hacia afuera" siguiendo la curvatura REAL del
 * arco, no una curvatura inventada.
 */
export function calcularPosicionAnatomicaReal(nodes) {
  const resultado = {}

  for (const fila of [FILA_SUPERIOR_ORDEN, FILA_INFERIOR_ORDEN]) {
    const centros = fila.map((fdi) => {
      const nodo = nodes[fdi]
      if (!nodo || !nodo.geometry) return null
      const [x, y, z] = centroDeGeometria(nodo.geometry)
      return transformarPuntoAEjesThree(x, y, z)
    })

    fila.forEach((fdi, i) => {
      const centro = centros[i]
      if (!centro) return
      const [x, y, z] = centro

      const vecino = centros[i + 1] ?? centros[i - 1]
      let angulo = 0
      if (vecino) {
        const dx = vecino[0] - x
        const dz = vecino[2] - z
        angulo = Math.atan2(dx, dz)
      }

      resultado[fdi] = { posicion: [x, y, z], rotacion: [0, angulo, 0] }
    })
  }

  return resultado
}
