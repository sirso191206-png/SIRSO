import { useRef, useState } from 'react'
import { Text } from '@react-three/drei'
import { TIPOS_DIENTES } from './constantesOdontograma'

// Sin modelos .glb todavía (no se descargó ningún modelo de origen o
// licencia desconocida, tal como se pidió) — geometrías simples de
// Three.js por tipo de diente. La lógica de selección/estado es
// independiente de la geometría: cuando haya modelos .glb reales, solo
// hay que cambiar la función `Corona` de aquí abajo, nada más.
function Corona({ tipo, color, opacity }) {
  switch (tipo) {
    case 'incisivo':
      return (
        <mesh position={[0, 0.32, 0]} castShadow>
          <boxGeometry args={[0.22, 0.34, 0.12]} />
          <meshStandardMaterial color={color} transparent opacity={opacity} roughness={0.4} />
        </mesh>
      )
    case 'canino':
      return (
        <mesh position={[0, 0.34, 0]} castShadow>
          <coneGeometry args={[0.16, 0.38, 12]} />
          <meshStandardMaterial color={color} transparent opacity={opacity} roughness={0.4} />
        </mesh>
      )
    case 'premolar':
      return (
        <mesh position={[0, 0.3, 0]} castShadow>
          <cylinderGeometry args={[0.19, 0.16, 0.3, 12]} />
          <meshStandardMaterial color={color} transparent opacity={opacity} roughness={0.4} />
        </mesh>
      )
    case 'molar':
    default:
      return (
        <mesh position={[0, 0.28, 0]} castShadow>
          <cylinderGeometry args={[0.24, 0.2, 0.26, 14]} />
          <meshStandardMaterial color={color} transparent opacity={opacity} roughness={0.4} />
        </mesh>
      )
  }
}

// Prioridad clínica: qué condición "gana" visualmente si la pieza tiene
// varias caras con distinto estado. No depende solo del color — cada una
// trae también un símbolo (se pinta como texto 3D encima del diente).
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

  return { color: '#FFFDF5', simbolo: null, opacity: 1, esRaiz: true }
}

export function Diente3D({ pieza, posicion, seleccionada, onClick }) {
  const grupoRef = useRef()
  const [hover, setHover] = useState(false)
  const tipo = TIPOS_DIENTES[Number(pieza.numero_pieza)] ?? 'molar'
  const info = evaluarPieza(pieza)

  return (
    <group
      ref={grupoRef}
      position={posicion}
      onClick={(e) => { e.stopPropagation(); onClick(pieza) }}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = 'auto' }}
    >
      {/* Raíz — siempre visible salvo pieza ausente, color fijo (marfil/hueso) */}
      {info.esRaiz && (
        <mesh position={[0, 0.06, 0]}>
          <coneGeometry args={[0.12, 0.3, 10]} />
          <meshStandardMaterial color="#EADFC8" roughness={0.6} />
        </mesh>
      )}

      <Corona tipo={tipo} color={info.color} opacity={info.opacity} />

      {/* Aro de selección/hover — no depende solo del color de la pieza */}
      {(seleccionada || hover) && (
        <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.26, 0.31, 24]} />
          <meshBasicMaterial color={seleccionada ? '#1E5F8C' : '#94A3B8'} transparent opacity={0.8} />
        </mesh>
      )}

      {/* Número FDI, siempre visible como texto — nunca solo un índice visual */}
      <Text position={[0, -0.12, 0]} fontSize={0.13} color="#475569" anchorX="center" anchorY="middle">
        {pieza.numero_pieza}
      </Text>

      {/* Símbolo de estado clínico, además del color */}
      {info.simbolo && (
        <Text position={[0.2, 0.55, 0]} fontSize={0.16} color={info.color === '#FFFDF5' ? '#94A3B8' : info.color} anchorX="center" anchorY="middle">
          {info.simbolo}
        </Text>
      )}
    </group>
  )
}
