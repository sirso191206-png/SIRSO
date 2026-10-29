const colores = {
  planeado: 'bg-slate-100 text-slate-700',
  aceptado: 'bg-blue-100 text-blue-800',
  en_progreso: 'bg-amber-100 text-amber-800',
  pausado: 'bg-purple-100 text-purple-800',
  completado: 'bg-green-100 text-green-800',
  cancelado: 'bg-red-100 text-red-800',
  agendada: 'bg-slate-100 text-slate-700',
  confirmada: 'bg-blue-100 text-blue-800',
  no_asistio: 'bg-red-100 text-red-800'
}

// Sin texto propio se muestra el estado legible («en_progreso» → «En progreso»), nunca el valor técnico en minúsculas.
function etiquetaEstado(estado) {
  const t = String(estado ?? '').replace(/_/g, ' ').trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''
}

export function Badge({ estado, children }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${colores[estado] ?? 'bg-slate-100 text-slate-700'}`}>
      {children ?? etiquetaEstado(estado)}
    </span>
  )
}
