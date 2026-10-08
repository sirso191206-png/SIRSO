// ============================================================
// Odontograma 3D clínico — envoltorio delgado sobre
// OdontogramaGLBScene, la fuente anatómica única (GLB de Blender).
// ------------------------------------------------------------
// Este archivo NO carga el .glb, NO calcula cámara, NO clona la
// escena — todo eso vive en OdontogramaGLBScene.jsx. Aquí solo vive
// lo que es genuinamente clínico: aplicar estado (color/visibilidad)
// sobre los meshes reales, manejar selección/hover, y dibujar
// overlays posicionados con el bounding box real de cada pieza.
// ============================================================

import { useCallback, useMemo, useState } from 'react'
import { OdontogramaGLBScene } from './OdontogramaGLBScene'
import { FILA_SUPERIOR, FILA_INFERIOR } from './constantesOdontograma'
import { aplicarEstadoClinico } from './aplicarEstadoClinico'
import { evaluarPieza } from './estadoClinico'

export function EscenaDental3D({
  piezas,
  piezaSeleccionadaId,
  onSeleccionarPieza,
  arcoVisible,
  vistaCamara,
  mostrarEtiquetas = true,
  onFocusOnToothListo,
  onZoomControlsListo,
  onUsar2D,
}) {
  const [hoverFdi, setHoverFdi] = useState(null)

  const fdiVisibles = useMemo(() => (arcoVisible === 'superior'
    ? new Set(FILA_SUPERIOR)
    : arcoVisible === 'inferior'
      ? new Set(FILA_INFERIOR)
      : new Set([...FILA_SUPERIOR, ...FILA_INFERIOR])), [arcoVisible])

  // Se recrea solo cuando cambia lo que realmente le importa (piezas,
  // selección, arco visible) — OdontogramaGLBScene re-aplica los
  // estados cada vez que esta referencia cambia.
  const aplicarEstadosVisuales = useCallback((nodosPorFdi) => {
    for (const [fdi, mesh] of Object.entries(nodosPorFdi)) {
      const pieza = piezas.find((p) => p.numero_pieza === fdi)
      aplicarEstadoClinico(mesh, pieza, {
        visible: fdiVisibles.has(fdi),
        seleccionada: pieza?.id === piezaSeleccionadaId,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piezas, piezaSeleccionadaId, arcoVisible])

  const onSeleccionFdi = useCallback((fdi) => {
    const pieza = piezas.find((p) => p.numero_pieza === fdi)
    if (pieza) onSeleccionarPieza(pieza)
  }, [piezas, onSeleccionarPieza])

  const piezaSeleccionada = piezas.find((p) => p.id === piezaSeleccionadaId)
  const fdiSeleccionado = piezaSeleccionada?.numero_pieza

  // Anillos de selección / hover: geometría 3D, dentro del Canvas.
  const renderOverlays = (nodosPorFdi, bboxPorFdi) => (
    <>
      {Object.keys(nodosPorFdi).map((fdi) => {
        if (!fdiVisibles.has(fdi)) return null
        const bbox = bboxPorFdi[fdi]
        if (!bbox) return null
        const seleccionada = fdi === fdiSeleccionado
        const enHover = fdi === hoverFdi
        if (!seleccionada && !enHover) return null

        const [cx, cy, cz] = bbox.centro
        const radioAprox = Math.max(bbox.tamano[0], bbox.tamano[2]) / 2

        return (
          <group key={fdi}>
            {seleccionada && (
              <mesh position={[cx, cy - bbox.tamano[1] * 0.35, cz]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[radioAprox * 0.85, radioAprox * 1.05, 32]} />
                <meshBasicMaterial color="#1E5F8C" transparent opacity={0.9} />
              </mesh>
            )}
            {enHover && !seleccionada && (
              <mesh position={[cx, cy - bbox.tamano[1] * 0.35, cz]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[radioAprox * 0.85, radioAprox * 1.0, 32]} />
                <meshBasicMaterial color="#94A3B8" transparent opacity={0.6} />
              </mesh>
            )}
          </group>
        )
      })}
    </>
  )

  // Números de pieza y símbolos de estado: DOM, en UNA sola capa (ver CapaEtiquetas3D.jsx). Antes cada uno era un
  // <Html> de drei con su propio React root — con 64 etiquetas, ~4,200 listeners del DOM fugados en cada apertura.
  const renderEtiquetas = useCallback(({ nodosPorFdi, bboxPorFdi }) => {
    const items = []
    for (const fdi of Object.keys(nodosPorFdi)) {
      if (!fdiVisibles.has(fdi)) continue
      const bbox = bboxPorFdi[fdi]
      if (!bbox) continue
      const pieza = piezas.find((p) => p.numero_pieza === fdi)
      if (!pieza) continue
      const info = evaluarPieza(pieza)
      const seleccionada = fdi === fdiSeleccionado
      const [cx, cy, cz] = bbox.centro
      const radioAprox = Math.max(bbox.tamano[0], bbox.tamano[2]) / 2

      if (info.simbolo) {
        items.push({
          clave: `simbolo-${fdi}`,
          posicion: [cx + radioAprox * 0.6, cy + bbox.tamano[1] * 0.4, cz],
          distanceFactor: 10,
          children: (
            <span className="pointer-events-none select-none text-sm font-bold" style={{ color: info.color }}>
              {info.simbolo}
            </span>
          )
        })
      }
      if (mostrarEtiquetas) {
        items.push({
          clave: `numero-${fdi}`,
          posicion: [cx, cy - bbox.tamano[1] * 0.6, cz],
          distanceFactor: 10,
          children: (
            <span
              className={`pointer-events-none select-none rounded px-1 text-[11px] font-medium ${
                seleccionada ? 'bg-clinico-azul text-white' : 'text-slate-500'
              }`}
            >
              {fdi}
            </span>
          )
        })
      }
    }
    return items
  }, [piezas, fdiVisibles, fdiSeleccionado, mostrarEtiquetas])

  return (
    <OdontogramaGLBScene
      vistaCamara={vistaCamara}
      onSeleccionFdi={onSeleccionFdi}
      onHoverFdi={setHoverFdi}
      renderOverlays={renderOverlays}
      renderEtiquetas={renderEtiquetas}
      onUsar2D={onUsar2D}
      aplicarEstadosVisuales={aplicarEstadosVisuales}
      onListoFocusOnTooth={onFocusOnToothListo}
      onListoControlesZoom={onZoomControlsListo}
    />
  )
}
