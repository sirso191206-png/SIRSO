import {
  SITIOS_VESTIBULAR, SITIOS_LINGUAL, ALTURA_ZONA, ANCHO_DIENTE,
  construirPuntosZigzag, puntosATextoPolilinea, anchoTotal, alturaPorProfundidad
} from '../../lib/graficaPeriodontal'

// Mismos umbrales clínicos que ya usaba el semáforo por diente:
// <4mm sano, 4-5mm riesgo, ≥6mm severo.
const UMBRAL_RIESGO = 4
const UMBRAL_SEVERO = 6
const ALTO_TIRA_NUMEROS = 22

export function GraficaArcada({ numeros, porNumero, onSeleccionar }) {
  const piezas = numeros.map((n) => porNumero[n] ?? null)
  const ancho = anchoTotal(piezas.length)
  const alto = ALTURA_ZONA * 2 + ALTO_TIRA_NUMEROS

  const puntosVest = construirPuntosZigzag(piezas, SITIOS_VESTIBULAR, true)
  const puntosLing = construirPuntosZigzag(piezas, SITIOS_LINGUAL, false)
  const yTiraNumeros = ALTURA_ZONA + ALTO_TIRA_NUMEROS / 2

  // Bandas de fondo del semáforo — mismos umbrales que antes, ahora
  // como zonas continuas en vez de un solo color por diente.
  const yVerdeVest = ALTURA_ZONA - alturaPorProfundidad(UMBRAL_RIESGO)
  const yAmbarVest = ALTURA_ZONA - alturaPorProfundidad(UMBRAL_SEVERO)
  const yVerdeLing = alturaPorProfundidad(UMBRAL_RIESGO)
  const yAmbarLing = alturaPorProfundidad(UMBRAL_SEVERO)

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-3">
      <svg width={ancho} height={alto} className="block">
        {/* Bandas del semáforo — vestibular (arriba) */}
        <rect x={0} y={yVerdeVest} width={ancho} height={ALTURA_ZONA - yVerdeVest} fill="#DCFCE7" />
        <rect x={0} y={yAmbarVest} width={ancho} height={yVerdeVest - yAmbarVest} fill="#FEF3C7" />
        <rect x={0} y={0} width={ancho} height={yAmbarVest} fill="#FEE2E2" />

        {/* Franja de numeración */}
        <rect x={0} y={ALTURA_ZONA} width={ancho} height={ALTO_TIRA_NUMEROS} fill="#F8FAFC" />

        {/* Bandas del semáforo — lingual/palatino (abajo) */}
        <rect x={0} y={ALTURA_ZONA + ALTO_TIRA_NUMEROS} width={ancho} height={yVerdeLing} fill="#DCFCE7" />
        <rect x={0} y={ALTURA_ZONA + ALTO_TIRA_NUMEROS + yVerdeLing} width={ancho} height={yAmbarLing - yVerdeLing} fill="#FEF3C7" />
        <rect x={0} y={ALTURA_ZONA + ALTO_TIRA_NUMEROS + yAmbarLing} width={ancho} height={ALTURA_ZONA - yAmbarLing} fill="#FEE2E2" />

        {/* Separadores verticales entre dientes */}
        {piezas.map((_, i) => (
          <line key={i} x1={i * ANCHO_DIENTE} y1={0} x2={i * ANCHO_DIENTE} y2={alto} stroke="#E2E8F0" strokeWidth={1} />
        ))}

        {/* Zigzag vestibular */}
        <polyline points={puntosATextoPolilinea(puntosVest)} fill="none" stroke="#1E293B" strokeWidth={1.5} />
        {puntosVest.map((p, i) => <PuntoSondaje key={`v-${i}`} punto={p} />)}

        {/* Zigzag lingual/palatino, desplazado debajo de la franja de números */}
        <polyline
          points={puntosATextoPolilinea(puntosLing.map((p) => ({ ...p, y: p.y + ALTURA_ZONA + ALTO_TIRA_NUMEROS })))}
          fill="none" stroke="#1E293B" strokeWidth={1.5}
        />
        {puntosLing.map((p, i) => <PuntoSondaje key={`l-${i}`} punto={{ ...p, y: p.y + ALTURA_ZONA + ALTO_TIRA_NUMEROS }} />)}

        {/* Numeración + clic para editar la pieza completa */}
        {piezas.map((pieza, i) => {
          const x = i * ANCHO_DIENTE + ANCHO_DIENTE / 2
          return (
            <g key={i} onClick={() => pieza && onSeleccionar(pieza)} className={pieza ? 'cursor-pointer' : ''}>
              <rect x={i * ANCHO_DIENTE} y={0} width={ANCHO_DIENTE} height={alto} fill="transparent" />
              <text x={x} y={yTiraNumeros} textAnchor="middle" dominantBaseline="middle" className="select-none text-[11px] font-semibold" fill={pieza ? '#334155' : '#CBD5E1'}>
                {numeros[i]}
              </text>
              {pieza?.movilidad > 0 && <text x={x - 14} y={yTiraNumeros} textAnchor="middle" dominantBaseline="middle" className="select-none text-[9px]">〰️</text>}
              {pieza?.furcacion > 0 && <text x={x + 14} y={yTiraNumeros} textAnchor="middle" dominantBaseline="middle" className="select-none text-[9px]">◆</text>}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function PuntoSondaje({ punto }) {
  if (punto.numeroPieza === null) return null
  return (
    <circle
      cx={punto.x}
      cy={punto.y}
      r={punto.sangrado ? 3 : 2}
      fill={punto.sangrado ? '#DC2626' : '#1E293B'}
    />
  )
}
