import { useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { Diente3D } from './Diente3D'
import { FILA_SUPERIOR, FILA_INFERIOR } from './constantesOdontograma'

const RADIO_ARCO = 2.6
const ANGULO_MAX = (100 * Math.PI) / 180

// Posición de cada diente a lo largo de una curva en forma de arco (U),
// aproximando la forma real de una arcada dental vista desde arriba.
function posicionEnArco(indice, total, y) {
  const t = indice / (total - 1)
  const angulo = -ANGULO_MAX + t * 2 * ANGULO_MAX
  const x = RADIO_ARCO * Math.sin(angulo)
  const z = -RADIO_ARCO * (1 - Math.cos(angulo))
  return [x, y, z]
}

export const VISTAS_CAMARA = {
  restablecer: { pos: [0, 0.8, 6], target: [0, 0, -1.3] },
  ambas: { pos: [0, 0.8, 6], target: [0, 0, -1.3] },
  superior: { pos: [0, 2.6, 3.2], target: [0, 1.3, -1.3] },
  inferior: { pos: [0, -2.6, 3.2], target: [0, -1.3, -1.3] },
  frontal: { pos: [0, 0, 6.5], target: [0, 0, -1] },
  oclusal: { pos: [0, 5.5, -1.3], target: [0, 0, -1.3] },
  lateral: { pos: [5.5, 0.5, 1.5], target: [0, 0, -1.3] }
}

// Anima la cámara suavemente (200-400ms) hacia la vista solicitada, en
// vez de saltar de golpe — vive dentro del Canvas porque necesita el
// contexto de R3F (useThree/useFrame).
function AnimadorCamara({ vistaObjetivo, controlsRef }) {
  const { camera } = useThree()
  const inicio = useRef({ pos: new THREE.Vector3(), target: new THREE.Vector3() })
  const fin = useRef({ pos: new THREE.Vector3(), target: new THREE.Vector3() })
  const progreso = useRef(1)
  const DURACION = 0.3 // segundos

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
    const t = 1 - Math.pow(1 - progreso.current, 3) // ease-out
    camera.position.lerpVectors(inicio.current.pos, fin.current.pos, t)
    if (controlsRef.current) {
      controlsRef.current.target.lerpVectors(inicio.current.target, fin.current.target, t)
      controlsRef.current.update()
    }
  })

  return null
}

function Arcada({ numeros, y, piezasPorNumero, piezaSeleccionadaId, onSeleccionar }) {
  return (
    <>
      {numeros.map((numero, i) => {
        const pieza = piezasPorNumero[numero]
        if (!pieza) return null
        return (
          <Diente3D
            key={numero}
            pieza={pieza}
            posicion={posicionEnArco(i, numeros.length, y)}
            seleccionada={piezaSeleccionadaId === pieza.id}
            onClick={onSeleccionar}
          />
        )
      })}
    </>
  )
}

export function EscenaDental3D({ piezas, piezaSeleccionadaId, onSeleccionarPieza, arcoVisible, vistaCamara }) {
  const controlsRef = useRef()
  const piezasPorNumero = Object.fromEntries(piezas.map((p) => [p.numero_pieza, p]))

  return (
    <Canvas
      shadows={false}
      camera={{ position: VISTAS_CAMARA.restablecer.pos, fov: 45 }}
      dpr={[1, 1.5]} // limita resolución en pantallas de alta densidad, cuida rendimiento
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 5, 3]} intensity={0.7} />
      <directionalLight position={[-3, -2, 2]} intensity={0.25} />

      {(arcoVisible === 'ambas' || arcoVisible === 'superior') && (
        <Arcada
          numeros={FILA_SUPERIOR}
          y={1.3}
          piezasPorNumero={piezasPorNumero}
          piezaSeleccionadaId={piezaSeleccionadaId}
          onSeleccionar={onSeleccionarPieza}
        />
      )}
      {(arcoVisible === 'ambas' || arcoVisible === 'inferior') && (
        <Arcada
          numeros={FILA_INFERIOR}
          y={-1.3}
          piezasPorNumero={piezasPorNumero}
          piezaSeleccionadaId={piezaSeleccionadaId}
          onSeleccionar={onSeleccionarPieza}
        />
      )}

      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.15}
        minDistance={2.5}
        maxDistance={9}
        minPolarAngle={Math.PI * 0.15}
        maxPolarAngle={Math.PI * 0.85}
        target={VISTAS_CAMARA.restablecer.target}
      />
      <AnimadorCamara vistaObjetivo={vistaCamara} controlsRef={controlsRef} />
    </Canvas>
  )
}
