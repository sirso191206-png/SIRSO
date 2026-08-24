// ============================================================
// OdontogramaGLBScene — la ÚNICA forma de cargar y mostrar la escena
// de odontograma.glb en todo el proyecto.
// ------------------------------------------------------------
// Usado por: EscenaDental3D.jsx (odontograma clínico real).
//
// Antes existían DOS implementaciones separadas de "cargar el glb +
// calcular cámara" — una para una prueba de referencia (ya retirada,
// cumplió su objetivo de validar que el .glb se veía correcto), otra
// para lo clínico. Aunque tuvieran los mismos números, nada
// garantizaba que siguieran iguales para siempre; un cambio futuro en
// una y no en la otra las habría hecho divergir sin que nadie lo
// notara hasta verlo en pantalla. Con un solo componente compartido,
// eso es estructuralmente imposible — por eso se conserva esta
// arquitectura aunque la prueba que la motivó ya no exista.
//
// Este componente NO sabe nada de estados clínicos — solo carga,
// identifica FDI, y expone hooks para que quien lo use (interactivo o
// no) decida qué hacer con cada mesh. La escena SIEMPRE se clona
// (position/rotation/scale/geometry preservados exactos — un clone()
// de Three.js no los altera) para nunca mutar la copia cacheada por
// useGLTF.
// ============================================================

import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import { Box3, Vector3 } from 'three'
import { identificarNodosPorFdi, getFDIFromObject } from './identificarNodosFdi'
import { calcularVistasCamara } from './calcularEncuadreCamara'

export const RUTA_MODELO_ODONTOGRAMA = '/models/odontograma.glb'
export const FOV_GRADOS_ODONTOGRAMA = 40

useGLTF.preload(RUTA_MODELO_ODONTOGRAMA)

/** Clona la escena con un material INDEPENDIENTE por mesh — para que
 * quien pinte estados clínicos nunca mute la escena compartida que
 * cachea useGLTF (la misma que usa la prueba de referencia). */
export function clonarEscenaGLB(scene) {
  const clon = scene.clone(true)
  clon.traverse((obj) => {
    if (obj.isMesh) obj.material = obj.material.clone()
  })
  return clon
}

function AnimadorCamara({ vistaObjetivo, controlsRef, vistasCamara }) {
  const { camera } = useThree()
  const inicio = useRef({ pos: new Vector3(), target: new Vector3() })
  const fin = useRef({ pos: new Vector3(), target: new Vector3() })
  const progreso = useRef(1)
  const DURACION = 0.3

  useEffect(() => {
    const destino = vistasCamara[vistaObjetivo] ?? vistasCamara.restablecer
    inicio.current.pos.copy(camera.position)
    inicio.current.target.copy(controlsRef.current?.target ?? new Vector3())
    fin.current.pos.set(...destino.posicion)
    fin.current.target.set(...destino.target)
    progreso.current = 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vistaObjetivo, vistasCamara])

  useFrame((_, delta) => {
    if (progreso.current >= 1) return
    progreso.current = Math.min(1, progreso.current + delta / DURACION)
    const t = 1 - Math.pow(1 - progreso.current, 3)
    camera.position.lerpVectors(inicio.current.pos, fin.current.pos, t)
    if (controlsRef.current) {
      controlsRef.current.target.lerpVectors(inicio.current.target, fin.current.target, t)
      controlsRef.current.update()
    }
  })

  return null
}

/**
 * Vive DENTRO del <Canvas> — carga+clona la escena, calcula cámara e
 * identificación FDI, y delega toda decisión "qué hacer con cada
 * mesh" a quien use el componente, vía props (render prop / callbacks).
 */
