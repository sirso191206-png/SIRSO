import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { toastExito, toastError } from '../../store/useToastStore'
import { listarDentistas } from '../../services/usuarios'
import { reasignarPaciente } from '../../services/pacientes'

/**
 * Reasignación de odontólogo responsable — SOLO visible/usable para
 * el owner (la base también lo exige vía trigger, esto es solo para
 * no mostrar un control que fallaría al usarlo). "Sin asignar" es una
 * opción válida a propósito: un paciente sin odontólogo responsable
 * queda visible para todos los dentistas de la clínica hasta que
 * alguien lo tome.
 */
export function SelectorDentistaResponsable({ paciente, onReasignado }) {
  const perfil = useAuthStore((s) => s.perfil)
  const [dentistas, setDentistas] = useState([])
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (perfil?.rol === 'owner') {
      listarDentistas().then(setDentistas).catch(() => {})
    }
  }, [perfil])

  if (perfil?.rol !== 'owner') return null

  const handleChange = async (e) => {
    const nuevoId = e.target.value || null
    setGuardando(true)
    try {
      const actualizado = await reasignarPaciente(paciente.id, nuevoId)
      toastExito(nuevoId ? 'Paciente reasignado.' : 'Paciente marcado como sin asignar.')
      onReasignado?.(actualizado)
    } catch (err) {
      toastError('No se pudo reasignar: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">Odontólogo responsable</span>
      <select
        value={paciente.dentista_responsable_id ?? ''}
        onChange={handleChange}
        disabled={guardando}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-60"
      >
        <option value="">Sin asignar</option>
        {dentistas.map((d) => (
          <option key={d.id} value={d.id}>{d.nombre}</option>
        ))}
      </select>
      <p className="mt-1 text-xs text-slate-400">
        Un paciente sin asignar es visible para todos los odontólogos de la clínica hasta que se asigne.
      </p>
    </label>
  )
}
