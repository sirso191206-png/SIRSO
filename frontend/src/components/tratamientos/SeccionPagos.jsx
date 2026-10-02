import { useEffect, useState } from 'react'
import { usePagos } from '../../hooks/usePagos'
import { useAuthStore } from '../../store/useAuthStore'
import { toastExito, toastError } from '../../store/useToastStore'
import { imprimirRecibo } from './imprimirRecibo'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { Input } from '../ui/Input'
import { formatearMoneda } from '../../lib/formato'
import { Modal } from '../ui/Modal'
import { useConexion } from '../../hooks/useConexion'

// Pagos vive dentro de "Plan" — el documento de reorganización agrupa
// diagnósticos, tratamientos, presupuestos y pagos en una sola sección
// para no tener demasiadas pestañas. La funcionalidad es la misma que
// antes tenía su propia pestaña, solo se movió de lugar.
export function SeccionPagos({ pacienteId, paciente }) {
  const { pagos, saldo, cargando, agregar, anular, eliminar, corregir } = usePagos(pacienteId)
  const conectado = useConexion()
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState('efectivo')
  const [guardando, setGuardando] = useState(false)
  const [imprimiendoId, setImprimiendoId] = useState(null)
  const [pagoAAnular, setPagoAAnular] = useState(null)
  const [pagoAEliminar, setPagoAEliminar] = useState(null)
  const [pagoAEditar, setPagoAEditar] = useState(null)
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
        Total tratamientos: ${formatearMoneda(saldo.total_tratamientos)} · Pagado: ${formatearMoneda(saldo.total_pagado)} · Pendiente: ${formatearMoneda(Math.max(saldo.saldo, 0))}
        {saldo.saldo < 0 && (
          // Si se registró un pago mayor al costo de los tratamientos
          // (p. ej. un monto capturado por error), el saldo queda
          // negativo — mostrarlo tal cual ("Pendiente: $-500") es
          // confuso. "Pendiente" nunca baja de $0; el excedente se
          // muestra aparte, como saldo a favor del paciente. Si el
          // monto se capturó mal, corrígelo con "Eliminar" en el pago
          // de abajo y vuelve a registrarlo — eso sí mueve el saldo de
          // verdad; esto solo cambia cómo se muestra.
          <span className="ml-1 font-medium text-clinico-verde">· A favor del paciente: ${formatearMoneda(-saldo.saldo)}</span>
        )}
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
        <Button type="submit" disabled={guardando || !conectado} title={!conectado ? 'Los pagos requieren conexión a internet.' : undefined}>
          {guardando ? 'Registrando…' : 'Registrar pago'}
        </Button>
        {!conectado && (
          <p className="mt-1 text-xs text-amber-700">Los pagos requieren conexión a internet.</p>
        )}
      </form>

      <div className="space-y-2">
        {pagos.map((p) => (
          <div key={p.id} className={`flex items-center justify-between rounded-lg border p-3 text-sm ${p.anulado_en ? 'border-slate-200 bg-slate-50 opacity-60' : 'border-slate-200'}`}>
            <div>
              <span className="font-mono text-xs text-slate-400">{p.numero_recibo}</span>
              <span className="ml-2">{p.tipo} · {p.metodo}</span>
              {p.anulado_en && <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-600">Anulado</span>}
            </div>
            <span className="font-medium">${formatearMoneda(p.monto)}</span>
            <span className="text-slate-400">{new Date(p.creado_en).toLocaleDateString('es-MX')}</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleImprimir(p)}
                disabled={imprimiendoId === p.id}
                className="inline-flex items-center gap-1 text-xs font-medium text-clinico-azul hover:underline disabled:opacity-50"
              >
                {imprimiendoId === p.id ? 'Generando…' : (<><Icon.printer /> Recibo</>)}
              </button>
              {!p.anulado_en && (
                <button onClick={() => setPagoAEditar(p)} className="text-xs font-medium text-clinico-azul hover:underline">
                  Editar
                </button>
              )}
              {!p.anulado_en && (
                <button onClick={() => setPagoAAnular(p)} className="text-xs font-medium text-clinico-rojo hover:underline">
                  Anular
                </button>
              )}
              <button onClick={() => setPagoAEliminar(p)} className="text-xs text-slate-400 hover:text-clinico-rojo hover:underline">
                Eliminar
              </button>
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

      <ModalEliminarPago
        pago={pagoAEliminar}
        onCerrar={() => setPagoAEliminar(null)}
        onEliminar={eliminar}
      />

      <ModalEditarPago
        pago={pagoAEditar}
        onCerrar={() => setPagoAEditar(null)}
        onCorregir={corregir}
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

function ModalEditarPago({ pago, onCerrar, onCorregir, usuarioId }) {
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState('efectivo')
  const [procesando, setProcesando] = useState(false)

  // El formulario se precarga con los valores actuales cada vez que se
  // abre para un pago distinto — useState no se reinicia solo porque
  // cambie `pago`, así que se sincroniza explícito con sus datos.
  useEffect(() => {
    if (pago) {
      setMonto(String(pago.monto))
      setMetodo(pago.metodo)
    }
  }, [pago])

  const handleConfirmar = async () => {
    setProcesando(true)
    try {
      await onCorregir(pago, { monto: Number(monto), metodo }, { usuarioId })
      toastExito('Pago corregido.')
      onCerrar()
    } catch (err) {
      toastError('No se pudo corregir: ' + err.message)
    } finally {
      setProcesando(false)
    }
  }

  return (
    <Modal abierto={!!pago} onCerrar={onCerrar} titulo="Editar pago">
      <p className="mb-4 text-sm text-slate-600">
        El sistema no permite modificar un pago ya registrado directamente — por seguridad contable, esto anula el
        pago original de <strong>${pago ? formatearMoneda(pago.monto) : ''}</strong> y registra uno nuevo con los
        valores corregidos, en un solo paso. El pago original queda en el historial, marcado como anulado, con un
        folio de recibo nuevo para el corregido.
      </p>
      <div className="mb-4 flex gap-2">
        <Input type="number" step="0.01" placeholder="Monto" value={monto} onChange={(e) => setMonto(e.target.value)} required className="w-32" />
        <select value={metodo} onChange={(e) => setMetodo(e.target.value)} className="rounded-lg border border-slate-300 text-sm">
          <option value="efectivo">Efectivo</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="transferencia">Transferencia</option>
          <option value="otro">Otro</option>
        </select>
      </div>
      <div className="flex gap-2">
        <Button variante="secundario" onClick={onCerrar} className="flex-1" disabled={procesando}>Cerrar</Button>
        <Button onClick={handleConfirmar} className="flex-1" disabled={procesando || !monto}>
          {procesando ? 'Corrigiendo…' : 'Guardar corrección'}
        </Button>
      </div>
    </Modal>
  )
}

function ModalEliminarPago({ pago, onCerrar, onEliminar }) {
  const [procesando, setProcesando] = useState(false)

  const handleConfirmar = async () => {
    setProcesando(true)
    try {
      await onEliminar(pago.id)
      toastExito('Pago eliminado.')
      onCerrar()
    } catch (err) {
      toastError('No se pudo eliminar: ' + err.message)
    } finally {
      setProcesando(false)
    }
  }

  return (
    <Modal abierto={!!pago} onCerrar={onCerrar} titulo="Eliminar pago">
      <p className="mb-4 text-sm text-slate-600">
        Esto es distinto de anular: el pago de <strong>${pago ? formatearMoneda(pago.monto) : ''}</strong> se borra
        por completo del historial del paciente y del corte de caja, no solo se marca como anulado. Si ya imprimiste
        o cerraste un corte de caja que incluía este pago, ese corte ya impreso no va a cuadrar con uno nuevo que
        generes después. No se puede deshacer desde aquí — usa esto solo para corregir un error de captura.
      </p>
      <div className="flex gap-2">
        <Button variante="secundario" onClick={onCerrar} className="flex-1" disabled={procesando}>Cerrar</Button>
        <Button variante="peligro" onClick={handleConfirmar} className="flex-1" disabled={procesando}>
          {procesando ? 'Eliminando…' : 'Eliminar por completo'}
        </Button>
      </div>
    </Modal>
  )
}
