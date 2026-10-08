import { useRef } from 'react'
import { useOdontograma } from '../../hooks/useOdontograma'
import { useTratamientos } from '../../hooks/useTratamientos'
import { useOdontograma3D } from '../../hooks/useOdontograma3D'
import { EscenaDental3D } from './EscenaDental3D'
import { ControlesOdontograma3D } from './ControlesOdontograma3D'
import { PanelPieza3D } from './PanelPieza3D'
import { LeyendaClinica } from './LeyendaClinica'

export function Odontograma3D({ pacienteId, odontograma, onVerEnExpediente, onIrAPlan, onUsar2D }) {
  // Mismos datos que la vista 2D — ni una consulta nueva a Supabase. Si el padre ya los cargó (`odontograma`), se
  // reutilizan: alternar 2D↔3D no vuelve a pedirlos.
  const propio = useOdontograma(pacienteId, { habilitado: !odontograma })
  const { piezas, cargando, error, recargar } = odontograma ?? propio
  const { tratamientos } = useTratamientos(pacienteId)
  const {
    piezaSeleccionada, seleccionarPieza, cerrarPanel,
    arcoVisible, setArcoVisible, vistaCamara, setVistaCamara,
    mostrarEtiquetas, setMostrarEtiquetas
  } = useOdontograma3D()

  // Las funciones de zoom las expone EscenaDental3D en cuanto la
  // cámara está lista (mismo patrón que focusOnTooth) — se guardan en
  // un ref para no provocar un re-render cada vez que se conectan.
  const controlesZoomRef = useRef(null)

  // OJO: NO se devuelve "Cargando…" en lugar de la escena. Desmontar el <Canvas> destruye el contexto WebGL y
  // reinicia la cámara; se deja montado y el aviso va ENCIMA.
  const sinDatos = piezas.length === 0

  return (
    <div className="space-y-4">
      <ControlesOdontograma3D
        arcoVisible={arcoVisible}
        onCambiarArco={setArcoVisible}
        onCambiarVista={setVistaCamara}
        mostrarEtiquetas={mostrarEtiquetas}
        onCambiarEtiquetas={setMostrarEtiquetas}
        onZoomIn={() => controlesZoomRef.current?.zoomIn()}
        onZoomOut={() => controlesZoomRef.current?.zoomOut()}
      />

      {error && !cargando && !sinDatos && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
          <span>{error} Se muestran los últimos datos cargados.</span>
          <button onClick={recargar} className="rounded-md border border-amber-300 px-2 py-1 font-medium hover:bg-amber-100">Reintentar</button>
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="relative h-[420px] overflow-hidden rounded-xl border border-slate-200 bg-slate-50 lg:h-[520px] lg:w-[70%]">
          <EscenaDental3D
            piezas={piezas}
            piezaSeleccionadaId={piezaSeleccionada?.id ?? null}
            onSeleccionarPieza={seleccionarPieza}
            arcoVisible={arcoVisible}
            vistaCamara={vistaCamara}
            mostrarEtiquetas={mostrarEtiquetas}
            onZoomControlsListo={(controles) => { controlesZoomRef.current = controles }}
            onUsar2D={onUsar2D}
          />
          {cargando && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-50/90 text-sm text-slate-500" role="status">Cargando odontograma…</div>
          )}
          {!cargando && error && sinDatos && (
            <div role="alert" className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-50/95 p-6 text-center text-sm text-slate-600">
              <p>{error}</p>
              <button onClick={recargar} className="rounded-lg bg-clinico-azul px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">Reintentar</button>
            </div>
          )}
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
        Modelo anatómico 3D interactivo. Arrastra para rotar y usa la rueda del mouse para acercar o alejar.
      </p>
    </div>
  )
}
