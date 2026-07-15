const BOTONES = [
  { id: 'restablecer', label: 'Restablecer vista', arco: 'ambas', vista: 'restablecer' },
  { id: 'ambas', label: 'Ambas arcadas', arco: 'ambas', vista: 'ambas' },
  { id: 'superior', label: 'Arcada superior', arco: 'superior', vista: 'superior' },
  { id: 'inferior', label: 'Arcada inferior', arco: 'inferior', vista: 'inferior' },
  { id: 'frontal', label: 'Vista frontal', vista: 'frontal' },
  { id: 'oclusal', label: 'Vista oclusal', vista: 'oclusal' },
  { id: 'lateral', label: 'Vista lateral', vista: 'lateral' }
]

export function ControlesOdontograma3D({ onCambiarArco, onCambiarVista }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Controles de la vista anatómica 3D">
      {BOTONES.map((b) => (
        <button
          key={b.id}
          onClick={() => {
            if (b.arco) onCambiarArco(b.arco)
            onCambiarVista(b.vista)
          }}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-clinico-azul"
        >
          {b.label}
        </button>
      ))}
    </div>
  )
}
