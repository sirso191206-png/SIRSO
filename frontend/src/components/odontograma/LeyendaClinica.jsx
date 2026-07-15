const ITEMS = [
  { simbolo: '●', color: '#DC2626', texto: 'Diagnóstico pendiente (caries)' },
  { simbolo: '●', color: '#EA580C', texto: 'Tratamiento planeado' },
  { simbolo: '✓', color: '#0891B2', texto: 'Tratamiento realizado' },
  { simbolo: '×', color: '#94A3B8', texto: 'Pieza ausente' },
  { simbolo: '◆', color: '#7C3AED', texto: 'Implante' },
  { simbolo: '●', color: '#D97706', texto: 'Corona' }
]

export function LeyendaClinica() {
  return (
    <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
      {ITEMS.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <span style={{ color: item.color }} className="text-sm font-bold leading-none">{item.simbolo}</span>
          {item.texto}
        </span>
      ))}
    </div>
  )
}
