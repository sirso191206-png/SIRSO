import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/useAuthStore'
import { toastExito, toastError } from '../../store/useToastStore'
import { ESTADOS_CITA, infoEstado, ESTADOS_FINALES } from './constantes'
import { Button } from '../ui/Button'
import { ConfirmModal } from '../ui/ConfirmModal'

export function PanelCita({ cita, onCerrar, onCambiarEstado, onReagendar, onDesagendar }) {
  const navigate = useNavigate()
  const perfil = useAuthStore((s) => s.perfil)
  const [reprogramando, setReprogramando] = useState(false)
  const [nuevoInicio, setNuevoInicio] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [modalEliminar, setModalEliminar] = useState(false)

  const info = infoEstado(cita.estado)
  const finalizada = ESTADOS_FINALES.includes(cita.estado)
  const duracionMin = Math.round((new Date(cita.fin) - new Date(cita.inicio)) / 60000)

  const ejecutar = async (accion, mensajeExito) => {
    setProcesando(true)
    try {
      await accion()
      toastExito(mensajeExito)
    } catch (err) {
      toastError(err.message)
    } finally {
      setProcesando(false)
    }
  }

  const handleReprogramar = async (e) => {
    e.preventDefault()
    setProcesando(true)
    try {
      const inicioDate = new Date(nuevoInicio)
      const finDate = new Date(inicioDate.getTime() + duracionMin * 60000)
      await onReagendar(cita.id, { inicio: inicioDate.toISOString(), fin: finDate.toISOString() })
      toastExito('Cita reprogramada.')
      setReprogramando(false)
      onCerrar()
    } catch (err) {
      toastError(err.message)
    } finally {
      setProcesando(false)
    }
  }

  const handleEliminar = async () => {
    setProcesando(true)
    try {
      await onDesagendar(cita.id)
      toastExito('Cita eliminada.')
      onCerrar()
    } catch (err) {
      toastError(err.message)
    } finally {
      setProcesando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onCerrar}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: info.fondo, color: info.texto }}>
            {info.label}
          </span>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <h2 className="mb-4 text-lg font-semibold text-slate-800">{cita.paciente?.nombre_completo}</h2>

        <dl className="mb-6 space-y-2 text-sm">
          <Fila etiqueta="Teléfono" valor={cita.paciente?.telefono} />
          <Fila etiqueta="Fecha" valor={new Date(cita.inicio).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })} />
          <Fila
            etiqueta="Horario"
            valor={`${new Date(cita.inicio).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} – ${new Date(cita.fin).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} (${duracionMin} min)`}
          />
          <Fila etiqueta="Dentista" valor={cita.dentista?.nombre} />
          {cita.motivo_consulta && <Fila etiqueta="Motivo" valor={cita.motivo_consulta} />}
          {cita.consultorio && <Fila etiqueta="Consultorio" valor={cita.consultorio} />}
          {cita.notas && <Fila etiqueta="Notas" valor={cita.notas} />}
        </dl>

        {!finalizada && !reprogramando && (
          <div className="mb-6 grid grid-cols-2 gap-2">
            {cita.estado === 'pendiente_confirmar' && (
              <Button onClick={() => ejecutar(() => onCambiarEstado(cita.id, 'confirmada'), 'Cita confirmada.')} disabled={procesando}>
                Confirmar
              </Button>
            )}
            {['agendada', 'confirmada'].includes(cita.estado) && (
              <Button variante="secundario" onClick={() => ejecutar(() => onCambiarEstado(cita.id, 'en_espera'), 'Paciente marcado en espera.')} disabled={procesando}>
                Marcar en espera
              </Button>
            )}
            {['agendada', 'confirmada', 'en_espera'].includes(cita.estado) && (
              <Button variante="secundario" onClick={() => ejecutar(() => onCambiarEstado(cita.id, 'en_consulta'), 'Consulta iniciada.')} disabled={procesando}>
                Iniciar consulta
              </Button>
            )}
            {cita.estado === 'en_consulta' && (
              <Button onClick={() => ejecutar(() => onCambiarEstado(cita.id, 'completada'), 'Cita completada.')} disabled={procesando}>
                Completar
              </Button>
            )}
            <Button variante="secundario" onClick={() => setReprogramando(true)} disabled={procesando}>
              Reprogramar
            </Button>
            <Button
              variante="peligro"
              onClick={() => ejecutar(() => onCambiarEstado(cita.id, 'cancelada'), 'Cita cancelada.')}
              disabled={procesando}
            >
              Cancelar
            </Button>
          </div>
        )}

        {reprogramando && (
          <form onSubmit={handleReprogramar} className="mb-6 space-y-3 rounded-lg border border-slate-200 p-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Nueva fecha y hora</span>
              <input
                type="datetime-local"
                required
                value={nuevoInicio}
                onChange={(e) => setNuevoInicio(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={procesando} className="flex-1">
                {procesando ? 'Guardando…' : 'Confirmar'}
              </Button>
              <Button type="button" variante="secundario" onClick={() => setReprogramando(false)} className="flex-1">
                Cancelar
              </Button>
            </div>
          </form>
        )}

        <Button variante="secundario" onClick={() => navigate(`/pacientes/${cita.paciente_id}`)} className="w-full">
          Ver expediente
        </Button>

        {perfil?.rol === 'owner' && (
          <button
            onClick={() => setModalEliminar(true)}
            className="mt-4 block w-full text-center text-xs text-slate-400 hover:text-clinico-rojo"
          >
            Eliminar esta cita por completo
          </button>
        )}
      </div>

      <ConfirmModal
        abierto={modalEliminar}
        onCerrar={() => setModalEliminar(false)}
        onConfirmar={handleEliminar}
        confirmando={procesando}
        titulo="Eliminar cita"
        mensaje="¿Eliminar por completo esta cita? A diferencia de cancelarla, esto la borra del historial y no se puede deshacer."
        textoConfirmar="Eliminar"
      />
    </div>
  )
}

function Fila({ etiqueta, valor }) {
  if (!valor) return null
  return (
    <div className="flex justify-between gap-3 border-b border-slate-50 pb-2">
      <dt className="shrink-0 text-slate-400">{etiqueta}</dt>
      <dd className="text-right text-slate-700">{valor}</dd>
    </div>
  )
}
