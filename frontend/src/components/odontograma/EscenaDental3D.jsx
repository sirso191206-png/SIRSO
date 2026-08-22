import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { Diente3D, RUTA_MODELO } from './Diente3D'
import { FILA_SUPERIOR, FILA_INFERIOR } from './constantesOdontograma'
import { CONFIGURACION_DENTAL } from './configuracionDental'
import { calcularPosicionAnatomicaReal } from './posicionAnatomicaReal'
import { calcularVistasCamara } from './calcularEncuadreCamara'

const FOV_GRADOS = 40

// Anima la cámara suavemente (200-400ms) hacia la vista solicitada, en
// vez de saltar de golpe — vive dentro del Canvas porque necesita el
// contexto de R3F (useThree/useFrame). `vistasCamara` ya no es un
// valor fijo del módulo — se calcula del tamaño real del modelo (ver
// calcularEncuadreCamara.js) y se recibe por prop.
function AnimadorCamara({ vistaObjetivo, controlsRef, vistasCamara }) {
  const { camera } = useThree()
  const inicio = useRef({ pos: new THREE.Vector3(), target: new THREE.Vector3() })
  const fin = useRef({ pos: new THREE.Vector3(), target: new THREE.Vector3() })
  const progreso = useRef(1)
  const DURACION = 0.3

  useEffect(() => {
    const destino = vistasCamara[vistaObjetivo] ?? vistasCamara.restablecer
    inicio.current.pos.copy(camera.position)
    inicio.current.target.copy(controlsRef.current?.target ?? new THREE.Vector3())
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
 * Mueve suavemente la cámara para enfocar un diente específico por su
 * FDI — adicional a la vista general, no la reemplaza (sección 11 del
 * pedido). Calcula el bounding box de ESE diente únicamente (no de
 * toda la boca) y encuadra sobre su centro real.
 */
function useFocusOnTooth(nodes, camera, controlsRef) {
  return useMemo(() => {
    return function focusOnTooth(fdi, { fovGrados = FOV_GRADOS, margen = 2.5, duracionMs = 400 } = {}) {
      const nodo = nodes[String(fdi)]
      if (!nodo || !nodo.geometry) return
      nodo.geometry.computeBoundingBox()
      const bb = nodo.geometry.boundingBox
      const centroLocal = new THREE.Vector3()
      bb.getCenter(centroLocal)
      const tamanoLocal = new THREE.Vector3()
      bb.getSize(tamanoLocal)
      // mismo eje remapeado que ROTACION_BASE_MODELO/posicionAnatomicaReal: (x,y,z)->(x,-z,y)
      const centro = [centroLocal.x, -centroLocal.z, centroLocal.y]
      const tamanoMax = Math.max(tamanoLocal.x, tamanoLocal.y, tamanoLocal.z)
      const distancia = (tamanoMax / 2 / Math.tan((fovGrados * Math.PI) / 360)) * margen

      const dirActual = camera.position.clone().sub(controlsRef.current?.target ?? new THREE.Vector3()).normalize()
      const posicionFinal = new THREE.Vector3(...centro).addScaledVector(dirActual, distancia)

      const inicioPos = camera.position.clone()
      const inicioTarget = (controlsRef.current?.target ?? new THREE.Vector3()).clone()
      const targetFinal = new THREE.Vector3(...centro)
      const t0 = performance.now()

      function paso() {
        const t = Math.min(1, (performance.now() - t0) / duracionMs)
        const suave = 1 - Math.pow(1 - t, 3)
        camera.position.lerpVectors(inicioPos, posicionFinal, suave)
        if (controlsRef.current) {
          controlsRef.current.target.lerpVectors(inicioTarget, targetFinal, suave)
          controlsRef.current.update()
        }
        if (t < 1) requestAnimationFrame(paso)
      }
      requestAnimationFrame(paso)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes])
}

function Arcada({ numeros, piezasPorNumero, piezaSeleccionadaId, onSeleccionar, mostrarEtiquetas, posicionesReales }) {
  return (
    <>
      {numeros.map((numero) => {
        const pieza = piezasPorNumero[numero]
        const config = CONFIGURACION_DENTAL[numero]
        if (!pieza || !config) return null

        // Si hay geometría real para este FDI, su posición/rotación
        // real (derivada del .glb) reemplaza la curva sintética de
        // configuracionDental.js — ver posicionAnatomicaReal.js para
        // el porqué. Escala siempre 1 para geometría real: la
        // geometría se renderiza en unidades nativas de Blender, sin
        // ningún factor artificial — ver nota en Diente3D.jsx.
        const real = posicionesReales[numero]
        const posicion = real ? real.posicion : config.posicion
        const rotacion = real ? real.rotacion : config.rotacion
        const escala = real ? 1 : config.escala

        return (
          <Diente3D
            key={numero}
            pieza={pieza}
            tipo={config.tipo}
            posicion={posicion}
            rotacion={rotacion}
            escala={escala}
            seleccionada={piezaSeleccionadaId === pieza.id}
            mostrarEtiqueta={mostrarEtiquetas}
            onClick={onSeleccionar}
          />
        )
      })}
    </>
  )
}

// Plano de referencia sutil debajo del modelo — ayuda a anclar la escena
// sin agregar cuadrículas ni fondos oscuros.
// PlanoReferencia() — DESACTIVADO a propósito. Generaba la franja gris
// grande que atravesaba las arcadas (círculo radio 3.2 en Y=-0.02,
// justo entre la arcada superior en +0.62 y la inferior en -0.62). No
// se elimina el código por si algún día se quiere una sombra sutil
// bien calibrada, pero no se renderiza más abajo.
function PlanoReferencia() {
  return (
    <mesh position={[0, -0.02, -0.6]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <circleGeometry args={[3.2, 48]} />
      <meshStandardMaterial color="#F8FAFC" roughness={1} />
    </mesh>
  )
}

/** Vive dentro del <Canvas> — expone la función focusOnTooth al padre vía onListo, si se necesita. */
function ControladorCamara({ vistaCamara, vistasCamara, onListoFocusOnTooth }) {
  const controlsRef = useRef()
  const { camera } = useThree()
  const { nodes } = useGLTF(RUTA_MODELO)
  const focusOnTooth = useFocusOnTooth(nodes, camera, controlsRef)

  useEffect(() => {
    onListoFocusOnTooth?.(focusOnTooth)
  }, [focusOnTooth, onListoFocusOnTooth])

  const distanciaModelo = vistasCamara.__distanciaModelo

  return (
    <>
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.15}
        enablePan={false}
        // Límites de zoom proporcionales al tamaño REAL de la escena,
        // no valores fijos — sección 9 del pedido. MIN suficiente para
        // no atravesar los dientes, MAX suficiente para alejarse más
        // allá del encuadre inicial.
        minDistance={distanciaModelo * 0.12}
        maxDistance={distanciaModelo * 4}
        minPolarAngle={Math.PI * 0.05}
        maxPolarAngle={Math.PI * 0.95}
        target={vistasCamara.restablecer.target}
      />
      <AnimadorCamara vistaObjetivo={vistaCamara} controlsRef={controlsRef} vistasCamara={vistasCamara} />
    </>
  )
}

export function EscenaDental3D({ piezas, piezaSeleccionadaId, onSeleccionarPieza, arcoVisible, vistaCamara, mostrarEtiquetas = true, onFocusOnToothListo }) {
  const piezasPorNumero = Object.fromEntries(piezas.map((p) => [p.numero_pieza, p]))

  // Se calcula UNA sola vez (memoizado) mientras nodes/scene no cambien
  // — useGLTF cachea internamente (drei), así que esto no dispara una
  // segunda carga de red aunque Diente3D también llame a useGLTF más
  // abajo en el árbol.
  const { nodes, scene } = useGLTF(RUTA_MODELO)
  const posicionesReales = useMemo(() => calcularPosicionAnatomicaReal(nodes), [nodes])

  // Bounding box REAL de las 32 piezas — Box3.setFromObject sobre la
  // escena tal cual la entrega el GLTFLoader, que ya aplica solo la
  // rotación propia del nodo (verificado: coincide exacto con el
  // cálculo manual de posicionAnatomicaReal.js). De aquí sale el
  // encuadre de cámara automático — sección 8 del pedido, ya no hay
  // ningún VISTAS_CAMARA fijo/adivinado.
  const { centro, tamano, distanciaModelo } = useMemo(() => {
    const caja = new THREE.Box3().setFromObject(scene)
    const c = new THREE.Vector3()
    const t = new THREE.Vector3()
    caja.getCenter(c)
    caja.getSize(t)
    return { centro: c.toArray(), tamano: t.toArray(), distanciaModelo: Math.max(t.x, t.y, t.z) }
  }, [scene])

  const vistasCamara = useMemo(() => {
    const v = calcularVistasCamara({ centro, tamano, fovGrados: FOV_GRADOS })
    v.__distanciaModelo = distanciaModelo
    return v
  }, [centro, tamano, distanciaModelo])

  return (
    <Canvas
      shadows={false}
      camera={{
        position: vistasCamara.restablecer.posicion,
        fov: FOV_GRADOS,
        near: Math.max(0.01, distanciaModelo * 0.01),
        far: distanciaModelo * 15,
      }}
      dpr={[1, 1.5]}
    >
      <color attach="background" args={['#F8FAFC']} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[2.5, 4, 3]} intensity={0.65} />
      <directionalLight position={[-2.5, -1.5, 2]} intensity={0.25} />

      {/* <PlanoReferencia /> — desactivado, ver comentario en la definición de arriba */}

      {(arcoVisible === 'ambas' || arcoVisible === 'superior') && (
        <Arcada
          numeros={FILA_SUPERIOR}
          piezasPorNumero={piezasPorNumero}
          piezaSeleccionadaId={piezaSeleccionadaId}
          onSeleccionar={onSeleccionarPieza}
          mostrarEtiquetas={mostrarEtiquetas}
          posicionesReales={posicionesReales}
        />
      )}
      {(arcoVisible === 'ambas' || arcoVisible === 'inferior') && (
        <Arcada
          numeros={FILA_INFERIOR}
          piezasPorNumero={piezasPorNumero}
          piezaSeleccionadaId={piezaSeleccionadaId}
          onSeleccionar={onSeleccionarPieza}
          mostrarEtiquetas={mostrarEtiquetas}
          posicionesReales={posicionesReales}
        />
      )}

      <ControladorCamara vistaCamara={vistaCamara} vistasCamara={vistasCamara} onListoFocusOnTooth={onFocusOnToothListo} />
    </Canvas>
  )
}
