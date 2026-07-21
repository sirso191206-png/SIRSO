import { useState } from 'react'
import { useTratamientos } from '../../hooks/useTratamientos'
import { useCatalogoTratamientos } from '../../hooks/useCatalogoTratamientos'
import { usePagos } from '../../hooks/usePagos'
import { useAuthStore } from '../../store/useAuthStore'
import { toastExito, toastError } from '../../store/useToastStore'
import { imprimirPresupuesto } from './imprimirPresupuesto'
import { imprimirRecibo } from './imprimirRecibo'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'

const ESTADOS = [
  { value: 'planeado', label: 'Planeado' },
  { value: 'aceptado', label: 'Aceptado' },
  { value: 'en_progreso', label: 'En progreso' },
  { value: 'pausado', label: 'Pausado' },
  { value: 'completado', label: 'Completado' },
  { value: 'cancelado', label: 'Cancelado' }
]

export function TabTratamientos({ pacienteId, paciente }) {
  const { tratamientos, cargando, agregar, cambiarEstado, actualizar, sumarSesion } = useTratamientos(pacienteId)
  const { catalogo } = useCatalogoTratamientos()
  const perfil = useAuthStore((s) => s.perfil)
  const [modalNuevo, setModalNuevo] = useState(false)
  const [tratamientoEditar, setTratamientoEditar] = useState(null)
  const [imprimiendo, setImprimiendo] = useState(false)

  const handleImprimir = async () => {
    const activos = tratamientos.filter((t) => t.estado !== 'cancelado')
    if (activos.length === 0) return toastError('No hay tratamientos para incluir en el presupuesto.')
    setImprimiendo(true)
    try {
      await imprimirPresupuesto({ paciente, tratamientos: activos, clinicaId: perfil.clinica_id })
    } catch (err) {
      toastError(err.message)
    } finally {
      setImprimiendo(false)
    }
  }

  if (cargando) return <p className="text-slate-400">Cargando…</p>

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <Button onClick={() => setModalNuevo(true)}>+ Nuevo tratamiento</Button>
        <Button variante="secundario" onClick={handleImprimir} disabled={imprimiendo}>
          {imprimiendo ? 'Generando…' : '🖨 Presupuesto imprimible'}
        </Button>
      </div>

      <div className="space-y-2">
        {tratamientos.length === 0 && <p className="text-sm text-slate-400">Sin tratamientos registrados.</p>}
        {tratamientos.map((t) => (
          <FilaTratamiento
            key={t.id}
            tratamiento={t}
            onEditar={() => setTratamientoEditar(t)}
            onCambiarEstado={cambiarEstado}
            onSumarSesion={sumarSesion}
          />
        ))}
      </div>

      <ModalTratamiento
        abierto={modalNuevo}
        onCerrar={() => setModalNuevo(false)}
        onGuardar={agregar}
        catalogo={catalogo}
        perfil={perfil}
        titulo="Nuevo tratamiento"
      />

      {tratamientoEditar && (
        <ModalTratamiento
          abierto
          onCerrar={() => setTratamientoEditar(null)}
          onGuardar={(cambios) => actualizar(tratamientoEditar.id, cambios)}
          catalogo={catalogo}
          perfil={perfil}
          titulo="Editar tratamiento"
          valorInicial={tratamientoEditar}
        />
      )}

      <SeccionPagos pacienteId={pacienteId} paciente={paciente} />
    </div>
  )
}

