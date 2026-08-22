// ============================================================
// Encuadre de cámara calculado desde el tamaño REAL de la escena.
// ------------------------------------------------------------
// Antes, VISTAS_CAMARA tenía posiciones fijas ([0,0.35,4.2], etc.),
// adivinadas para la geometría placeholder anterior — mucho más chica
// que el modelo real (bounding box real medido: ancho 6.58, alto
// 5.54, profundo 5.62 unidades Blender, contra lo que asumía la
// cámara vieja). Por eso el modelo real se veía gigante/cortado.
// ============================================================

function normalizar([x, y, z]) {
  const largo = Math.sqrt(x * x + y * y + z * z) || 1
  return [x / largo, y / largo, z / largo]
}

/**
 * Calcula la posición de cámara y el target necesarios para encuadrar
 * completamente una caja (centro + tamaño) vista desde una dirección
 * dada (vector unitario o no, se normaliza). Asume una dirección de
 * vista aproximadamente alineada a un eje (como lo son las 3 vistas:
 * frontal≈Z, oclusal≈Y, lateral≈X) — válido para este caso de uso,
 * no pretende ser una cámara arbitraria en cualquier ángulo.
 */
export function calcularEncuadreCamara({ centro, tamano, direccion, fovGrados, aspect = 1.4, margen = 1.3 }) {
  const fovVerticalRad = (fovGrados * Math.PI) / 180
  const fovHorizontalRad = 2 * Math.atan(Math.tan(fovVerticalRad / 2) * aspect)

  const dir = normalizar(direccion)
  const ejePrincipal = [Math.abs(dir[0]), Math.abs(dir[1]), Math.abs(dir[2])]
  const idxPrincipal = ejePrincipal.indexOf(Math.max(...ejePrincipal))
  const [idxA, idxB] = [0, 1, 2].filter((i) => i !== idxPrincipal)

  // idxB se trata como "vertical" en pantalla (encaja con FOV vertical),
  // idxA como "horizontal" (encaja con FOV horizontal).
  const alturaVisible = tamano[idxB]
  const anchoVisible = tamano[idxA]

  const distanciaPorAltura = alturaVisible / 2 / Math.tan(fovVerticalRad / 2)
  const distanciaPorAncho = anchoVisible / 2 / Math.tan(fovHorizontalRad / 2)
  const distancia = Math.max(distanciaPorAltura, distanciaPorAncho) * margen

  const posicion = [
    centro[0] + dir[0] * distancia,
    centro[1] + dir[1] * distancia,
    centro[2] + dir[2] * distancia,
  ]

  return { posicion, target: [...centro], distancia }
}

/**
 * Calcula las 4 vistas (restablecer/frontal/oclusal/lateral) a partir
 * del centro y tamaño reales de la escena — reemplaza los valores
 * fijos de VISTAS_CAMARA cuando hay geometría real cargada.
 */
export function calcularVistasCamara({ centro, tamano, fovGrados = 40, aspect = 1.4 }) {
  const base = (direccion, margen) => calcularEncuadreCamara({ centro, tamano, direccion, fovGrados, aspect, margen })

  const frontal = base([0, 0, 1], 1.3)
  const oclusal = base([0, 1, 0.001], 1.25) // pequeño componente en Z para evitar gimbal-lock exacto en OrbitControls
  const lateral = base([1, 0, 0], 1.3)

  return {
    restablecer: frontal,
    ambas: frontal,
    frontal,
    oclusal,
    lateral,
    // "superior"/"inferior" (mitad de cada arcada) — reencuadran sobre
    // la mitad superior/inferior de la caja completa, no sobre valores
    // fijos.
    superior: base([0, 0.35, 1], 1.35),
    inferior: base([0, -0.35, 1], 1.35),
  }
}
