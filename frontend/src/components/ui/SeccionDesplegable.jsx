// Tarjeta que se abre y se cierra (details/summary nativo: accesible con teclado y lector de pantalla).
// Controlada con `abierta` + `onCambiar`; sin `abierta`, empieza como diga `abiertaInicial`.
export function SeccionDesplegable({ id, titulo, resumen, abierta, abiertaInicial = false, onCambiar, children, className = '' }) {
  const controlada = abierta !== undefined
  return (
    <details
      id={id}
      className={`group mb-4 max-w-3xl rounded-xl border border-slate-200 bg-white ${className}`}
      {...(controlada ? { open: abierta } : { open: abiertaInicial })}
      onToggle={(e) => onCambiar?.(e.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-sm font-semibold text-slate-800">{titulo}</span>
          {resumen && <span className="block text-xs text-slate-500">{resumen}</span>}
        </span>
        <span aria-hidden="true" className="text-slate-400 transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="border-t border-slate-100 px-6 pb-6 pt-4">{children}</div>
    </details>
  )
}
