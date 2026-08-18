import { useState } from 'react'
import { toastExito, toastError } from '../../store/useToastStore'
import { Badge } from '../ui/Badge'

export const ESTADOS = [
  { value: 'planeado', label: 'Planeado' },
  { value: 'aceptado', label: 'Aceptado' },
  { value: 'en_progreso', label: 'En progreso' },
  { value: 'pausado', label: 'Pausado' },
  { value: 'completado', label: 'Completado' },
  { value: 'cancelado', label: 'Cancelado' }
]

export function FilaTratamiento({ tratamiento: t, onEditar, onCambiarEstado, onSumarSesion }) {
  const total = Number(t.costo) - Number(t.descuento ?? 0)
  const finalizado = t.estado === 'completado' || t.estado === 'cancelado'
  const [procesando, setProcesando] = useState(false)

  const handleCambiarEstado = async (nuevoEstado) => {
    setProcesando(true)
    try {
      await onCambiarEstado(t.id, nuevoEstado)
      toastExito('Estado del tratamiento actualizado.')
    } catch (err) {
      toastError(err.message)
    } finally {
      setProcesando(false)
    }
  }

  const handleSumarSesion = async () => {
    setProcesando(true)
    try {
      await onSumarSesion(t)
      toastExito('Sesión registrada.')
    } catch (err) {
      toastError(err.message)
    } finally {
      setProcesando(false)
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-start justify-between">
        <div>
          <button onClick={onEditar} className="text-left font-medium text-slate-800 hover:text-clinico-azul">
            {t.descripcion}
          </button>
          <div className="text-xs text-slate-500">
            {t.categoria && <span className="mr-2">{t.categoria}</span>}
            {t.pieza_dental && <span className="mr-2">Pieza {t.pieza_dental}</span>}
            {t.dentista?.nombre}
          </div>
        </div>
        <Badge estado={t.estado}>{ESTADOS.find((e) => e.value === t.estado)?.label ?? t.estado}</Badge>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="text-slate-600">
          Costo: <strong>${Number(t.costo).toFixed(2)}</strong>
          {Number(t.descuento) > 0 && <span className="ml-1 text-clinico-verde">(-${Number(t.descuento).toFixed(2)} desc. → ${total.toFixed(2)})</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Sesiones: {t.sesiones_completadas} de {t.numero_sesiones}</span>
          {!finalizado && t.sesiones_completadas < t.numero_sesiones && (
            <button onClick={handleSumarSesion} disabled={procesando} className="text-xs font-medium text-clinico-azul hover:underline">
              + Sesión
            </button>
          )}
        </div>
      </div>

      {!finalizado && (
        <div className="mt-2">
          <select
            value={t.estado}
            onChange={(e) => handleCambiarEstado(e.target.value)}
            disabled={procesando}
            className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
          >
            {ESTADOS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
        </div>
      )}
    </div>
  )
}
