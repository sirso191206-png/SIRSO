import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { buscarPosiblesDuplicados, crearPaciente } from '../services/pacientes'
import { crearCitaUrgencia } from '../services/citas'
import { useAuthStore } from '../store/useAuthStore'
import { toastExito, toastError } from '../store/useToastStore'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Input } from './ui/Input'

const PRIORIDADES = [
  { value: 'urgente', label: 'Urgente' },
  { value: 'alta', label: 'Alta' },
  { value: 'normal', label: 'Normal' }
]

export function ModalNuevaUrgencia({ abierto, onCerrar, onCreada }) {
  const perfil = useAuthStore((s) => s.perfil)
  const navigate = useNavigate()

  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [motivo, setMotivo] = useState('')
  const [prioridad, setPrioridad] = useState('urgente')
  const [posiblesDuplicados, setPosiblesDuplicados] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const cerrar = () => {
    setNombre('')
    setTelefono('')
    setMotivo('')
    setPrioridad('urgente')
    setPosiblesDuplicados(null)
    onCerrar()
  }

  const handleBuscarDuplicados = async (e) => {
    e.preventDefault()
    if (!nombre.trim() || !telefono.trim()) {
      toastError('Nombre y teléfono son obligatorios.')
      return
    }
    const posibles = await buscarPosiblesDuplicados({ nombre_completo: nombre, telefono })
    if (posibles.length > 0) {
      setPosiblesDuplicados(posibles)
    } else {
      await registrarUrgencia(null)
    }
  }

  const registrarUrgencia = async (pacienteExistente) => {
    setGuardando(true)
    try {
      let pacienteId = pacienteExistente?.id

      if (!pacienteId) {
        const nuevo = await crearPaciente({ nombre_completo: nombre.trim(), telefono: telefono.trim() })
        pacienteId = nuevo.id
      }

      const dentistaId = perfil.rol === 'dentista' ? perfil.id : null

      const cita = await crearCitaUrgencia({
        pacienteId,
        dentistaId,
        motivo,
        prioridad
      })

      toastExito('Urgencia registrada y agregada a la cola de espera.')
      onCreada?.()
      cerrar()

      // Si quien registra es el propio dentista, lo mandamos directo a
      // atenderla — para consultorios donde trabaja solo, sin recepción.
      if (dentistaId) {
        navigate(`/consulta/${cita.id}`)
      }
    } catch (err) {
      toastError('No se pudo registrar la urgencia: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={cerrar} titulo="Nueva urgencia">
      {posiblesDuplicados ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Encontramos pacientes parecidos — confirma si es alguno de ellos, o continúa como paciente nuevo.
          </p>
          {posiblesDuplicados.map((p) => (
            <button
              key={p.id}
              onClick={() => registrarUrgencia(p)}
              disabled={guardando}
              className="w-full rounded-lg border border-slate-200 p-3 text-left text-sm hover:border-clinico-azul hover:bg-clinico-azulClaro"
            >
              <div className="font-medium text-slate-800">{p.nombre_completo}</div>
              <div className="text-xs text-slate-400">{p.telefono}</div>
            </button>
          ))}
          <Button variante="secundario" onClick={() => registrarUrgencia(null)} disabled={guardando} className="w-full">
            {guardando ? 'Guardando…' : 'Es un paciente nuevo, continuar'}
          </Button>
        </div>
      ) : (
        <form onSubmit={handleBuscarDuplicados} className="space-y-4">
          <Input label="Nombre completo" required value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
          <Input label="Teléfono" required value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          <Input label="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Dolor intenso pieza 36" />

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Prioridad</span>
            <select value={prioridad} onChange={(e) => setPrioridad(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {PRIORIDADES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>

          <Button type="submit" disabled={guardando} className="w-full">
            {guardando ? 'Registrando…' : 'Registrar urgencia'}
          </Button>
        </form>
      )}
    </Modal>
  )
}
