// ============================================================
// Aplica estado clínico a un mesh real del .glb.
// ------------------------------------------------------------
// Contrato explícito: esta función puede tocar
//   mesh.visible
//   mesh.material.color
//   mesh.material.emissive
//   mesh.material.emissiveIntensity
// y NUNCA
//   mesh.position
//   mesh.rotation
//   mesh.scale
//   mesh.matrix
//
// Separada en su propio archivo (en vez de vivir inline en un
// useEffect) precisamente para poder probar ese contrato de verdad —
// darle un mesh de prueba, llamarla, y comprobar que su transform
// sigue exactamente igual.
// ============================================================

import { evaluarPieza } from './estadoClinico'

/**
 * @param {THREE.Mesh} mesh - el mesh real del diente (de la escena clonada)
 * @param {object|null} pieza - la pieza clínica (de useOdontograma), o null si no existe
 * @param {{ visible: boolean, seleccionada: boolean }} opciones
 *   `visible`: si el diente debe mostrarse según arcoVisible (independiente del estado clínico)
 *   `seleccionada`: si esta pieza es la actualmente seleccionada
 */
export function aplicarEstadoClinico(mesh, pieza, { visible, seleccionada }) {
  if (!pieza || pieza.estado === 'ausente' || !visible) {
    mesh.visible = false
    return
  }

  mesh.visible = true
  const info = evaluarPieza(pieza)
  mesh.material.color.set(info.color)
  if (mesh.material.emissive) {
    mesh.material.emissive.set(seleccionada ? info.color : '#000000')
    mesh.material.emissiveIntensity = seleccionada ? 0.35 : 0
  }
}