function EscenaInterna({
  vistaCamara,
  onSeleccionFdi,
  onHoverFdi,
  renderOverlays,
  aplicarEstadosVisuales,
  onListoFocusOnTooth,
  onListoControlesZoom,
}) {
  const { scene } = useGLTF(RUTA_MODELO_ODONTOGRAMA)
  const { camera } = useThree()
  const controlsRef = useRef()

  const escenaClonada = useMemo(() => clonarEscenaGLB(scene), [scene])
  const nodosPorFdi = useMemo(() => identificarNodosPorFdi(escenaClonada), [escenaClonada])

  // Bounding box mundial de cada pieza — para overlays, nunca para
  // reposicionar nada.
  const bboxPorFdi = useMemo(() => {
    const resultado = {}
    for (const [fdi, mesh] of Object.entries(nodosPorFdi)) {
      mesh.updateWorldMatrix(true, false)
      const caja = new Box3().setFromObject(mesh)
      const centro = new Vector3()
      const tam = new Vector3()
      caja.getCenter(centro)
      caja.getSize(tam)
      resultado[fdi] = { centro: centro.toArray(), tamano: tam.toArray() }
    }
    return resultado
  }, [nodosPorFdi])

  // Cámara — SIEMPRE Box3.setFromObject sobre la escena COMPLETA
  // clonada. Ni la prueba ni lo clínico calculan esto de otra forma.
  const { centro, tamano, distanciaModelo } = useMemo(() => {
    const caja = new Box3().setFromObject(escenaClonada)
    const c = new Vector3()
    const t = new Vector3()
    caja.getCenter(c)
    caja.getSize(t)
    return { centro: c.toArray(), tamano: t.toArray(), distanciaModelo: Math.max(t.x, t.y, t.z) }
  }, [escenaClonada])

  const vistasCamara = useMemo(
    () => calcularVistasCamara({ centro, tamano, fovGrados: FOV_GRADOS_ODONTOGRAMA }),
    [centro, tamano]
  )

  const focusOnTooth = useMemo(() => {
    return function focusOnTooth(fdi, { margen = 2.5, duracionMs = 400 } = {}) {
      const bbox = bboxPorFdi[String(fdi)]
      if (!bbox) return
      const tamanoMax = Math.max(...bbox.tamano)
      const distancia = (tamanoMax / 2 / Math.tan((FOV_GRADOS_ODONTOGRAMA * Math.PI) / 360)) * margen
      const dirActual = camera.position.clone().sub(controlsRef.current?.target ?? new Vector3()).normalize()
      const centroVec = new Vector3(...bbox.centro)
      const posicionFinal = centroVec.clone().addScaledVector(dirActual, distancia)
      const inicioPos = camera.position.clone()
      const inicioTarget = (controlsRef.current?.target ?? new Vector3()).clone()
      const t0 = performance.now()
      function paso() {
        const t = Math.min(1, (performance.now() - t0) / duracionMs)
        const suave = 1 - Math.pow(1 - t, 3)
        camera.position.lerpVectors(inicioPos, posicionFinal, suave)
        if (controlsRef.current) {
          controlsRef.current.target.lerpVectors(inicioTarget, centroVec, suave)
          controlsRef.current.update()
        }
        if (t < 1) requestAnimationFrame(paso)
      }
      requestAnimationFrame(paso)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bboxPorFdi])

  useEffect(() => { onListoFocusOnTooth?.(focusOnTooth) }, [focusOnTooth, onListoFocusOnTooth])

  const controlesZoom = useMemo(() => {
    const zoomPorFactor = (factor) => {
      if (!controlsRef.current) return
      const target = controlsRef.current.target
      const offset = camera.position.clone().sub(target)
      const min = distanciaModelo * 0.1
      const max = distanciaModelo * 5
      const nuevaDistancia = Math.min(max, Math.max(min, offset.length() * factor))
      offset.setLength(nuevaDistancia)
      camera.position.copy(target).add(offset)
      controlsRef.current.update()
    }
    return { zoomIn: () => zoomPorFactor(0.8), zoomOut: () => zoomPorFactor(1.25) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distanciaModelo])

  useEffect(() => { onListoControlesZoom?.(controlesZoom) }, [controlesZoom, onListoControlesZoom])

  // Estados clínicos: si se provee la función, se llama una vez que
  // la identificación FDI está lista. Este componente NO sabe qué
  // hace esa función — solo le entrega los meshes reales.
  useEffect(() => {
    aplicarEstadosVisuales?.(nodosPorFdi)
  }, [nodosPorFdi, aplicarEstadosVisuales])

  const handleClick = onSeleccionFdi
    ? (e) => { e.stopPropagation(); const fdi = getFDIFromObject(e.object); if (fdi) onSeleccionFdi(fdi) }
    : undefined
  const handleOver = onHoverFdi
    ? (e) => { e.stopPropagation(); const fdi = getFDIFromObject(e.object); if (fdi) onHoverFdi(fdi) }
    : undefined
  const handleOut = onHoverFdi ? () => onHoverFdi(null) : undefined

  return (
    <>
      <primitive object={escenaClonada} onClick={handleClick} onPointerOver={handleOver} onPointerOut={handleOut} />

      {renderOverlays?.(nodosPorFdi, bboxPorFdi)}

      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.15}
        enablePan={false}
        minDistance={distanciaModelo * 0.1}
        maxDistance={distanciaModelo * 5}
        minPolarAngle={Math.PI * 0.05}
        maxPolarAngle={Math.PI * 0.95}
        target={vistasCamara.restablecer.target}
      />
      <AnimadorCamara vistaObjetivo={vistaCamara} controlsRef={controlsRef} vistasCamara={vistasCamara} />
    </>
  )
}

/**
 * El <Canvas> completo, listo para usarse. `vistaCamara` acepta
 * 'restablecer' | 'frontal' | 'oclusal' | 'lateral'. El resto de props
 * son opcionales — sin ellas, se comporta exactamente como la prueba
 * de referencia (solo anatomía, sin interacción ni estados).
 */
export function OdontogramaGLBScene({
  vistaCamara = 'restablecer',
  onSeleccionFdi,
  onHoverFdi,
  renderOverlays,
  aplicarEstadosVisuales,
  onListoFocusOnTooth,
  onListoControlesZoom,
}) {
  return (
    <Canvas shadows={false} camera={{ position: [0, 0, 10], fov: FOV_GRADOS_ODONTOGRAMA }} dpr={[1, 1.5]}>
      <color attach="background" args={['#F8FAFC']} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[2.5, 4, 3]} intensity={0.6} />
      <directionalLight position={[-2.5, -1.5, 2]} intensity={0.25} />

      {/* Suspense AQUÍ (no en cada consumidor) — así ninguno de los
          dos usos (prueba directa / odontograma clínico) puede
          olvidarse de envolverlo, ni divergir en cómo lo hace. */}
      <Suspense fallback={null}>
        <EscenaInterna
          vistaCamara={vistaCamara}
          onSeleccionFdi={onSeleccionFdi}
          onHoverFdi={onHoverFdi}
          renderOverlays={renderOverlays}
          aplicarEstadosVisuales={aplicarEstadosVisuales}
          onListoFocusOnTooth={onListoFocusOnTooth}
          onListoControlesZoom={onListoControlesZoom}
        />
      </Suspense>
    </Canvas>
  )
}
