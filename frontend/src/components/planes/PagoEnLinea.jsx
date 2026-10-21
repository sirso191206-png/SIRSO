import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { abrirPortalDePago, iniciarPagoEnLinea, obtenerMiCobro } from '../../services/planes'
import { usePlanStore } from '../../store/usePlanStore'
import { etiquetaPeriodo, formatearPrecio } from '../../lib/planes'

const fecha = (v) => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString('es-MX') : '—')

// Pago de la suscripción con tarjeta (Stripe). Solo para el owner: los planes, precios y
// qué se puede pagar en línea vienen de mi_cobro() — nada está escrito aquí.
export function PagoEnLinea() {
  const [cobro, setCobro] = useState(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [eleccion, setEleccion] = useState('')
  const [params, setParams] = useSearchParams()
  const resultadoPago = params.get('pago')
  const recargarPlan = usePlanStore((s) => s.cargar)

  const cargar = useCallback(() => {
    obtenerMiCobro().then(setCobro).catch((e) => setError(e?.message ?? 'No se pudo cargar el pago en línea.'))
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Al volver de Stripe el webhook tarda unos segundos en aplicar el plan: se vuelve a leer dos veces.
  useEffect(() => {
    if (resultadoPago !== 'exito') return undefined
    const t1 = setTimeout(() => { cargar(); recargarPlan() }, 4000)
    const t2 = setTimeout(() => { cargar(); recargarPlan() }, 12000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [resultadoPago, cargar, recargarPlan])

  const opciones = useMemo(() => (cobro?.planes ?? []).flatMap((p) => [
    p.pago_mensual && { valor: `${p.codigo}|mensual`, texto: `${p.nombre} — ${formatearPrecio(p.precio_mensual, p.moneda)} / ${etiquetaPeriodo('mensual')}` },
    p.pago_anual && { valor: `${p.codigo}|anual`, texto: `${p.nombre} — ${formatearPrecio(p.precio_anual, p.moneda)} / ${etiquetaPeriodo('anual')}` },
  ].filter(Boolean)), [cobro])

  if (error && !cobro) return <p className="mb-6 max-w-3xl rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
  if (!cobro || (!cobro.disponible && !cobro.tiene_cliente)) return null

  const irA = async (accion) => {
    setError('')
    setOcupado(true)
    try {
      window.location.assign(await accion())
    } catch (e) {
      setError(e?.message ?? 'No se pudo abrir Stripe.')
      setOcupado(false)
    }
  }
  const pagar = () => {
    const [plan, modalidad] = (eleccion || opciones[0]?.valor || '').split('|')
    if (plan && modalidad) irA(() => iniciarPagoEnLinea(plan, modalidad))
  }
  const sinConexion = typeof navigator !== 'undefined' && navigator.onLine === false

  return (
    <div className="mb-6 max-w-3xl rounded-xl border border-slate-200 bg-white p-6">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Pago en línea</div>

      {resultadoPago === 'exito' && (
        <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
          Pago recibido. Tu plan se actualiza en unos segundos.{' '}
          <button type="button" className="underline" onClick={() => setParams({}, { replace: true })}>Cerrar</button>
        </p>
      )}
      {resultadoPago === 'cancelado' && (
        <p className="mb-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-600" role="status">No se realizó ningún cargo.</p>
      )}
      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}

      {cobro.suspendida ? (
        <p className="text-sm text-slate-600">La clínica está suspendida; el pago en línea no está disponible. Contacta al administrador.</p>
      ) : cobro.pago_automatico ? (
        <p className="mb-3 text-sm text-slate-700">Tu suscripción se cobra automáticamente con tarjeta. Puedes cambiar de plan, de tarjeta o cancelar en «Administrar pago».</p>
      ) : opciones.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="text-sm text-slate-700">
            <span className="mb-1 block">Plan a pagar</span>
            <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={eleccion || opciones[0].valor}
              onChange={(e) => setEleccion(e.target.value)} disabled={ocupado}>
              {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
            </select>
          </label>
          <button type="button" onClick={pagar} disabled={ocupado || sinConexion}
            className="rounded-xl bg-clinico-azul px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {ocupado ? 'Abriendo Stripe…' : 'Pagar con tarjeta'}
          </button>
        </div>
      ) : null}

      {cobro.tiene_cliente && !cobro.suspendida && (
        <button type="button" onClick={() => irA(abrirPortalDePago)} disabled={ocupado || sinConexion}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          Administrar pago
        </button>
      )}
      {sinConexion && <p className="mt-2 text-xs text-slate-500">Necesitas conexión a Internet para pagar.</p>}
      <p className="mt-3 text-xs text-slate-500">El cobro lo procesa Stripe; SIRO no guarda los datos de tu tarjeta.</p>

      {cobro.pagos?.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-sm font-medium text-slate-700">Historial de pagos</div>
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr><th className="py-1">Fecha</th><th>Periodo</th><th>Monto</th><th>Estado</th><th /></tr>
            </thead>
            <tbody>
              {cobro.pagos.map((p, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-1">{fecha(p.fecha)}</td>
                  <td>{fecha(p.periodo_inicio)} – {fecha(p.periodo_fin)}</td>
                  <td>{formatearPrecio(p.monto, p.moneda)}</td>
                  <td className={p.estado === 'pagado' ? 'text-emerald-700' : 'text-red-700'}>{p.estado === 'pagado' ? 'Pagado' : 'Falló'}</td>
                  <td>{p.url_comprobante && <a href={p.url_comprobante} target="_blank" rel="noopener noreferrer" className="text-clinico-azul underline">Recibo</a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
