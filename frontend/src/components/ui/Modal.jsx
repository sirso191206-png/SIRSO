export function Modal({ abierto, onCerrar, titulo, children, ancho = 'normal' }) {
  if (!abierto) return null

  const anchoClase = ancho === 'grande' ? 'max-w-3xl' : 'max-w-lg'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`w-full ${anchoClase} max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">{titulo}</h2>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-600" aria-label="Cerrar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
