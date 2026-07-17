import { useOdontograma } from '../../hooks/useOdontograma'
import { useTratamientos } from '../../hooks/useTratamientos'
import { useOdontograma3D } from '../../hooks/useOdontograma3D'
import { EscenaDental3D } from './EscenaDental3D'
import { ControlesOdontograma3D } from './ControlesOdontograma3D'
import { PanelPieza3D } from './PanelPieza3D'
import { LeyendaClinica } from './LeyendaClinica'

export function Odontograma3D({ pacienteId, onVerEnExpediente, onIrAPlan }) {
  // Mismos datos que la vista 2D — ni una consulta nueva a Supabase.
  const { piezas, cargando } = useOdontograma(pacienteId)
  const { tratamientos } = useTratamientos(pacienteId)
  const {
    piezaSeleccionada, seleccionarPieza, cerrarPanel,
    arcoVisible, setArcoVisible, vistaCamara, setVistaCamara
  } = useOdontograma3D()

  if (cargando) return <p className="text-slate-400">Cargando odontograma…</p>

  return (
    <div className="space-y-4">
      <ControlesOdontograma3D arcoVisible={arcoVisible} onCambiarArco={setArcoVisible} onCambiarVista={setVistaCamara} />

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="h-[420px] overflow-hidden rounded-xl border border-slate-200 bg-slate-50 lg:h-[520px] lg:w-[70%]">
          <EscenaDental3D
            piezas={piezas}
            piezaSeleccionadaId={piezaSeleccionada?.id ?? null}
            onSeleccionarPieza={seleccionarPieza}
            arcoVisible={arcoVisible}
            vistaCamara={vistaCamara}
          />
        </div>

        {/* Escritorio/tablet: panel fijo al lado. Celular: hoja inferior. */}
        <div className="hidden lg:block lg:h-[520px] lg:w-[30%]">
          <PanelPieza3D
            pieza={piezaSeleccionada}
            tratamientos={tratamientos}
            onCerrar={cerrarPanel}
            onVerEnExpediente={() => onVerEnExpediente?.(piezaSeleccionada)}
            onIrAPlan={onIrAPlan}
          />
        </div>
      </div>

      {piezaSeleccionada && (
        <div className="fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-slate-200 bg-white p-4 shadow-2xl lg:hidden">
          <PanelPieza3D
            pieza={piezaSeleccionada}
            tratamientos={tratamientos}
            onCerrar={cerrarPanel}
            onVerEnExpediente={() => onVerEnExpediente?.(piezaSeleccionada)}
            onIrAPlan={onIrAPlan}
          />
        </div>
      )}

      <LeyendaClinica />

      <p className="text-xs text-slate-400">
        Vista de demostración: usa geometrías simples mientras no haya modelos anatómicos 3D reales cargados. Arrastra para rotar, rueda del mouse para acercar/alejar.
      </p>
    </div>
  )
}
