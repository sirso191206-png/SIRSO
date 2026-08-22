import { useMemo, useState } from 'react'
import { Html, useGLTF } from '@react-three/drei'
import { Vector3 } from 'three'
import { COLOR_MARFIL_CORONA, COLOR_MARFIL_RAIZ } from './constantesOdontograma'

export const RUTA_MODELO = '/models/odontograma.glb'

// NO se aplica ningún factor de escala artificial a la geometría real:
// se renderiza en unidades nativas de Blender (1:1), tal como pediste.
// Encoger la geometría sin escalar también la POSICIÓN del grupo
// exterior (que usa las coordenadas reales, sin escalar, de
// posicionAnatomicaReal.js) era exactamente el bug que dejaba los
// dientes "muy separados": piezas encogidas paradas en posiciones
// pensadas para piezas de tamaño completo. La cámara es la que ahora
// se ajusta al tamaño real de la escena — ver calcularEncuadreCamara.js.

// ------------------------------------------------------------
// Rotación base del MODELO (no de la arcada). El eje largo del diente
// tal como se exportó desde Blender queda en Z, no en Y — verificado
// midiendo directo los vértices del .glb (ejemplo real: X≈0.73,
// Y≈0.62, Z≈2.33 en una pieza). Three.js usa Y como vertical, así que
// sin esta corrección el diente queda acostado.
//
// El signo (+90°, no -90°) se verificó con datos, no se asumió:
// midiendo en qué extremo de Z está la parte más ancha de cada pieza
// (la corona es más ancha que la raíz, que se afila), se encontró que
// la corona está en Z+ en las piezas SUPERIORES y en Z- en las
// INFERIORES — anatómicamente correcto, porque al cerrar la boca
// arriba y abajo se enfrentan en direcciones opuestas. Con
// rotationX=+90°, la nueva posición vertical es Y = -Z_original, lo
// cual manda la corona superior hacia abajo (Y-, hacia el plano de
// mordida) Y la corona inferior hacia arriba (Y+, también hacia el
// plano de mordida) — una sola rotación universal funciona para
// ambas arcadas a la vez. Verificado numéricamente contra los 8
// dientes 11/18/21/28/31/38/41/48 antes de aplicarlo: los 8 quedan
// con la corona apuntando al plano de mordida.
//
// Se aplica SOLO al <mesh> de la geometría real, nunca al <group> del
// diente (que sigue siendo responsabilidad exclusiva de
// configuracionDental.js para la rotación del arco) — son dos
// transformaciones separadas a propósito, no un solo Euler combinado.
const ROTACION_BASE_MODELO = [Math.PI / 2, 0, 0]

useGLTF.preload(RUTA_MODELO)

// ------------------------------------------------------------
// Geometría REAL (Fase 2): carga el modelo exportado desde Blender
// (SIRSO_Odontograma_Interactividad.blend → public/models/odontograma.glb).
// Cada nodo del glb se llama exactamente por su número FDI ("11".."48"),
// igual que pieza.numero_pieza — por eso el lookup es directo, sin mapeo.
//
// El color SIGUE decidiéndose aquí en React (evaluarPieza, sin cambios)
// y no con los materiales de Blender — así el mismo dato clínico pinta
// tanto el 2D como el 3D sin duplicar la lógica de estados en dos
// lugares. Si el nodo no se encuentra (nombre no coincide, o el glb no
// cargó), cae de vuelta a la cápsula placeholder — nunca se rompe la
// vista por un dato faltante.
// ------------------------------------------------------------
// Punto de entrada único: intenta la geometría real por FDI; si el
// nodo no existe en el glb (nombre no coincide, modelo no cargó, o
// simplemente esa pieza todavía no está modelada), cae de vuelta a la
// cápsula placeholder — la vista nunca se queda vacía por un dato
// faltante en el modelo 3D.
function Corona({ numeroPieza, tipo, color, emissive }) {
  const { nodes } = useGLTF(RUTA_MODELO)
  const nodo = nodes[String(numeroPieza)]

  // IMPORTANTE: los vértices que vienen de Blender traen "horneada" la
  // posición absoluta de cada diente dentro del arco original (se
  // verificó directamente: el centro de cada diente cae en un punto
  // distinto y lejos de [0,0,0], no cerca de su propio origen). Si se
  // usa la geometría tal cual, queda desplazada y los overlays
  // (anillo de selección, símbolo) —que sí asumen que el diente está
  // centrado en su origen local— se ven flotando en un punto distinto
  // al del diente real. .center() la recentra una sola vez (memoizado,
  // no en cada render) para que encaje con la posición que ya calcula
  // configuracionDental.js, igual que encajaba la cápsula placeholder.
  const geometriaCentrada = useMemo(() => {
    if (!nodo || !nodo.geometry) return null
    const geo = nodo.geometry.clone()
    geo.center()
    return geo
  }, [nodo?.geometry])

  if (geometriaCentrada) {
    return (
      <mesh geometry={geometriaCentrada} rotation={ROTACION_BASE_MODELO} castShadow>
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={emissive ? 0.35 : 0} roughness={0.45} />
      </mesh>
    )
  }
  return <CoronaPlaceholder tipo={tipo} color={color} emissive={emissive} />
}

