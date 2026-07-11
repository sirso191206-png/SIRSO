import { Modal } from './Modal'
import { Button } from './Button'

export function ConfirmModal({ abierto, onCerrar, onConfirmar, titulo, mensaje, textoConfirmar = 'Confirmar', destructivo = true, confirmando = false }) {
  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo={titulo}>
      <p className="mb-5 text-sm text-slate-600">{mensaje}</p>
      <div className="flex gap-3">
        <Button variante="secundario" onClick={onCerrar} className="flex-1" disabled={confirmando}>
          Cancelar
        </Button>
        <Button
          variante={destructivo ? 'peligro' : 'primario'}
          onClick={onConfirmar}
          className="flex-1"
          disabled={confirmando}
        >
          {confirmando ? 'Procesando…' : textoConfirmar}
        </Button>
      </div>
    </Modal>
  )
}
