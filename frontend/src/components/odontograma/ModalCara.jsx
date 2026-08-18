import { useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { toastExito, toastError } from '../../store/useToastStore'
import { ESTADOS_CARA, nombreCara, caraDe } from './constantesOdontograma'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

export function ModalCara({ pieza, cara, onCerrar, onGuardar }) {
  const perfil = useAuthStore((s) => s.perfil)
  const caraActual = caraDe(pieza, cara)
  const [estado, setEstado] = useState(caraActual?.estado ?? 'sano')
  const [guardando, setGuardando] = useState(false)

  const nombreVisible = nombreCara(pieza.numero_pieza, cara)

  const handleGuardar = async () => {
    setGuardando(true)
    try {
      await onGuardar(caraActual.id, { estado, usuarioId: perfil.id })
      toastExito(`Cara ${nombreVisible.toLowerCase()} de la pieza ${pieza.numero_pieza} actualizada.`)
      onCerrar()
    } catch (err) {
      toastError('No se pudo guardar: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto onCerrar={onCerrar} titulo={`Pieza ${pieza.numero_pieza} — ${nombreVisible}`}>
      <div className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Estado de esta cara</span>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {ESTADOS_CARA.map((e) => (
              <option key={e.value} value={e.value}>{e.label}</option>
            ))}
          </select>
        </label>
        <Button onClick={handleGuardar} disabled={guardando} className="w-full">
          {guardando ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </Modal>
  )
}
