const OPCIONES_ARCADA = [
  { value: 'ambas', label: 'Ambas arcadas' },
  { value: 'superior', label: 'Arcada superior' },
  { value: 'inferior', label: 'Arcada inferior' }
]

const BOTONES_VISTA = [
  { id: 'frontal', label: 'Frontal' },
  { id: 'oclusal', label: 'Oclusal' },
  { id: 'lateral', label: 'Lateral' }
]

export function ControlesOdontograma3D({ arcoVisible, onCambiarArco, onCambiarVista, mostrarEtiquetas, onCambiarEtiquetas, onZoomIn, onZoomOut }) {
  return (
    <div
      className="flex items-center gap-2 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1.5"
      role="group"
      aria-label="Controles de la vista anatómica 3D"
    >
      <button
        onClick={() => { onCambiarArco('ambas'); onCambiarVista('restablecer') }}
        aria-label="Restablecer vista"
        title="Restablecer vista"
        className="shrink-0 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-clinico-azul"
      >
        ↻
      </button>

      <select
        value={arcoVisible}
        onChange={(e) => { onCambiarArco(e.target.value); onCambiarVista(e.target.value) }}
        aria-label="Elegir arcada visible"
        className="shrink-0 rounded-md border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-clinico-azul"
      >
        {OPCIONES_ARCADA.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <div className="h-5 w-px shrink-0 bg-slate-200" />

      {BOTONES_VISTA.map((b) => (
        <button
          key={b.id}
          onClick={() => onCambiarVista(b.id)}
          className="shrink-0 rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-clinico-azul"
        >
          {b.label}
        </button>
      ))}

      {(onZoomIn || onZoomOut) && (
        <>
          <div className="h-5 w-px shrink-0 bg-slate-200" />
          <button
            onClick={onZoomOut}
            aria-label="Alejar"
            title="Alejar"
            className="shrink-0 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-clinico-azul"
          >
            −
          </button>
          <button
            onClick={onZoomIn}
            aria-label="Acercar"
            title="Acercar"
            className="shrink-0 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-clinico-azul"
          >
            +
          </button>
        </>
      )}

      {onCambiarEtiquetas && (
        <>
          <div className="h-5 w-px shrink-0 bg-slate-200" />
          <button
            onClick={() => onCambiarEtiquetas(!mostrarEtiquetas)}
            aria-pressed={mostrarEtiquetas}
            className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-clinico-azul ${
              mostrarEtiquetas ? 'bg-clinico-azul text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Mostrar números
          </button>
        </>
      )}
    </div>
  )
}
