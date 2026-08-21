import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { Diente3D, RUTA_MODELO } from './Diente3D'
import { FILA_SUPERIOR, FILA_INFERIOR } from './constantesOdontograma'
import { CONFIGURACION_DENTAL } from './configuracionDental'
import { calcularPosicionAnatomicaReal } from './posicionAnatomicaReal'

// Cámara mucho más cerca que antes (antes pos:[0,0.8,6] fov:45 dejaba el
// modelo ocupando una fracción chica del canvas). Con las arcadas ahora
// más juntas (±0.62 en vez de ±1.3), esta posición deja el conjunto
// ocupando ~70% del encuadre, tal como se pidió.
export const VISTAS_CAMARA = {
  restablecer: { pos: [0, 0.35, 4.2], target: [0, 0, -0.6] },
  ambas: { pos: [0, 0.35, 4.2], target: [0, 0, -0.6] },
  superior: { pos: [0, 1.7, 2.3], target: [0, 0.62, -0.6] },
  inferior: { pos: [0, -1.7, 2.3], target: [0, -0.62, -0.6] },
  frontal: { pos: [0, 0, 4.6], target: [0, 0, -0.4] },
  oclusal: { pos: [0, 3.8, -0.6], target: [0, 0, -0.6] },
  lateral: { pos: [3.9, 0.2, 0.8], target: [0, 0, -0.6] }
}

// Anima la cámara suavemente (200-400ms) hacia la vista solicitada, en
// vez de saltar de golpe — vive dentro del Canvas porque necesita el
// contexto de R3F (useThree/useFrame).
function AnimadorCamara({ vistaObjetivo, controlsRef }) {
  const { camera } = useThree()
  const inicio = useRef({ pos: new THREE.Vector3(), target: new THREE.Vector3() })
  const fin = useRef({ pos: new THREE.Vector3(), target: new THREE.Vector3() })
  const progreso = useRef(1)
  const DURACION = 0.3

  useEffect(() => {
    const destino = VISTAS_CAMARA[vistaObjetivo] ?? VISTAS_CAMARA.restablecer
    inicio.current.pos.copy(camera.position)
    inicio.current.target.copy(controlsRef.current?.target ?? new THREE.Vector3())
    fin.current.pos.set(...destino.pos)
    fin.current.target.set(...destino.target)
    progreso.current = 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vistaObjetivo])

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
        // el porqué. La escala también cambia: sin ESCALA_POR_TIPO,
        // porque la geometría real YA tiene las proporciones
        // correctas por tipo de diente horneadas — aplicar esa
        // escala también duplicaría la diferenciación de tamaño.
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

export function EscenaDental3D({ piezas, piezaSeleccionadaId, onSeleccionarPieza, arcoVisible, vistaCamara, mostrarEtiquetas = true }) {
  const controlsRef = useRef()
  const piezasPorNumero = Object.fromEntries(piezas.map((p) => [p.numero_pieza, p]))

  // Se calcula UNA sola vez (memoizado) mientras nodes no cambie —
  // useGLTF cachea internamente (drei), así que esto no dispara una
  // segunda carga de red aunque Diente3D también llame a useGLTF más
  // abajo en el árbol.
  const { nodes } = useGLTF(RUTA_MODELO)
  const posicionesReales = useMemo(() => calcularPosicionAnatomicaReal(nodes), [nodes])

  return (
    <Canvas
      shadows={false}
      camera={{ position: VISTAS_CAMARA.restablecer.pos, fov: 40, near: 0.1, far: 30 }}
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

      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.15}
        enablePan={false}
        minDistance={1.8}
        maxDistance={7}
        minPolarAngle={Math.PI * 0.12}
        maxPolarAngle={Math.PI * 0.88}
        target={VISTAS_CAMARA.restablecer.target}
      />
      <AnimadorCamara vistaObjetivo={vistaCamara} controlsRef={controlsRef} />
    </Canvas>
  )
}
