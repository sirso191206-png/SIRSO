import { useEffect, useRef, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { previsualizarEliminacionClinica, eliminarClinica } from '../../services/admin'
import { toastError, toastExito } from '../../store/useToastStore'
import { ETIQUETAS_CONSERVADO, ETIQUETAS_CONTEO, conteosNoVacios, puedeConfirmarEliminacion, resumenConservacion, estadoDeLaEliminacion } from '../../lib/eliminarClinica'

// Parte visual (recibe todo ya calculado): se puede probar sin red ni efectos.
export function ContenidoEliminarClinica({ resumen, cargando, error, confirmarNombre, onNombre, confirmarDatos, onDatos, eliminando, onEliminar, onCancelar }) {
  if (cargando) return <p className="text-sm text-slate-500" role="status">Revisando qué se eliminaría…</p>
  if (error) return <p className="text-sm text-clinico-rojo" role="alert">{error}</p>
  if (!resumen?.existe) return <p className="text-sm text-clinico-rojo" role="alert">La clínica ya no existe.</p>

  const bloqueos = resumen.bloqueos ?? []
  const destruye = conteosNoVacios(resumen.conteos, ETIQUETAS_CONTEO)
  const conserva = conteosNoVacios(resumen.se_conserva, ETIQUETAS_CONSERVADO)
  const hayPacientes = Number(resumen.conteos?.pacientes ?? 0) > 0
  const categorias = ['clinico', 'fiscal', 'contractual'].map((c) => resumenConservacion(resumen, c)).filter(Boolean)
  const avisos = resumen.advertencias ?? []
  const confirmable = puedeConfirmarEliminacion({ resumen, confirmarNombre, confirmarDatos })

  return (
    <div className="space-y-4 text-sm text-slate-600">
      {bloqueos.length > 0 && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
          <div className="mb-1 font-semibold">No se puede eliminar todavía</div>
          <ul className="list-disc space-y-1 pl-5">{bloqueos.map((b) => <li key={b.codigo}>{b.mensaje}</li>)}</ul>
        </div>
      )}

      {categorias.map((c) => (
        <p key={c.categoria} className="rounded-lg bg-slate-50 p-3 text-slate-600" data-conservacion={c.categoria}>
          <strong>{c.etiqueta}</strong>: política de conservación de <strong>{c.anios} año(s)</strong> desde el último registro ({c.ultimo}).{' '}
          {c.cumplido ? `El plazo se cumplió el ${c.hasta}.` : `No se puede eliminar hasta el ${c.hasta}.`}
        </p>
      ))}
      {avisos.length > 0 && (
        <ul role="status" className="list-disc space-y-1 rounded-lg border border-slate-300 bg-slate-50 p-3 pl-7 text-slate-700">
          {avisos.map((a) => <li key={a.codigo}>{a.mensaje}</li>)}
        </ul>
      )}

      <div>
        <div className="mb-1 font-semibold text-slate-700">Se eliminará de forma permanente de <strong>{resumen.nombre}</strong>:</div>
        {destruye.length === 0 ? <p>No tiene registros.</p> : (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5">{destruye.map((x) => <li key={x.clave}>{x.etiqueta}: <strong>{x.cantidad}</strong></li>)}</ul>
        )}
      </div>

      {conserva.length > 0 && (
        <div>
          <div className="mb-1 font-semibold text-slate-700">Se conserva (sin vínculo con la clínica, por trazabilidad):</div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5">{conserva.map((x) => <li key={x.clave}>{x.etiqueta}: <strong>{x.cantidad}</strong></li>)}</ul>
        </div>
      )}

      {hayPacientes && (
        <label className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">
          <input type="checkbox" checked={confirmarDatos} onChange={(e) => onDatos(e.target.checked)} className="mt-0.5 h-4 w-4" disabled={bloqueos.length > 0} />
          <span>Entiendo que se destruirá de forma <strong>permanente</strong> la información clínica de {resumen.conteos.pacientes} paciente(s) y que no se puede recuperar.</span>
        </label>
      )}

      <div>
        <label className="mb-1 block">Para confirmar, escribe el nombre exacto de la clínica:</label>
        <input type="text" value={confirmarNombre} onChange={(e) => onNombre(e.target.value)} placeholder={resumen.nombre} disabled={bloqueos.length > 0}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" />
      </div>

      <div className="flex gap-3">
        <Button variante="secundario" onClick={onCancelar} className="flex-1" disabled={eliminando}>Cancelar</Button>
        <Button variante="peligro" onClick={onEliminar} className="flex-1" disabled={eliminando || !confirmable}>{eliminando ? 'Eliminando…' : 'Eliminar definitivamente'}</Button>
      </div>
    </div>
  )
}

export function ModalEliminarClinica({ abierto, clinicaId, onCerrar, onEliminada }) {
  const [resumen, setResumen] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const [confirmarNombre, setConfirmarNombre] = useState('')
  const [confirmarDatos, setConfirmarDatos] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  // Candado SÍNCRONO: `eliminando` (estado) tarda un render en reflejarse y dos clics seguidos pasarían los dos. Es una
  // operación irreversible: jamás se envía dos veces.
  const enVuelo = useRef(false)

  // Cada vez que se abre: confirmaciones en blanco y un resumen FRESCO (no una foto vieja de cuando se cargó la página).
  useEffect(() => {
    if (!abierto) return undefined
    let activo = true
    setResumen(null); setError(null); setConfirmarNombre(''); setConfirmarDatos(false); setCargando(true)
    previsualizarEliminacionClinica(clinicaId)
      .then((r) => { if (activo) setResumen(r.resumen) })
      .catch((err) => { if (activo) setError('No se pudo revisar la clínica: ' + err.message) })
      .finally(() => { if (activo) setCargando(false) })
    return () => { activo = false }
  }, [abierto, clinicaId])

  const eliminar = async () => {
    if (enVuelo.current) return
    enVuelo.current = true
    setEliminando(true)
    try {
      const r = await eliminarClinica(clinicaId, confirmarNombre, confirmarDatos)
      const { completa, pendientes } = estadoDeLaEliminacion(r)
      if (!completa) {
        // La base de datos YA no contiene la clínica, pero Auth y Storage no comparten transacción con ella y quedó limpieza
        // pendiente (o no se pudo confirmar). No se esconde ni se anuncia «por completo»: la lista está en la auditoría y se reanuda.
        console.warn('Eliminación con limpieza pendiente:', r.advertencias)
        const detalle = pendientes?.desconocido ? 'no se pudo confirmar qué quedó pendiente' : `${pendientes?.archivos ?? 0} archivo(s) y ${pendientes?.cuentas ?? 0} cuenta(s) de acceso`
        toastError(`La clínica se eliminó de la base de datos, pero la limpieza NO está completa (${detalle}). Está registrada en la auditoría y se puede reanudar.`)
      } else {
        toastExito('Clínica eliminada por completo (base de datos, archivos y cuentas de acceso).')
      }
      onEliminada()
    } catch (err) {
      // Nada se borró (la base es todo o nada): el mensaje dice por qué.
      toastError('No se pudo eliminar la clínica: ' + err.message)
    } finally {
      enVuelo.current = false
      setEliminando(false)
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={() => !eliminando && onCerrar()} titulo="Eliminar clínica — no se puede deshacer">
      <ContenidoEliminarClinica resumen={resumen} cargando={cargando} error={error} confirmarNombre={confirmarNombre} onNombre={setConfirmarNombre}
        confirmarDatos={confirmarDatos} onDatos={setConfirmarDatos} eliminando={eliminando} onEliminar={eliminar} onCancelar={onCerrar} />
    </Modal>
  )
}
