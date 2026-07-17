import { useMemo, useState } from 'react'
import { Html } from '@react-three/drei'
import { COLOR_MARFIL_CORONA, COLOR_MARFIL_RAIZ } from './constantesOdontograma'

// ------------------------------------------------------------
// Geometría temporal MEJORADA (Fase 1.5): cápsulas y esferas en vez de
// cilindros/conos rectos, con protuberancias simples para sugerir cúspides.
// El día que existan modelos .glb reales, solo se reemplaza el contenido
// de <Corona> — nada de la lógica clínica/selección de aquí abajo cambia.
// ------------------------------------------------------------
function Corona({ tipo, color, emissive }) {
  const material = (
    <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={emissive ? 0.35 : 0} roughness={0.45} />
  )

  switch (tipo) {
    case 'incisivo':
      return (
        <mesh position={[0, 0.3, 0]} scale={[0.62, 1, 0.42]} castShadow>
          <capsuleGeometry args={[0.15, 0.16, 4, 8]} />
          {material}
        </mesh>
      )
    case 'canino':
      return (
        <group>
          <mesh position={[0, 0.28, 0]} scale={[0.72, 1, 0.72]} castShadow>
            <capsuleGeometry args={[0.13, 0.18, 4, 8]} />
            {material}
          </mesh>
          <mesh position={[0, 0.46, 0]} castShadow>
            <coneGeometry args={[0.07, 0.12, 8]} />
            {material}
          </mesh>
        </group>
      )
    case 'premolar':
      return (
        <group>
          <mesh position={[0, 0.28, 0]} castShadow>
            <capsuleGeometry args={[0.17, 0.14, 4, 10]} />
            {material}
          </mesh>
          <mesh position={[-0.06, 0.4, 0]} scale={0.55} castShadow>
            <sphereGeometry args={[0.09, 8, 8]} />
            {material}
          </mesh>
          <mesh position={[0.06, 0.4, 0]} scale={0.55} castShadow>
            <sphereGeometry args={[0.09, 8, 8]} />
            {material}
          </mesh>
        </group>
      )
    case 'molar':
    default:
      return (
        <group>
          <mesh position={[0, 0.26, 0]} castShadow>
            <capsuleGeometry args={[0.22, 0.12, 4, 12]} />
            {material}
          </mesh>
          {[[-0.08, 0.07], [0.08, 0.07], [-0.08, -0.07], [0.08, -0.07]].map(([x, z], i) => (
            <mesh key={i} position={[x, 0.4, z]} scale={0.5} castShadow>
              <sphereGeometry args={[0.09, 8, 8]} />
              {material}
            </mesh>
          ))}
        </group>
      )
  }
}

// Prioridad clínica: qué condición "gana" visualmente si la pieza tiene
// varias caras con distinto estado. Esto define el COLOR (estado
// clínico) — la selección se dibuja aparte y nunca lo sobreescribe.
function evaluarPieza(pieza) {
  if (pieza.estado === 'ausente') return { color: '#CBD5E1', simbolo: '×', opacity: 0.3, esRaiz: false }
  if (pieza.estado === 'implante') return { color: '#C4B5FD', simbolo: '◆', opacity: 1, esRaiz: true }
  if (pieza.estado === 'corona') return { color: '#FCD34D', simbolo: '●', opacity: 1, esRaiz: true }
  if (pieza.estado === 'endodoncia') return { color: '#F87171', simbolo: '✓', opacity: 1, esRaiz: true }

  const caras = pieza.caras ?? []
  if (caras.some((c) => c.estado === 'caries')) return { color: '#FCA5A5', simbolo: '●', opacity: 1, esRaiz: true }
  if (pieza.estado === 'en_tratamiento' || caras.some((c) => c.estado === 'en_tratamiento')) {
    return { color: '#67E8F9', simbolo: '●', opacity: 1, esRaiz: true }
  }
  if (caras.some((c) => c.estado === 'fracturado')) return { color: '#FDBA74', simbolo: '●', opacity: 1, esRaiz: true }
  if (caras.some((c) => c.estado === 'obturado')) return { color: '#93C5FD', simbolo: '✓', opacity: 1, esRaiz: true }

  return { color: COLOR_MARFIL_CORONA, simbolo: null, opacity: 1, esRaiz: true }
}

export function Diente3D({ pieza, tipo, posicion, rotacion, escala, seleccionada, mostrarEtiqueta, onClick }) {
  const [hover, setHover] = useState(false)
  const info = useMemo(() => evaluarPieza(pieza), [pieza])

  return (
    <group
      position={posicion}
      rotation={rotacion}
      scale={escala}
      onClick={(e) => { e.stopPropagation(); onClick(pieza) }}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = 'auto' }}
    >
      {/* Raíz — color fijo (marfil/hueso), independiente del estado clínico de la corona */}
      {info.esRaiz && (
        <mesh position={[0, 0.05, 0]} scale={[0.55, 1, 0.55]}>
          <capsuleGeometry args={[0.09, 0.22, 4, 8]} />
          <meshStandardMaterial color={COLOR_MARFIL_RAIZ} roughness={0.6} />
        </mesh>
      )}

      {/* Color clínico — NUNCA lo cambia la selección, solo se le agrega
          un ligero emissive cuando además está seleccionada */}
      <Corona tipo={tipo} color={info.color} emissive={seleccionada ? info.color : null} />

      {/* Indicador de SELECCIÓN — completamente separado del estado
          clínico: un anillo azul brillante en la base. Nunca reemplaza
          el color de la pieza. */}
      {seleccionada && (
        <mesh position={[0, -0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.28, 0.34, 32]} />
          <meshBasicMaterial color="#1E5F8C" transparent opacity={0.9} />
        </mesh>
      )}
      {hover && !seleccionada && (
        <mesh position={[0, -0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.28, 0.32, 32]} />
          <meshBasicMaterial color="#94A3B8" transparent opacity={0.6} />
        </mesh>
      )}

      {/* Símbolo de estado clínico (no depender solo del color) */}
      {info.simbolo && (
        <Html position={[0.18, 0.58, 0]} center distanceFactor={7} occlude={false}>
          <span className="pointer-events-none select-none text-sm font-bold" style={{ color: info.color === COLOR_MARFIL_CORONA ? '#94A3B8' : info.color }}>
            {info.simbolo}
          </span>
        </Html>
      )}

      {/* Número FDI como HTML — nunca se superpone entre piezas distintas
          porque cada una controla su propia etiqueta, y se puede ocultar
          selectivamente en pantallas chicas. */}
      {mostrarEtiqueta && (
        <Html position={[0, -0.22, 0]} center distanceFactor={7} occlude={false}>
          <span
            className={`pointer-events-none select-none rounded px-1 text-[11px] font-medium ${
              seleccionada ? 'bg-clinico-azul text-white' : 'text-slate-500'
            }`}
          >
            {pieza.numero_pieza}
          </span>
        </Html>
      )}
    </group>
  )
}