// Pagos vive dentro de "Plan" — el documento de reorganización agrupa
// diagnósticos, tratamientos, presupuestos y pagos en una sola sección
// para no tener demasiadas pestañas. La funcionalidad es la misma que
// antes tenía su propia pestaña, solo se movió de lugar.
function SeccionPagos({ pacienteId, paciente }) {
  const { pagos, saldo, cargando, agregar } = usePagos(pacienteId)
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState('efectivo')
  const [guardando, setGuardando] = useState(false)
  const [imprimiendoId, setImprimiendoId] = useState(null)
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
          <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm">
            <div>
              <span className="font-mono text-xs text-slate-400">{p.numero_recibo}</span>
              <span className="ml-2">{p.tipo} · {p.metodo}</span>
            </div>
            <span className="font-medium">${Number(p.monto).toFixed(2)}</span>
            <span className="text-slate-400">{new Date(p.creado_en).toLocaleDateString('es-MX')}</span>
            <button
              onClick={() => handleImprimir(p)}
              disabled={imprimiendoId === p.id}
              className="text-xs font-medium text-clinico-azul hover:underline disabled:opacity-50"
            >
              {imprimiendoId === p.id ? 'Generando…' : '🖨 Recibo'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function FilaTratamiento({ tratamiento: t, onEditar, onCambiarEstado, onSumarSesion }) {
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

export function ModalTratamiento({ abierto, onCerrar, onGuardar, catalogo, perfil, titulo, valorInicial }) {
  const [catalogoId, setCatalogoId] = useState('')
  const [descripcion, setDescripcion] = useState(valorInicial?.descripcion ?? '')
  const [categoria, setCategoria] = useState(valorInicial?.categoria ?? '')
  const [costo, setCosto] = useState(valorInicial?.costo ?? '')
  const [descuento, setDescuento] = useState(valorInicial?.descuento ?? 0)
  const [piezaDental, setPiezaDental] = useState(valorInicial?.pieza_dental ?? '')
  const [diagnostico, setDiagnostico] = useState(valorInicial?.diagnostico_relacionado ?? '')
  const [numeroSesiones, setNumeroSesiones] = useState(valorInicial?.numero_sesiones ?? 1)
  const [fechaInicio, setFechaInicio] = useState(valorInicial?.fecha_inicio ?? '')
  const [fechaEstimadaFin, setFechaEstimadaFin] = useState(valorInicial?.fecha_estimada_fin ?? '')
  const [notas, setNotas] = useState(valorInicial?.notas ?? '')
  const [guardando, setGuardando] = useState(false)

  const handleCatalogoChange = (id) => {
    setCatalogoId(id)
    const item = catalogo.find((c) => c.id === id)
    if (item) {
      setDescripcion(item.nombre)
      setCategoria(item.categoria ?? '')
      setCosto(item.precio)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setGuardando(true)
    try {
      await onGuardar({
        catalogo_id: catalogoId || null,
        descripcion,
        categoria: categoria || null,
        costo: Number(costo),
        descuento: Number(descuento) || 0,
        pieza_dental: piezaDental || null,
        diagnostico_relacionado: diagnostico || null,
        numero_sesiones: Number(numeroSesiones) || 1,
        fecha_inicio: fechaInicio || null,
        fecha_estimada_fin: fechaEstimadaFin || null,
        notas: notas || null,
        dentista_id: valorInicial?.dentista_id ?? perfil.id
      })
      toastExito(valorInicial ? 'Tratamiento actualizado.' : 'Tratamiento agregado.')
      onCerrar()
    } catch (err) {
      toastError('No se pudo guardar: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo={titulo}>
      <form onSubmit={handleSubmit} className="max-h-[75vh] space-y-3 overflow-y-auto pr-1">
        {catalogo.length > 0 && !valorInicial && (
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Elegir del catálogo (opcional)</span>
            <select value={catalogoId} onChange={(e) => handleCatalogoChange(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Escribir manualmente</option>
              {catalogo.map((c) => (
                <option key={c.id} value={c.id}>{c.categoria ? `${c.categoria} — ` : ''}{c.nombre} (${Number(c.precio).toFixed(2)})</option>
              ))}
            </select>
          </label>
        )}

        <Input label="Descripción" required value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />

        <div className="grid grid-cols-2 gap-3">
          <Input label="Categoría (opcional)" value={categoria} onChange={(e) => setCategoria(e.target.value)} />
          <Input label="Pieza dental (opcional)" value={piezaDental} onChange={(e) => setPiezaDental(e.target.value)} placeholder="Ej. 14" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Costo" type="number" step="0.01" required value={costo} onChange={(e) => setCosto(e.target.value)} />
          <Input label="Descuento (opcional)" type="number" step="0.01" value={descuento} onChange={(e) => setDescuento(e.target.value)} />
        </div>

        <Input label="Diagnóstico relacionado (opcional)" value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)} />

        <div className="grid grid-cols-3 gap-3">
          <Input label="N.º de sesiones" type="number" min="1" value={numeroSesiones} onChange={(e) => setNumeroSesiones(e.target.value)} />
          <Input label="Fecha inicio" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
          <Input label="Fin estimado" type="date" value={fechaEstimadaFin} onChange={(e) => setFechaEstimadaFin(e.target.value)} />
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Notas (opcional)</span>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>

        <Button type="submit" disabled={guardando} className="w-full">
          {guardando ? 'Guardando…' : 'Guardar'}
        </Button>
      </form>
    </Modal>
  )
}
