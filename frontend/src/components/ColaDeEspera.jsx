import { useNavigate } from 'react-router-dom'
import { useColaDeEspera } from '../hooks/useColaDeEspera'
import { toastExito, toastError } from '../store/useToastStore'
import { infoEstado } from './agenda/constantes'

const ETIQUETA_BOTON_SIGUIENTE = {
  pendiente_confirmar: { label: 'Confirmar', siguiente: 'confirmada' },
  agendada: { label: 'Llegó', siguiente: 'en_espera' },
  confirmada: { label: 'Llegó', siguiente: 'en_espera' },
  en_espera: { label: 'Iniciar consulta', siguiente: 'en_consulta' },
  pausado: { label: 'Reanudar', siguiente: 'en_consulta' }
}

export function ColaDeEspera({ onIniciarConsulta }) {
  const { turnos, cargando, cambiarEstado } = useColaDeEspera()
  const navigate = useNavigate()

  const handleAccion = async (turno, nuevoEstado) => {
    try {
      if (nuevoEstado === 'en_consulta') {
        await onIniciarConsulta(turno)
      } else {
        await cambiarEstado(turno.id, nuevoEstado)
        toastExito('Turno actualizado.')
      }
    } catch (err) {
      toastError(err.message)
    }
  }

  if (cargando) return <p className="text-sm text-slate-400">Cargando cola…</p>

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-700">Cola de espera</h2>
      </div>

      {turnos.length === 0 ? (
        <p className="p-4 text-sm text-slate-400">No hay turnos activos por ahora.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {turnos.map((t) => {
            const info = infoEstado(t.estado)
            const accion = ETIQUETA_BOTON_SIGUIENTE[t.estado]
            return (
              <div key={t.id} className="flex items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-400">Turno {t.numero_turno}</span>
                    {t.es_urgencia && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-clinico-rojo">
                        URGENCIA
                      </span>
                    )}
                  </div>
                  <p className="truncate text-sm font-medium text-slate-800">{t.paciente?.nombre_completo}</p>
                  <p className="truncate text-xs text-slate-400">{t.motivo_consulta || t.dentista?.nombre}</p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ backgroundColor: info.fondo, color: info.texto }}>
                    {info.label}
                  </span>
                  <div className="flex gap-1.5 text-xs">
                    {accion && (
                      <button onClick={() => handleAccion(t, accion.siguiente)} className="font-medium text-clinico-azul hover:underline">
                        {accion.label}
                      </button>
                    )}
                    {t.estado === 'en_consulta' && (
                      <button onClick={() => navigate(`/consulta/${t.id}`)} className="font-medium text-clinico-azul hover:underline">
                        Continuar
                      </button>
                    )}
                    {!['completada', 'cancelada', 'no_asistio'].includes(t.estado) && (
                      <button onClick={() => handleAccion(t, 'cancelada')} className="font-medium text-slate-400 hover:text-clinico-rojo">
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
