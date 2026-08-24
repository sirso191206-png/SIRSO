// ============================================================
// GLB NODE → FDI — única fuente para saber qué objeto de la escena
// representa cada diente.
// ------------------------------------------------------------
// Auditado con GLTFLoader real (no un parseo manual): los 32 meshes
// son hijos DIRECTOS de "Scene" (sin jerarquía anidada), nombrados
// exactamente por su número FDI ("11".."48"), sin duplicados.
// ============================================================

export const FDI_ESPERADOS = [
  11, 12, 13, 14, 15, 16, 17, 18,
  21, 22, 23, 24, 25, 26, 27, 28,
  31, 32, 33, 34, 35, 36, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48,
]

/**
 * Dado UN objeto de la escena (el que sea — un mesh, un grupo, etc.),
 * determina su FDI a partir de su nombre — que es la única
 * información que el .glb ya trae para identificarlo (no se inventa
 * ninguna posición ni jerarquía para deducirlo). Devuelve el FDI como
 * string, o null si el objeto no corresponde a ningún diente.
 */
export function getFDIFromObject(object) {
  if (!object || !object.name) return null
  const nombre = object.name
  return FDI_ESPERADOS.includes(Number(nombre)) ? nombre : null
}

/**
 * Recorre una escena (Object3D — la escena del .glb o un clon de ella)
 * y devuelve { [fdi]: Object3D } — el mesh real que representa cada
 * diente, tal cual está en la escena (misma posición/rotación/escala,
 * nada recalculado).
 *
 * Valida duplicados: si dos meshes tuvieran el mismo nombre FDI, lanza
 * un error explícito en vez de quedarse silenciosamente con el
 * último — mejor fallar ruidoso que reconstruir mal una arcada.
 */
export function identificarNodosPorFdi(escena) {
  const nodosPorFdi = {}
  const vistos = new Set()

  escena.traverse((obj) => {
    if (!obj.isMesh) return
    const fdi = getFDIFromObject(obj)
    if (!fdi) return

    if (vistos.has(fdi)) {
      throw new Error(`identificarNodosPorFdi: FDI duplicado en la escena — "${fdi}" aparece más de una vez.`)
    }
    vistos.add(fdi)
    nodosPorFdi[fdi] = obj
  })

  return nodosPorFdi
}
