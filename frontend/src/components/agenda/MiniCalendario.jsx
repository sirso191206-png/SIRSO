import { capitalizarPrimeraLetra } from '../../lib/texto'

function inicioDeSemanaLunes(fecha) {
  const d = new Date(fecha)
  const dia = d.getDay()
  const diff = d.getDate() - dia + (dia === 0 ? -6 : 1)
  return new Date(d.setDate(diff))
}

export function MiniCalendario({ mesVisible, fechaSeleccionada, onSeleccionar, onCambiarMes }) {
  const inicioMes = new Date(mesVisible.getFullYear(), mesVisible.getMonth(), 1)
  const inicioGrid = inicioDeSemanaLunes(inicioMes)
  const dias = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(inicioGrid)
    d.setDate(d.getDate() + i)
    return d
  })

  const hoy = new Date()
  const nombreMes = capitalizarPrimeraLetra(inicioMes.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }))

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <button onClick={() => onCambiarMes(-1)} className="rounded px-1.5 text-slate-400 hover:bg-slate-100">‹</button>
        <span className="text-xs font-semibold text-slate-700">{nombreMes}</span>
        <button onClick={() => onCambiarMes(1)} className="rounded px-1.5 text-slate-400 hover:bg-slate-100">›</button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-slate-400">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {dias.map((d) => {
          const esMesActual = d.getMonth() === inicioMes.getMonth()
          const esHoy = d.toDateString() === hoy.toDateString()
          const esSeleccionado = d.toDateString() === fechaSeleccionada.toDateString()
          return (
            <button
              key={d.toISOString()}
              onClick={() => onSeleccionar(d)}
              className={`rounded py-1 text-xs ${
                esSeleccionado
                  ? 'bg-clinico-azul text-white'
                  : esHoy
                    ? 'font-semibold text-clinico-azul'
                    : esMesActual
                      ? 'text-slate-700 hover:bg-slate-100'
                      : 'text-slate-300 hover:bg-slate-50'
              }`}
            >
              {d.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}
