import { COLOR_PIEZA, FILA_SUPERIOR, FILA_INFERIOR, nombreCara, colorCara, caraDe } from './constantesOdontograma'
import { useEsTactil } from '../../hooks/useEsTactil'

// Tamaño de cada diente y separación entre ellos
const S = 38
const GAP = 4
const O = 11 // offset del cuadro central (oclusal/incisal)

// `onSeleccionarDiente` (opcional): en pantallas táctiles, tocar CUALQUIER parte de una pieza (o su número) la selecciona
// entera y el contenedor abre la vista ampliada (ModalDienteTactil). Las caras en el odontograma completo son demasiado
// pequeñas para el dedo; con mouse todo sigue igual (clic en la cara o en el número).
export function OdontogramaSvg({ porNumero, onClickCara, onClickDiente, onSeleccionarDiente, soloLectura = false }) {
  const tactil = useEsTactil() && Boolean(onSeleccionarDiente) && !soloLectura
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-3 sm:p-6">
      {/* En táctil, más ancho mínimo: cada pieza queda de ~50 px (área de toque cómoda); la proporción no cambia. */}
      <svg viewBox="0 0 700 230" className={`w-full ${tactil ? 'min-w-[880px] touch-manipulation' : 'min-w-[680px]'}`}>
        <FilaDientes
          numeros={FILA_SUPERIOR}
          y={15}
          porNumero={porNumero}
          onClickCara={onClickCara}
          onClickDiente={onClickDiente}
          onSeleccionarDiente={tactil ? onSeleccionarDiente : null}
          soloLectura={soloLectura}
        />
        <line x1="10" y1="115" x2="690" y2="115" stroke="#E2E8F0" strokeDasharray="4 4" />
        <FilaDientes
          numeros={FILA_INFERIOR}
          y={120}
          porNumero={porNumero}
          onClickCara={onClickCara}
          onClickDiente={onClickDiente}
          onSeleccionarDiente={tactil ? onSeleccionarDiente : null}
          soloLectura={soloLectura}
        />
      </svg>
    </div>
  )
}

function FilaDientes({ numeros, y, porNumero, onClickCara, onClickDiente, onSeleccionarDiente, soloLectura }) {
  return (
    <g>
      {numeros.map((numero, i) => {
        const pieza = porNumero[numero]
        const x = 10 + i * (S + GAP)
        if (!pieza) return null

        return (
          <g key={numero}>
            <DienteVentana
              pieza={pieza}
              x={x}
              y={y}
              soloLectura={soloLectura}
              onClickCara={(cara) => onClickCara(pieza, cara)}
              onClickDiente={() => onClickDiente(pieza)}
            />
            <text
              x={x + S / 2}
              y={y + S + 14}
              textAnchor="middle"
              fontSize="11"
              fill="#64748B"
              fontFamily="system-ui"
              style={{ cursor: soloLectura ? 'default' : 'pointer' }}
              onClick={() => !soloLectura && onClickDiente(pieza)}
            >
              {numero}
            </text>
            {onSeleccionarDiente && (
              // Capa de toque: cubre la pieza Y su número (≈50×70 px en pantalla), sin invadir a las vecinas (4 de separación).
              <rect
                x={x - 1}
                y={y - 1}
                width={S + 2}
                height={S + 18}
                fill="transparent"
                role="button"
                aria-label={`Pieza ${numero}`}
                style={{ cursor: 'pointer' }}
                onClick={() => onSeleccionarDiente(pieza)}
              />
            )}
          </g>
        )
      })}
    </g>
  )
}

function DienteVentana({ pieza, x, y, onClickCara, onClickDiente, soloLectura }) {
  const cursor = soloLectura ? 'default' : 'pointer'

  // Condiciones que cubren TODO el diente: no se dibuja la ventana de
  // caras, se muestra un solo bloque representando la condición general.
  if (pieza.estado === 'ausente') {
    return (
      <g style={{ cursor }} onClick={() => !soloLectura && onClickDiente()}>
        <rect x={x} y={y} width={S} height={S} rx="6" fill="#E2E8F0" stroke="#94A3B8" opacity="0.5" />
        <line x1={x + 6} y1={y + 6} x2={x + S - 6} y2={y + S - 6} stroke="#94A3B8" strokeWidth="2" />
        <line x1={x + S - 6} y1={y + 6} x2={x + 6} y2={y + S - 6} stroke="#94A3B8" strokeWidth="2" />
        <title>{`Pieza ${pieza.numero_pieza} — Ausente`}</title>
      </g>
    )
  }

  if (pieza.estado === 'corona' || pieza.estado === 'implante') {
    const c = COLOR_PIEZA[pieza.estado]
    return (
      <g style={{ cursor }} onClick={() => !soloLectura && onClickDiente()}>
        <rect x={x} y={y} width={S} height={S} rx="6" fill={c.color} stroke={c.borde} strokeWidth="1.5" />
        <title>{`Pieza ${pieza.numero_pieza} — ${pieza.estado === 'corona' ? 'Corona' : 'Implante'}`}</title>
      </g>
    )
  }

  // Ventana de 5 caras: oclusal/incisal (centro) + vestibular/lingual/mesial/distal
  const puntos = {
    vestibular: `${x},${y} ${x + S},${y} ${x + S - O},${y + O} ${x + O},${y + O}`,
    distal: `${x + S},${y} ${x + S},${y + S} ${x + S - O},${y + S - O} ${x + S - O},${y + O}`,
    lingual: `${x + S},${y + S} ${x},${y + S} ${x + O},${y + S - O} ${x + S - O},${y + S - O}`,
    mesial: `${x},${y + S} ${x},${y} ${x + O},${y + O} ${x + O},${y + S - O}`,
    oclusal: `${x + O},${y + O} ${x + S - O},${y + O} ${x + S - O},${y + S - O} ${x + O},${y + S - O}`
  }

  const bordeGeneral = pieza.estado === 'endodoncia' ? '#B91C1C' : pieza.estado === 'en_tratamiento' ? '#0891B2' : '#CBD5E1'
  const anchoBorde = pieza.estado === 'sano' ? 1 : 2.5

  return (
    <g>
      <rect x={x} y={y} width={S} height={S} rx="4" fill="none" stroke={bordeGeneral} strokeWidth={anchoBorde} />
      {Object.entries(puntos).map(([nombreCaraKey, pts]) => {
        const cara = caraDe(pieza, nombreCaraKey)
        const info = colorCara(cara?.estado)
        return (
          <polygon
            key={nombreCaraKey}
            points={pts}
            fill={info.color}
            stroke="#94A3B8"
            strokeWidth="1.2"
            style={{ cursor }}
            onClick={() => !soloLectura && onClickCara(nombreCaraKey)}
          >
            <title>{`Pieza ${pieza.numero_pieza} — ${nombreCara(pieza.numero_pieza, nombreCaraKey)} — ${info.label}`}</title>
          </polygon>
        )
      })}
    </g>
  )
}
