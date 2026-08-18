import { useState } from 'react'
import { obtenerHistorialPieza } from '../../services/odontograma'
import { useAuthStore } from '../../store/useAuthStore'
import { toastExito, toastError } from '../../store/useToastStore'
import { ESTADOS_PIEZA, nombreCara } from './constantesOdontograma'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

export function ModalPiezaGeneral({ pieza, tratamientos, onCerrar, onGuardar }) {
  const perfil = useAuthStore((s) => s.perfil)
  const [estado, setEstado] = useState(pieza.estado)
  const [diagnostico, setDiagnostico] = useState(pieza.diagnostico ?? '')
  const [tratamientoId, setTratamientoId] = useState(pieza.tratamiento_id ?? '')
  const [notas, setNotas] = useState(pieza.notas ?? '')
  const [guardando, setGuardando] = useState(false)
  const [historial, setHistorial] = useState(null)
  const [cargandoHistorial, setCargandoHistorial] = useState(false)

  const handleGuardar = async () => {
    setGuardando(true)
    try {
      await onGuardar(pieza.id, { estado, diagnostico, tratamientoId, notas, usuarioId: perfil.id })
      toastExito(`Pieza ${pieza.numero_pieza} actualizada.`)
      onCerrar()
    } catch (err) {
      toastError('No se pudo guardar: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  const handleVerHistorial = async () => {
    setCargandoHistorial(true)
    const data = await obtenerHistorialPieza(pieza.id)
    setHistorial(data)
    setCargandoHistorial(false)
  }

  return (
    <Modal abierto onCerrar={onCerrar} titulo={`Pieza ${pieza.numero_pieza}`}>
      <div className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Estado general</span>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {ESTADOS_PIEZA.map((e) => (
              <option key={e.value} value={e.value}>{e.label}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-400">
            Para caries, obturaciones o fracturas de una cara específica, cierra esto y da clic directo sobre esa cara en el diagrama.
          </p>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Diagnóstico</span>
          <input
            value={diagnostico}
            onChange={(e) => setDiagnostico(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Ej. Caries profunda con compromiso pulpar"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Tratamiento asociado</span>
          <select
            value={tratamientoId}
            onChange={(e) => setTratamientoId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Sin asociar</option>
            {tratamientos.map((t) => (
              <option key={t.id} value={t.id}>{t.descripcion}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Notas</span>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        {pieza.actualizado_en && (
          <p className="text-xs text-slate-400">
            Última actualización: {new Date(pieza.actualizado_en).toLocaleString('es-MX')}
          </p>
        )}

        <Button onClick={handleGuardar} disabled={guardando} className="w-full">
          {guardando ? 'Guardando…' : 'Guardar'}
        </Button>

        {historial === null ? (
          <button
            onClick={handleVerHistorial}
            disabled={cargandoHistorial}
            className="text-xs text-clinico-azul hover:underline"
          >
            {cargandoHistorial ? 'Cargando historial…' : 'Ver historial de esta pieza (incluye caras)'}
          </button>
        ) : (
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <p className="text-xs font-medium text-slate-500">Historial</p>
            {historial.length === 0 && <p className="text-xs text-slate-400">Sin cambios previos.</p>}
            {historial.map((h) => (
              <div key={h.id} className="text-xs text-slate-600">
                <span className="text-slate-400">{new Date(h.creado_en).toLocaleString('es-MX')}</span>
                {' — '}
                {h.cara ? `[${nombreCara(pieza.numero_pieza, h.cara)}] ` : '[general] '}
                {h.estado_anterior ?? 'sin registro'} → {h.estado_nuevo}
                {h.usuario?.nombre && ` (${h.usuario.nombre})`}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
