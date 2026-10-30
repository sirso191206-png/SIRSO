import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { nombreCara, colorCara, caraDe } from './constantesOdontograma'

// En pantallas táctiles, tocar una pieza del odontograma abre esta vista AMPLIADA: las cinco caras miden decenas de
// píxeles cada una (en el odontograma completo, una cara lateral mide ~11), así que se eligen con el dedo sin error. La
// cara elegida sigue el mismo camino que un clic con mouse (pintar con la condición activa o abrir su detalle).
const T = 240 // tamaño del diente ampliado
const O = 72 // grosor de las caras laterales

const CARAS = {
  vestibular: { puntos: `0,0 ${T},0 ${T - O},${O} ${O},${O}`, texto: [T / 2, O / 2] },
  distal: { puntos: `${T},0 ${T},${T} ${T - O},${T - O} ${T - O},${O}`, texto: [T - O / 2, T / 2] },
  lingual: { puntos: `${T},${T} 0,${T} ${O},${T - O} ${T - O},${T - O}`, texto: [T / 2, T - O / 2] },
  mesial: { puntos: `0,${T} 0,0 ${O},${O} ${O},${T - O}`, texto: [O / 2, T / 2] },
  oclusal: { puntos: `${O},${O} ${T - O},${O} ${T - O},${T - O} ${O},${T - O}`, texto: [T / 2, T / 2] }
}

export function ModalDienteTactil({ pieza, onCerrar, onElegirCara, onEstadoGeneral }) {
  if (!pieza) return null
  const conVentana = !['ausente', 'corona', 'implante'].includes(pieza.estado)
  return (
    <Modal abierto onCerrar={onCerrar} titulo={`Pieza ${pieza.numero_pieza}`}>
      {conVentana ? (
        <>
          <p className="mb-3 text-sm text-slate-500">Toca la cara que quieres marcar o revisar.</p>
          <svg viewBox={`-4 -4 ${T + 8} ${T + 8}`} className="mx-auto block w-full max-w-[280px] touch-manipulation" role="group" aria-label={`Caras de la pieza ${pieza.numero_pieza}`}>
            {Object.entries(CARAS).map(([cara, { puntos, texto }]) => {
              const info = colorCara(caraDe(pieza, cara)?.estado)
              const nombre = nombreCara(pieza.numero_pieza, cara)
              return (
                <g key={cara} role="button" tabIndex={0} aria-label={`${nombre}: ${info.label}`}
                  onClick={() => onElegirCara(cara)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onElegirCara(cara) } }}
                  style={{ cursor: 'pointer' }}
                >
                  <polygon points={puntos} fill={info.color} stroke="#64748B" strokeWidth="2" />
                  <text x={texto[0]} y={texto[1]} textAnchor="middle" dominantBaseline="middle" fontSize="13" fill="#334155" fontFamily="system-ui" pointerEvents="none">
                    {nombre}
                  </text>
                </g>
              )
            })}
          </svg>
        </>
      ) : (
        <p className="mb-3 text-sm text-slate-500">Esta pieza está marcada como {pieza.estado}: no tiene caras que marcar.</p>
      )}
      <Button variante="secundario" className="mt-4 w-full" onClick={onEstadoGeneral}>
        Estado general, diagnóstico e historial de la pieza
      </Button>
    </Modal>
  )
}
