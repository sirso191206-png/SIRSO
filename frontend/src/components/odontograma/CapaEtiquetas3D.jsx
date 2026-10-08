import { useFrame } from '@react-three/fiber'
import { proyectarPunto } from './proyeccionEtiquetas'

// Capa de etiquetas (números de pieza y símbolos de estado) sobre el odontograma 3D.
// Son elementos normales del DOM, de UN solo árbol de React, posicionados desde dentro del <Canvas> en cada frame
// escribiendo su `transform` (sin re-renderizar React). Ver proyeccionEtiquetas.js para el porqué.

/** DOM — va FUERA del <Canvas>, encima. `registroRef` (Map clave → elemento) lo lee el proyector. */
export function CapaEtiquetas({ items, registroRef }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true" data-capa-etiquetas="">
      {items.map((item) => (
        <div
          key={item.clave}
          data-etiqueta={item.clave}
          ref={(el) => { if (el) registroRef.current.set(item.clave, el); else registroRef.current.delete(item.clave) }}
          style={{ position: 'absolute', left: 0, top: 0, display: 'none', willChange: 'transform' }}
        >
          {item.children}
        </div>
      ))}
    </div>
  )
}

/** Vive DENTRO del <Canvas>: en cada frame coloca cada etiqueta sobre su punto 3D. */
export function ProyectorEtiquetas({ itemsRef, registroRef }) {
  useFrame(({ camera, size }) => {
    const items = itemsRef.current
    if (!items || items.length === 0) return
    camera.updateMatrixWorld()
    for (const item of items) {
      const el = registroRef.current.get(item.clave)
      if (!el) continue
      const p = proyectarPunto(item.posicion, camera, size.width, size.height, item.distanceFactor)
      if (!p.visible) {
        if (el.style.display !== 'none') el.style.display = 'none'
        continue
      }
      el.style.display = 'block'
      el.style.zIndex = String(p.profundidad)
      el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${p.escala.toFixed(4)})`
    }
  })
  return null
}
