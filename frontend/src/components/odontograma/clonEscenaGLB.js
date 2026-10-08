// Clonado y liberación de la escena del odontograma. Módulo puro (solo objetos de three, sin React ni WebGL): se prueba
// sin navegador y no arrastra @react-three/fiber.

/** Clona la escena con un material Y una geometría INDEPENDIENTES por mesh — para que quien pinte estados clínicos
 * nunca mute la escena compartida que cachea useGLTF, y para que cada montaje sea dueño de TODO lo que crea.
 *
 * Por qué también la geometría: la primera vez que un renderer dibuja una geometría, three le agrega un listener
 * "dispose" que captura ese renderer (con su contexto GL y su canvas). Si la geometría es la compartida y cacheada de
 * useGLTF —que vive todo el tiempo de la sesión y nunca se libera— cada visita al 3D dejaba un renderer completo
 * enganchado a ella para siempre (medido en un navegador real con un análisis del heap). Con una copia por montaje,
 * liberarClonEscena() la dispone al desmontar, three quita su listener y el renderer queda libre para el recolector.
 * La copia es de CPU (~1 MB), transitoria. */
export function clonarEscenaGLB(scene) {
  const clon = scene.clone(true)
  clon.traverse((obj) => {
    if (!obj.isMesh) return
    obj.material = obj.material.clone()
    obj.geometry = obj.geometry.clone()
  })
  return clon
}

/** Libera TODO lo que clonarEscenaGLB creó (materiales y geometrías de este montaje). La escena original que cachea
 * useGLTF no se toca: nunca se dibuja, así que nada de ella está atado a un renderer. */
export function liberarClonEscena(clon) {
  if (!clon) return
  clon.traverse((obj) => {
    if (!obj.isMesh) return
    obj.geometry?.dispose?.()
    for (const material of [].concat(obj.material ?? [])) material.dispose?.()
  })
}
