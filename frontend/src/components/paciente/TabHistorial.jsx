import { useState } from 'react'
import { useLineaTiempo } from '../../hooks/useLineaTiempo'
import { Icon } from '../ui/Icon'

const FILTROS = [
  { value: 'todos', label: 'Todos' },
  { value: 'nota', label: 'Consultas' },
  { value: 'tratamiento', label: 'Tratamientos' },
  { value: 'pago', label: 'Pagos' },
  { value: 'cita', label: 'Citas' },
  { value: 'foto', label: 'Fotografías' },
  { value: 'consentimiento', label: 'Consentimientos' }
]

const ICONO_TIPO = {
  paciente: Icon.user, cita: Icon.calendar, pago: Icon.dollar, tratamiento: Icon.sparkles,
  foto: Icon.camera, nota: Icon.edit, documento: Icon.fileText, consentimiento: Icon.edit
}

const TAMANO_PAGINA = 15

export function TabHistorial({ pacienteId, filtroInicial = 'todos' }) {
  const { eventos, cargando, error } = useLineaTiempo(pacienteId)
  const [filtro, setFiltro] = useState(filtroInicial)
  const [visibles, setVisibles] = useState(TAMANO_PAGINA)

  if (cargando) return <p className="text-slate-400">Cargando historial…</p>
  if (error) return <p className="text-clinico-rojo">{error}</p>

  const eventosFiltrados = filtro === 'todos' ? eventos : eventos.filter((e) => e.tipo === filtro)
  const eventosVisibles = eventosFiltrados.slice(0, visibles)
  const hayMas = eventosFiltrados.length > visibles

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.value}
            onClick={() => { setFiltro(f.value); setVisibles(TAMANO_PAGINA) }}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filtro === f.value ? 'bg-clinico-azul text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        {eventosVisibles.length === 0 && <p className="text-sm text-slate-400">Sin actividad en esta categoría.</p>}
        <div className="space-y-3">
          {eventosVisibles.map((ev) => (
            <div key={ev.id} className="flex gap-3 text-sm">
              <span className="text-slate-400">{(() => { const IconoEvento = ICONO_TIPO[ev.tipo]; return IconoEvento ? <IconoEvento /> : <span className="text-base leading-none">•</span> })()}</span>
              <div>
                <div className="text-slate-700">{ev.texto}</div>
                <div className="text-xs text-slate-400">
                  {new Date(ev.fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
                  {' · '}
                  {new Date(ev.fecha).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}
        </div>
        {hayMas && (
          <button
            onClick={() => setVisibles((v) => v + TAMANO_PAGINA)}
            className="mt-4 w-full rounded-lg border border-slate-200 py-2 text-sm font-medium text-clinico-azul hover:bg-slate-50"
          >
            Mostrar más
          </button>
        )}
      </div>
    </div>
  )
}
