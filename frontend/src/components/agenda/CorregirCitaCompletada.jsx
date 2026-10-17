import { useRef, useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { corregirEstadoCita } from '../../services/citas'
import { toastExito, toastError } from '../../store/useToastStore'
import { Button } from '../ui/Button'

export const MOTIVO_MINIMO = 10
export const MOTIVO_MAXIMO = 500

// Qué puede hacer cada rol con una cita COMPLETADA (la base de datos lo hace cumplir; esto solo evita ofrecer lo que sería rechazado):
//   propietario → reabrir, cancelar o marcar inasistencia; odontólogo responsable → solo reabrir su consulta; recepción y asistente → nada.
export function opcionesDeCorreccion(rol, esResponsable) {
  if (rol === 'owner') return [{ valor: 'agendada', texto: 'Reabrir (vuelve a «agendada»)' }, { valor: 'cancelada', texto: 'Marcar como cancelada' }, { valor: 'no_asistio', texto: 'Marcar como no asistió' }]
  if (rol === 'dentista' && esResponsable) return [{ valor: 'agendada', texto: 'Reabrir (vuelve a «agendada»)' }]
  return []
}

export function CorregirCitaCompletada({ cita, onCorregida }) {
  const perfil = useAuthStore((s) => s.perfil)
  const opciones = cita?.estado === 'completada' ? opcionesDeCorreccion(perfil?.rol, cita?.dentista_id === perfil?.id) : []
  const [abierto, setAbierto] = useState(false)
  const [estado, setEstado] = useState('agendada')
  const [motivo, setMotivo] = useState('')
  const [procesando, setProcesando] = useState(false)
  const enCurso = useRef(false)   // cerrojo SÍNCRONO: el estado `procesando` aún vale false para un segundo clic del mismo ciclo de renderizado
  if (!opciones.length) return null
  const valido = motivo.trim().length >= MOTIVO_MINIMO && motivo.trim().length <= MOTIVO_MAXIMO

  const registrar = async () => {
    if (enCurso.current || !valido) return     // doble clic: una sola solicitud
    enCurso.current = true
    setProcesando(true)
    try {
      await corregirEstadoCita({ citaId: cita.id, estado, motivo: motivo.trim() })
      toastExito('Corrección registrada.')
      setAbierto(false); setMotivo('')
      await onCorregida?.()
    } catch (err) {
      toastError(err.message)
    } finally {
      enCurso.current = false
      setProcesando(false)
    }
  }

  if (!abierto) {
    return <div className="mb-4"><Button variante="secundario" onClick={() => setAbierto(true)}>Corregir consulta</Button></div>
  }
  return (
    <div className="mb-4 rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm" data-corregir-consulta>
      <div className="mb-1 font-semibold">Corregir una consulta ya completada</div>
      <p className="mb-2 text-slate-600">Queda registrado quién, cuándo, el estado anterior, el nuevo y el motivo. La nota clínica no se modifica.</p>
      <label className="mb-2 block">Qué hacer
        <select className="mt-1 block w-full rounded border px-2 py-1" value={estado} onChange={(e) => setEstado(e.target.value)} disabled={procesando}>
          {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
        </select>
      </label>
      <label className="mb-1 block">Motivo (obligatorio)
        <textarea className="mt-1 block w-full rounded border px-2 py-1" rows={3} maxLength={MOTIVO_MAXIMO} value={motivo} onChange={(e) => setMotivo(e.target.value)} disabled={procesando} />
      </label>
      <div className="mb-2 text-xs text-slate-500">{motivo.trim().length}/{MOTIVO_MAXIMO} · mínimo {MOTIVO_MINIMO} caracteres</div>
      <div className="flex gap-2">
        <Button onClick={registrar} disabled={!valido || procesando}>{procesando ? 'Registrando…' : 'Registrar corrección'}</Button>
        <Button variante="secundario" onClick={() => setAbierto(false)} disabled={procesando}>Cancelar</Button>
      </div>
    </div>
  )
}
