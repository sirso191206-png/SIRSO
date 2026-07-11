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

export function Badge({ estado, children }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colores[estado] ?? 'bg-slate-100 text-slate-700'}`}>
      {children ?? estado}
    </span>
  )
}