function CoronaPlaceholder({ tipo, color, emissive }) {
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
export function evaluarPieza(pieza) {
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

  // Mismo lookup que hace Corona() para decidir si usa geometría real
  // o el placeholder — se necesita aquí también para saber si mostrar
  // la raíz artificial. useGLTF cachea internamente (drei), así que
  // llamarlo dos veces no dispara una segunda carga de red.
  const { nodes } = useGLTF(RUTA_MODELO)
  const nodo = nodes[String(pieza.numero_pieza)]
  const usaGeometriaReal = Boolean(nodo?.geometry)

  // Overlays (anillo de selección, símbolo, etiqueta) proporcionales
  // al tamaño REAL de esta pieza — antes usaban offsets fijos
  // ([0,0.05,0], radio 0.28-0.34) calibrados para la cápsula
  // placeholder (~0.5 unidades de alto). Con la geometría real sin
  // escalar (nativa de Blender, ~2.3-2.9 unidades), esos offsets fijos
  // dejaban los símbolos flotando lejos del diente. El placeholder
  // SIGUE usando sus offsets fijos de siempre (si usaGeometriaReal es
  // falso) — siguen siendo correctos para esa geometría.
  const dimensionesReales = useMemo(() => {
    if (!nodo?.geometry) return null
    nodo.geometry.computeBoundingBox()
    const tam = new Vector3()
    nodo.geometry.boundingBox.getSize(tam)
    // mismo remapeo de ejes que ROTACION_BASE_MODELO: alto real = Z original, ancho = X original
    return { ancho: tam.x, alto: tam.z, profundo: tam.y }
  }, [nodo])

  const overlay = usaGeometriaReal && dimensionesReales
    ? {
        anilloY: -dimensionesReales.alto * 0.15,
        anilloRadioInterno: Math.max(dimensionesReales.ancho, dimensionesReales.profundo) * 0.33,
        anilloRadioExterno: Math.max(dimensionesReales.ancho, dimensionesReales.profundo) * 0.4,
        simboloY: dimensionesReales.alto * 0.38,
        etiquetaY: -dimensionesReales.alto * 0.58,
      }
    : {
        anilloY: -0.03,
        anilloRadioInterno: 0.28,
        anilloRadioExterno: 0.34,
        simboloY: 0.58,
        etiquetaY: -0.22,
      }

  return (
    <group
      position={posicion}
      rotation={rotacion}
      scale={escala}
      onClick={(e) => { e.stopPropagation(); onClick(pieza) }}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = 'auto' }}
    >
      {/* Raíz artificial — SOLO para la geometría placeholder (cápsulas).
          El modelo real de Blender ya trae la raíz incluida en la misma
          malla (verificado: 1 sola primitiva por diente, ~2.3 unidades
          de alto, consistente con corona+raíz combinadas) — agregarla
          aparte cuando ya hay geometría real duplicaría anatomía. */}
      {info.esRaiz && !usaGeometriaReal && (
        <mesh position={[0, 0.05, 0]} scale={[0.55, 1, 0.55]}>
          <capsuleGeometry args={[0.09, 0.22, 4, 8]} />
          <meshStandardMaterial color={COLOR_MARFIL_RAIZ} roughness={0.6} />
        </mesh>
      )}

      {/* Color clínico — NUNCA lo cambia la selección, solo se le agrega
          un ligero emissive cuando además está seleccionada */}
      <Corona numeroPieza={pieza.numero_pieza} tipo={tipo} color={info.color} emissive={seleccionada ? info.color : null} />

      {/* Indicador de SELECCIÓN — completamente separado del estado
          clínico: un anillo azul brillante en la base. Nunca reemplaza
          el color de la pieza. */}
      {seleccionada && (
        <mesh position={[0, overlay.anilloY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[overlay.anilloRadioInterno, overlay.anilloRadioExterno, 32]} />
          <meshBasicMaterial color="#1E5F8C" transparent opacity={0.9} />
        </mesh>
      )}
      {hover && !seleccionada && (
        <mesh position={[0, overlay.anilloY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[overlay.anilloRadioInterno, overlay.anilloRadioExterno * 0.94, 32]} />
          <meshBasicMaterial color="#94A3B8" transparent opacity={0.6} />
        </mesh>
      )}

      {/* Símbolo de estado clínico (no depender solo del color) */}
      {info.simbolo && (
        <Html position={[0.18, overlay.simboloY, 0]} center distanceFactor={7} occlude={false}>
          <span className="pointer-events-none select-none text-sm font-bold" style={{ color: info.color === COLOR_MARFIL_CORONA ? '#94A3B8' : info.color }}>
            {info.simbolo}
          </span>
        </Html>
      )}

      {/* Número FDI como HTML — nunca se superpone entre piezas distintas
          porque cada una controla su propia etiqueta, y se puede ocultar
          selectivamente en pantallas chicas. */}
      {mostrarEtiqueta && (
        <Html position={[0, overlay.etiquetaY, 0]} center distanceFactor={7} occlude={false}>
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
