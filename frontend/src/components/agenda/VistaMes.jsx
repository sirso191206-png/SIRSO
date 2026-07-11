import { infoEstado } from './constantes'

function inicioDeSemanaLunes(fecha) {
  const d = new Date(fecha)
  const dia = d.getDay()
  const diff = d.getDate() - dia + (dia === 0 ? -6 : 1)
  return new Date(d.setDate(diff))
}

export function VistaMes({ mes, citas, onClickDia }) {
  const inicioMes = new Date(mes.getFullYear(), mes.getMonth(), 1)
  const inicioGrid = inicioDeSemanaLunes(inicioMes)
  const dias = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(inicioGrid)
    d.setDate(d.getDate() + i)
    return d
  })
  const hoy = new Date()

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-xs font-medium text-slate-500">
        {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((d) => (
          <div key={d} className="px-2 py-2 text-center">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {dias.map((d) => {
          const esMesActual = d.getMonth() === inicioMes.getMonth()
          const esHoy = d.toDateString() === hoy.toDateString()
          const citasDelDia = citas.filter((c) => new Date(c.inicio).toDateString() === d.toDateString())

          return (
            <button
              key={d.toISOString()}
              onClick={() => onClickDia(d)}
              className={`min-h-[90px] border-b border-r border-slate-100 p-1.5 text-left align-top hover:bg-clinico-azulClaro/30 ${
                esMesActual ? 'bg-white' : 'bg-slate-50'
              }`}
            >
              <span className={`text-xs ${esHoy ? 'rounded-full bg-clinico-azul px-1.5 py-0.5 text-white' : esMesActual ? 'text-slate-700' : 'text-slate-300'}`}>
                {d.getDate()}
              </span>
              <div className="mt-1 space-y-0.5">
                {citasDelDia.slice(0, 3).map((c) => {
                  const info = infoEstado(c.estado)
                  return (
                    <div
                      key={c.id}
                      className="truncate rounded px-1 py-0.5 text-[10px]"
                      style={{ backgroundColor: info.fondo, color: info.texto }}
                    >
                      {new Date(c.inicio).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} {c.paciente?.nombre_completo}
                    </div>
                  )
                })}
                {citasDelDia.length > 3 && (
                  <div className="text-[10px] text-slate-400">+{citasDelDia.length - 3} más</div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
