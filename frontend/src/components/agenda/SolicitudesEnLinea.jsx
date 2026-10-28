import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { usePacientes } from '../../hooks/usePacientes'
import { toastExito, toastError } from '../../store/useToastStore'
import { capitalizarPrimeraLetra } from '../../lib/texto'
import { infoEstado } from './constantes'

const fechaHora = (iso) => capitalizarPrimeraLetra(new Date(iso).toLocaleString('es-MX', {
  weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
}))

// Lista de solicitudes de cita en línea pendientes (botón de la Agenda).
export function ModalSolicitudesEnLinea({ abierto, onCerrar, solicitudes, onAbrir }) {
  const info = infoEstado('pendiente_confirmar')
  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Solicitudes en línea">
      {solicitudes.length === 0 && <p className="text-sm text-slate-400">No hay solicitudes pendientes de confirmar.</p>}
      <ul className="space-y-2">
        {solicitudes.map((s) => (
          <li key={s.id}>
            <button onClick={() => onAbrir(s)} className="w-full rounded-lg border border-slate-200 p-3 text-left text-sm hover:bg-slate-50"
              style={{ borderLeftWidth: 4, borderLeftColor: info.color }}>
              <div className="font-medium text-slate-800">{s.nombre} · {s.servicio_nombre}</div>
              <div className="text-xs text-slate-500">{fechaHora(s.inicio)}{s.dentista?.nombre && ` · ${s.dentista.nombre}`}</div>
              <div className="text-xs" style={{ color: info.texto }}>{info.label}</div>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

// Detalle de una solicitud: confirmar (con paciente nuevo o existente) o rechazar. Solo owner y recepción pueden
// resolverla (`puedeGestionar`); la base de datos lo exige igual.
export function ModalSolicitudCita({ solicitud, onCerrar, onConfirmar, onRechazar, puedeGestionar }) {
  const [termino, setTermino] = useState(solicitud?.nombre ?? '')
  const [vincular, setVincular] = useState(false)
  const [pacienteId, setPacienteId] = useState('')
  const [rechazando, setRechazando] = useState(false)
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const { pacientes } = usePacientes(vincular ? termino : '')
  if (!solicitud) return null
  const info = infoEstado('pendiente_confirmar')

  const confirmar = async () => {
    if (vincular && !pacienteId) { toastError('Elige el paciente o crea uno nuevo.'); return }
    setOcupado(true)
    try {
      await onConfirmar(solicitud.id, vincular ? pacienteId : null)
      toastExito('Cita confirmada y agregada a la agenda. Avísale al paciente.')
      onCerrar()
    } catch (err) {
      toastError(err.message)
    } finally {
      setOcupado(false)
    }
  }

  const rechazar = async () => {
    setOcupado(true)
    try {
      await onRechazar(solicitud.id, motivoRechazo)
      toastExito('Solicitud rechazada. Avísale al paciente.')
      onCerrar()
    } catch (err) {
      toastError(err.message)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Modal abierto onCerrar={onCerrar} titulo="Solicitud de cita en línea">
      <div className="space-y-4 text-sm">
        <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: info.fondo, color: info.texto }}>{info.label}</span>
        <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1">
          <dt className="text-slate-500">Paciente</dt><dd className="font-medium text-slate-800">{solicitud.nombre}</dd>
          <dt className="text-slate-500">Teléfono</dt><dd><a href={`tel:${solicitud.telefono.replace(/[^0-9+]/g, '')}`} className="text-clinico-azul hover:underline">{solicitud.telefono}</a></dd>
          <dt className="text-slate-500">Correo</dt><dd className="break-all">{solicitud.correo}</dd>
          <dt className="text-slate-500">Servicio</dt><dd>{solicitud.servicio_nombre}</dd>
          <dt className="text-slate-500">Cuándo</dt><dd>{fechaHora(solicitud.inicio)}</dd>
          {solicitud.dentista?.nombre && <><dt className="text-slate-500">Dentista</dt><dd>{solicitud.dentista.nombre}</dd></>}
          {solicitud.motivo && <><dt className="text-slate-500">Motivo</dt><dd className="whitespace-pre-wrap">{solicitud.motivo}</dd></>}
        </dl>

        {puedeGestionar && !rechazando && (
          <div className="space-y-3 border-t border-slate-100 pt-3">
            <label className="flex items-center gap-2">
              <input type="radio" checked={!vincular} onChange={() => setVincular(false)} /> Crear un paciente nuevo con estos datos
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={vincular} onChange={() => setVincular(true)} /> Ya es paciente de la clínica
            </label>
            {vincular && (
              <div className="space-y-2 pl-6">
                <Input label="Buscar paciente" value={termino} onChange={(e) => setTermino(e.target.value)} />
                <select value={pacienteId} onChange={(e) => setPacienteId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" aria-label="Paciente">
                  <option value="">Selecciona un paciente</option>
                  {pacientes.map((p) => <option key={p.id} value={p.id}>{p.nombre_completo}{p.telefono ? ` · ${p.telefono}` : ''}</option>)}
                </select>
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={confirmar} disabled={ocupado} className="flex-1">{ocupado ? 'Guardando…' : 'Confirmar cita'}</Button>
              <Button variante="secundario" onClick={() => setRechazando(true)} disabled={ocupado}>Rechazar</Button>
            </div>
          </div>
        )}

        {puedeGestionar && rechazando && (
          <div className="space-y-3 border-t border-slate-100 pt-3">
            <Input label="Motivo del rechazo (opcional, uso interno)" value={motivoRechazo} maxLength={300} onChange={(e) => setMotivoRechazo(e.target.value)} />
            <div className="flex gap-2">
              <Button variante="peligro" onClick={rechazar} disabled={ocupado} className="flex-1">{ocupado ? 'Guardando…' : 'Rechazar solicitud'}</Button>
              <Button variante="secundario" onClick={() => setRechazando(false)} disabled={ocupado}>Volver</Button>
            </div>
          </div>
        )}

        {!puedeGestionar && <p className="text-xs text-slate-500">Recepción o el owner confirman esta solicitud.</p>}
      </div>
    </Modal>
  )
}
