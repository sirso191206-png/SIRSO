import { Icon } from './Icon'

export function Modal({ abierto, onCerrar, titulo, children, ancho = 'normal' }) {
  if (!abierto) return null

  const anchoClase = ancho === 'grande' ? 'max-w-3xl' : 'max-w-lg'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]"
      onClick={onCerrar}
    >
      <div
        className={`w-full ${anchoClase} max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl shadow-slate-900/10 ring-1 ring-slate-200/60 sm:p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-slate-800">{titulo}</h2>
          <button onClick={onCerrar} className="text-slate-400 transition-colors duration-150 hover:text-slate-600" aria-label="Cerrar">
            <Icon.x />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
