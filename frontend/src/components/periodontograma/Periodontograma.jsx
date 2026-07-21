import { useState } from 'react'
import { usePeriodontograma } from '../../hooks/usePeriodontograma'
import { FILA_SUPERIOR, FILA_INFERIOR } from '../odontograma/constantesOdontograma'
import { ModalPiezaPeriodontal } from './ModalPiezaPeriodontal'

// Semáforo clínico estándar de profundidad de sondaje: ≤3mm sano,
// 4-5mm riesgo (gingivitis/periodontitis leve), ≥6mm severo.
function colorPorProfundidad(pieza) {
  const max = Math.max(0, ...(pieza?.sitios?.map((s) => s.profundidad_sondaje) ?? [0]))
  if (max >= 6) return { color: '#DC2626', fondo: '#FEE2E2' }
  if (max >= 4) return { color: '#D97706', fondo: '#FEF3C7' }
  return { color: '#15803D', fondo: '#DCFCE7' }
}

function tieneSangrado(pieza) {
  return pieza.sitios?.some((s) => s.sangrado)
}

export function Periodontograma({ pacienteId }) {
  const { piezas, cargando, cambiarPieza, cambiarSitio } = usePeriodontograma(pacienteId)
  const [piezaSeleccionada, setPiezaSeleccionada] = useState(null)

  if (cargando) return <p className="text-slate-400">Cargando periodontograma…</p>

  const porNumero = Object.fromEntries(piezas.map((p) => [p.numero_pieza, p]))
  const piezaActual = piezaSeleccionada ? porNumero[piezaSeleccionada.numero_pieza] : null

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Cada pieza muestra su profundidad de sondaje más alta entre sus 6 sitios. Da clic en cualquier pieza para ver
        y editar el detalle completo (sondaje, recesión, sangrado, placa, cálculo, movilidad, furcación).
      </p>

      <FilaPeriodontal numeros={FILA_SUPERIOR} porNumero={porNumero} onSeleccionar={setPiezaSeleccionada} />
      <FilaPeriodontal numeros={FILA_INFERIOR} porNumero={porNumero} onSeleccionar={setPiezaSeleccionada} />

      <div className="flex flex-wrap gap-4 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ backgroundColor: '#DCFCE7' }} /> Sondaje ≤3mm (sano)</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ backgroundColor: '#FEF3C7' }} /> 4-5mm (riesgo)</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ backgroundColor: '#FEE2E2' }} /> ≥6mm (severo)</span>
        <span className="flex items-center gap-1.5">🩸 Sangrado en algún sitio</span>
      </div>

      {piezaActual && (
        <ModalPiezaPeriodontal
          pieza={piezaActual}
          onCerrar={() => setPiezaSeleccionada(null)}
          onGuardarPieza={cambiarPieza}
          onGuardarSitio={cambiarSitio}
        />
      )}
    </div>
  )
}

function FilaPeriodontal({ numeros, porNumero, onSeleccionar }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-slate-200 bg-white p-3">
      {numeros.map((numero) => {
        const pieza = porNumero[numero]
        if (!pieza) return null
        const info = colorPorProfundidad(pieza)
        const sangrado = tieneSangrado(pieza)
        return (
          <button
            key={numero}
            onClick={() => onSeleccionar(pieza)}
            className="flex min-w-[42px] flex-col items-center gap-0.5 rounded-lg border border-slate-200 p-1.5 text-xs hover:border-clinico-azul"
            style={{ backgroundColor: info.fondo }}
          >
            <span className="font-semibold" style={{ color: info.color }}>{numero}</span>
            <span className="flex gap-0.5 text-[10px]">
              {sangrado && '🩸'}
              {pieza.movilidad > 0 && '〰️'}
              {pieza.furcacion > 0 && '◆'}
            </span>
          </button>
        )
      })}
    </div>
  )
}
