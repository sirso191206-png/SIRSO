import { useState } from 'react'
import { usePagos } from '../../hooks/usePagos'
import { useAuthStore } from '../../store/useAuthStore'
import { toastExito, toastError } from '../../store/useToastStore'
import { imprimirRecibo } from './imprimirRecibo'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'

// Pagos vive dentro de "Plan" — el documento de reorganización agrupa
// diagnósticos, tratamientos, presupuestos y pagos en una sola sección
// para no tener demasiadas pestañas. La funcionalidad es la misma que
// antes tenía su propia pestaña, solo se movió de lugar.
export function SeccionPagos({ pacienteId, paciente }) {
  const { pagos, saldo, cargando, agregar, anular } = usePagos(pacienteId)
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState('efectivo')
  const [guardando, setGuardando] = useState(false)
  const [imprimiendoId, setImprimiendoId] = useState(null)
  const [pagoAAnular, setPagoAAnular] = useState(null)
  const perfil = useAuthStore((s) => s.perfil)

  if (cargando) return null

  const handleImprimir = async (pago) => {
    setImprimiendoId(pago.id)
    try {
      await imprimirRecibo({ pago, paciente, clinicaId: perfil.clinica_id })
    } catch (err) {
      toastError(err.message)
    } finally {
      setImprimiendoId(null)
    }
  }

  return (
    <div className="border-t border-slate-200 pt-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">Pagos</h3>

      <div className="mb-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        Total tratamientos: ${Number(saldo.total_tratamientos).toFixed(2)} · Pagado: ${Number(saldo.total_pagado).toFixed(2)} · Pendiente: ${Number(saldo.saldo).toFixed(2)}
      </div>

      <form
        onSubmit={async (e) => {
          e.preventDefault()
          setGuardando(true)
          try {
            await agregar({ monto: Number(monto), metodo, tipo: 'pago', registrado_por: perfil.id })
            setMonto('')
            toastExito('Pago registrado.')
          } catch (err) {
            toastError('No se pudo registrar el pago: ' + err.message)
          } finally {
            setGuardando(false)
          }
        }}
        className="mb-3 flex gap-2"
      >
        <Input type="number" step="0.01" placeholder="Monto" value={monto} onChange={(e) => setMonto(e.target.value)} required className="w-32" />
        <select value={metodo} onChange={(e) => setMetodo(e.target.value)} className="rounded-lg border border-slate-300 text-sm">
          <option value="efectivo">Efectivo</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="transferencia">Transferencia</option>
          <option value="otro">Otro</option>
        </select>
        <Button type="submit" disabled={guardando}>{guardando ? 'Registrando…' : 'Registrar pago'}</Button>
      </form>

      <div className="space-y-2">
        {pagos.map((p) => (
          <div key={p.id} className={`flex items-center justify-between rounded-lg border p-3 text-sm ${p.anulado_en ? 'border-slate-200 bg-slate-50 opacity-60' : 'border-slate-200'}`}>
            <div>
              <span className="font-mono text-xs text-slate-400">{p.numero_recibo}</span>
              <span className="ml-2">{p.tipo} · {p.metodo}</span>
              {p.anulado_en && <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-600">Anulado</span>}
            </div>
            <span className="font-medium">${Number(p.monto).toFixed(2)}</span>
            <span className="text-slate-400">{new Date(p.creado_en).toLocaleDateString('es-MX')}</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleImprimir(p)}
                disabled={imprimiendoId === p.id}
                className="text-xs font-medium text-clinico-azul hover:underline disabled:opacity-50"
              >
                {imprimiendoId === p.id ? 'Generando…' : '🖨 Recibo'}
              </button>
              {!p.anulado_en && (
                <button onClick={() => setPagoAAnular(p)} className="text-xs font-medium text-clinico-rojo hover:underline">
                  Anular
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <ModalAnularPago
        pago={pagoAAnular}
        onCerrar={() => setPagoAAnular(null)}
        onAnular={anular}
        usuarioId={perfil.id}
      />
    </div>
  )
}

function ModalAnularPago({ pago, onCerrar, onAnular, usuarioId }) {
  const [motivo, setMotivo] = useState('')
  const [procesando, setProcesando] = useState(false)

  const handleConfirmar = async () => {
    setProcesando(true)
    try {
      await onAnular(pago.id, { usuarioId, motivo })
      toastExito('Pago anulado.')
      onCerrar()
      setMotivo('')
    } catch (err) {
      toastError('No se pudo anular: ' + err.message)
    } finally {
      setProcesando(false)
    }
  }

  return (
    <Modal abierto={!!pago} onCerrar={onCerrar} titulo="Anular pago">
      <p className="mb-4 text-sm text-slate-600">
        El pago se conserva en el historial, marcado como anulado — no se borra ni se edita el monto. Deja de contar
        en el saldo del paciente y en el corte de caja.
      </p>
      <label className="mb-4 block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Motivo (opcional)</span>
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </label>
      <div className="flex gap-2">
        <Button variante="secundario" onClick={onCerrar} className="flex-1" disabled={procesando}>Cerrar</Button>
        <Button variante="peligro" onClick={handleConfirmar} className="flex-1" disabled={procesando}>
          {procesando ? 'Anulando…' : 'Anular pago'}
        </Button>
      </div>
    </Modal>
  )
}
