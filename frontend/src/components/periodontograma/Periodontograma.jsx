import { useState } from 'react'
import { usePeriodontograma } from '../../hooks/usePeriodontograma'
import { FILA_SUPERIOR, FILA_INFERIOR } from '../odontograma/constantesOdontograma'
import { ModalPiezaPeriodontal } from './ModalPiezaPeriodontal'
import { GraficaArcada } from './GraficaArcada'

export function Periodontograma({ pacienteId }) {
  const { piezas, cargando, cambiarPieza, cambiarSitio } = usePeriodontograma(pacienteId)
  const [piezaSeleccionada, setPiezaSeleccionada] = useState(null)

  if (cargando) return <p className="text-slate-400">Cargando periodontograma…</p>

  const porNumero = Object.fromEntries(piezas.map((p) => [p.numero_pieza, p]))
  const piezaActual = piezaSeleccionada ? porNumero[piezaSeleccionada.numero_pieza] : null

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Sondaje de los 6 sitios por diente (vestibular arriba, lingual/palatino abajo). Da clic en cualquier diente
        para ver y editar el detalle completo (sondaje, recesión, sangrado, placa, cálculo, movilidad, furcación).
      </p>

      <GraficaArcada numeros={FILA_SUPERIOR} porNumero={porNumero} onSeleccionar={setPiezaSeleccionada} />
      <GraficaArcada numeros={FILA_INFERIOR} porNumero={porNumero} onSeleccionar={setPiezaSeleccionada} />

      <div className="flex flex-wrap gap-4 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ backgroundColor: '#DCFCE7' }} /> Sondaje &lt;4mm (sano)</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ backgroundColor: '#FEF3C7' }} /> 4-5mm (riesgo)</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ backgroundColor: '#FEE2E2' }} /> ≥6mm (severo)</span>
        <span className="flex items-center gap-1.5">🔴 Punto rojo = sangrado en ese sitio</span>
        <span className="flex items-center gap-1.5">〰️ Movilidad · ◆ Furcación</span>
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
