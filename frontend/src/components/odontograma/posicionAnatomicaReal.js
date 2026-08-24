// ============================================================
// ⚠ RETIRADA del flujo principal (ronda posterior de correcciones).
// ------------------------------------------------------------
// EscenaDental3D.jsx ya NO usa este archivo: la arquitectura actual
// renderiza la escena del .glb directa vía <primitive object={scene}>
// (ver identificarNodosFdi.js), sin reconstruir la posición de ningún
// diente — ni siquiera con datos reales como hacía este archivo. Se
// conserva (con sus pruebas) por si algún día se necesita un cálculo
// de posición aislado, pero no forma parte del render clínico.
// ------------------------------------------------------------
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
// CORRECCIÓN IMPORTANTE (ronda posterior): este archivo calculaba
// además una rotación Y por tangente entre dientes vecinos, para que
// cada pieza "mirara hacia afuera" siguiendo la curva. Se retiró:
// verificado con datos (PCA de la sección transversal en el plano
// perpendicular al eje corona-raíz) que la ORIENTACIÓN de cada diente
// ya viene horneada en sus vértices crudos — varía de forma real y
// sistemática de una pieza a otra (ej. ~156° en la pieza 18 hasta ~8°
// en la 11), y esa información sobrevive a geometry.center() (que
// solo traslada, nunca rota). Agregar una rotación calculada aparte
// duplicaba una orientación que la geometría ya traía resuelta —
// "double rotation", causando piezas torcidas.
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
 * Dado `nodes` (de useGLTF), calcula { [fdi]: { posicion } } para cada
 * FDI que tenga geometría real — SOLO posición, tomada del centro del
 * bounding box de la geometría ORIGINAL (antes de centrarla),
 * transformada al sistema de ejes de Three.js. Sin ninguna rotación
 * adicional: la orientación de cada pieza ya viene resuelta en sus
 * propios vértices, y la única rotación que le corresponde es
 * ROTACION_BASE_MODELO sobre la malla misma (ver Diente3D.jsx) — el
 * grupo que envuelve la pieza real no debe rotarse.
 */
export function calcularPosicionAnatomicaReal(nodes) {
  const resultado = {}

  for (const fila of [FILA_SUPERIOR_ORDEN, FILA_INFERIOR_ORDEN]) {
    for (const fdi of fila) {
      const nodo = nodes[fdi]
      if (!nodo || !nodo.geometry) continue
      const [x, y, z] = centroDeGeometria(nodo.geometry)
      resultado[fdi] = { posicion: transformarPuntoAEjesThree(x, y, z) }
    }
  }

  return resultado
}

