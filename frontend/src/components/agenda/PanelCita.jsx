import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/useAuthStore'
import { toastExito, toastError } from '../../store/useToastStore'
import { infoEstado, ESTADOS_FINALES } from './constantes'
import { Button } from '../ui/Button'
import { ConfirmModal } from '../ui/ConfirmModal'
import { useConsultasPendientes } from '../../hooks/useConsultasPendientes'
import { CorregirCitaCompletada } from './CorregirCitaCompletada'
import { Icon } from '../ui/Icon'

// Valor para un <input type="datetime-local"> en hora LOCAL (toISOString daría la hora UTC).
function fechaHoraLocal(iso) {
  const d = new Date(iso)
  const dos = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`
}

export function PanelCita({ cita, onCerrar, onCambiarEstado, onReagendar, onDesagendar, onCorregida }) {
  const navigate = useNavigate()
  const perfil = useAuthStore((s) => s.perfil)
  const [reprogramando, setReprogramando] = useState(false)
  const [nuevoInicio, setNuevoInicio] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [modalEliminar, setModalEliminar] = useState(false)
  const [modalCancelar, setModalCancelar] = useState(false)
  // «No asistió» solo tiene sentido cuando la hora de la cita ya llegó.
  const yaEmpezo = new Date(cita.inicio) <= new Date()
  const puedeAbrirConsulta = ['owner', 'dentista', 'asistente'].includes(perfil?.rol)

  const info = infoEstado(cita.estado)
  // ¿Esta cita quedó completada SIN nota? (el servidor decide: roles, plan, clínica y sucursal)
  const { pendientes } = useConsultasPendientes(365, cita.estado === 'completada')
  const consultaPendiente = cita.estado === 'completada' && pendientes.some((p) => p.cita_id === cita.id)
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
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: info.fondo, color: info.texto }}>
            <info.iconoComponente /> {info.label}
          </span>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-600" aria-label="Cerrar"><Icon.x /></button>
        </div>

        <h2 className="mb-4 text-lg font-semibold text-slate-800">{cita.paciente?.nombre_completo}</h2>

        <dl className="mb-6 space-y-2 text-sm">
          {cita.paciente?.telefono && (
            <div className="flex justify-between gap-3 border-b border-slate-50 pb-2">
              <dt className="shrink-0 text-slate-400">Teléfono</dt>
              <dd className="text-right">
                <a href={`tel:${cita.paciente.telefono}`} className="inline-flex items-center gap-1.5 text-clinico-azul hover:underline">
                  <Icon.phone /> {cita.paciente.telefono}
                </a>
              </dd>
            </div>
          )}
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

        {consultaPendiente && (
          <div role="alert" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-consulta-pendiente>
            <div className="mb-1 font-semibold">Consulta sin nota clínica</div>
            <p className="mb-2">Esta cita se marcó como completada sin guardar su nota. Complétala para que el expediente quede íntegro.</p>
            <Button variante="secundario" onClick={() => navigate(`/consulta/${cita.id}`)}>Completar consulta</Button>
          </div>
        )}

        {/* Corregir/reabrir una consulta YA completada: motivo obligatorio, por rol y con auditoría (migración 094). Recepción y asistente no ven nada. */}
        {cita.estado === 'completada' && <CorregirCitaCompletada cita={cita} onCorregida={async () => { await onCorregida?.(); onCerrar() }} />}

        {!finalizada && !reprogramando && (
          <div className="mb-6 grid grid-cols-2 gap-2">
            {cita.estado === 'pendiente_confirmar' && (
              <Button onClick={() => ejecutar(() => onCambiarEstado(cita.id, 'confirmada'), 'Cita confirmada.')} disabled={procesando} className="inline-flex items-center justify-center gap-1.5">
                <Icon.check /> Confirmar
              </Button>
            )}
            {['agendada', 'confirmada'].includes(cita.estado) && (
              <Button variante="secundario" onClick={() => ejecutar(() => onCambiarEstado(cita.id, 'en_espera'), 'Paciente marcado en espera.')} disabled={procesando} className="inline-flex items-center justify-center gap-1.5">
                <Icon.clock /> En espera
              </Button>
            )}
            {['agendada', 'confirmada', 'en_espera'].includes(cita.estado) && (
              <Button
                variante="secundario"
                onClick={() => ejecutar(async () => {
                  await onCambiarEstado(cita.id, 'en_consulta')
                  // Quien atiende va directo a la consulta; recepción solo marca el estado.
                  if (puedeAbrirConsulta) navigate(`/consulta/${cita.id}`)
                }, 'Consulta iniciada.')}
                disabled={procesando} className="inline-flex items-center justify-center gap-1.5">
                <Icon.play /> Iniciar consulta
              </Button>
            )}
            {cita.estado === 'en_consulta' && (
              // Finalizar es un acto CLÍNICO: abre la consulta (nota, verificación, seguimiento). La cita NUNCA se completa desde aquí.
              <Button onClick={() => navigate(`/consulta/${cita.id}`)} disabled={procesando} className="inline-flex items-center justify-center gap-1.5">
                <Icon.checkCircle /> Finalizar consulta
              </Button>
            )}
            {['pendiente_confirmar', 'agendada', 'confirmada', 'en_espera'].includes(cita.estado) && yaEmpezo && (
              // Inasistencia: acción ADMINISTRATIVA, no genera nota clínica.
              <Button variante="secundario" onClick={() => ejecutar(() => onCambiarEstado(cita.id, 'no_asistio'), 'Cita marcada como no asistió.')} disabled={procesando} className="inline-flex items-center justify-center gap-1.5">
                <Icon.x /> No asistió
              </Button>
            )}
            <Button variante="secundario" onClick={() => { setNuevoInicio(fechaHoraLocal(cita.inicio)); setReprogramando(true) }} disabled={procesando} className="inline-flex items-center justify-center gap-1.5">
              <Icon.refresh /> Reprogramar
            </Button>
            <Button
              variante="peligro"
              onClick={() => setModalCancelar(true)}
              disabled={procesando}
              className="inline-flex items-center justify-center gap-1.5"
            >
              <Icon.x /> Cancelar cita
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
                No reprogramar
              </Button>
            </div>
          </form>
        )}

        <Button variante="secundario" onClick={() => navigate(`/pacientes/${cita.paciente_id}`)} className="inline-flex w-full items-center justify-center gap-1.5">
          <Icon.clipboard /> Ver expediente
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
        abierto={modalCancelar}
        onCerrar={() => setModalCancelar(false)}
        onConfirmar={async () => {
          await ejecutar(() => onCambiarEstado(cita.id, 'cancelada'), 'Cita cancelada.')
          setModalCancelar(false)
        }}
        confirmando={procesando}
        titulo="Cancelar cita"
        mensaje={`¿Cancelar la cita de ${cita.paciente?.nombre_completo ?? 'este paciente'} del ${new Date(cita.inicio).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })} a las ${new Date(cita.inicio).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}? El horario queda libre; para volver a atenderlo habrá que agendar una cita nueva.`}
        textoConfirmar="Sí, cancelar la cita"
        textoCerrar="No, conservarla"
      />
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
