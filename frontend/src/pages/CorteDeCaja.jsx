import { useEffect, useState } from 'react'
import { obtenerPagosPorRango } from '../services/pagos'
import { useSucursales } from '../hooks/useSucursales'
import { calcularTotalesPorSucursal } from '../lib/cajaConsolidada'
import { useAuthStore } from '../store/useAuthStore'
import { useSucursalStore } from '../store/useSucursalStore'
import { toastError } from '../store/useToastStore'
import { imprimirCorteDeCaja } from '../components/pagos/imprimirCorteDeCaja'
import { Button } from '../components/ui/Button'

function inicioDelDia(fecha) {
  const d = new Date(fecha)
  d.setHours(0, 0, 0, 0)
  return d
}
function finDelDia(fecha) {
  const d = new Date(fecha)
  d.setHours(23, 59, 59, 999)
  return d
}
function formatoInput(fecha) {
  return fecha.toISOString().slice(0, 10)
}

export function CorteDeCaja() {
  const perfil = useAuthStore((s) => s.perfil)
  const sucursalActualId = useSucursalStore((s) => s.sucursalActualId)
  const { sucursales } = useSucursales()
  const hoy = new Date()
  const [desde, setDesde] = useState(formatoInput(hoy))
  const [hasta, setHasta] = useState(formatoInput(hoy))
  const [pagos, setPagos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [imprimiendo, setImprimiendo] = useState(false)

  const cargar = async () => {
    setCargando(true)
    try {
      const data = await obtenerPagosPorRango({
        desde: inicioDelDia(desde).toISOString(),
        hasta: finDelDia(hasta).toISOString(),
        sucursalId: sucursalActualId || undefined
      })
      setPagos(data)
    } catch (err) {
      toastError('No se pudo cargar el corte: ' + err.message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucursalActualId])

  if (!['owner', 'recepcion'].includes(perfil?.rol)) {
    return <p className="text-slate-400">Esta sección solo está disponible para owner y recepción.</p>
  }

  const totalesPorMetodo = pagos.reduce((acc, p) => {
    const signo = p.tipo === 'reembolso' ? -1 : 1
    acc[p.metodo] = (acc[p.metodo] ?? 0) + signo * Number(p.monto)
    return acc
  }, {})
  const totalGeneral = Object.values(totalesPorMetodo).reduce((a, b) => a + b, 0)

  // Desglose por sucursal — solo tiene sentido mostrarlo cuando se está
  // viendo "Todas las sucursales" (sucursalActualId null) Y la clínica
  // realmente tiene más de una. Si ya se filtró a una sucursal
  // específica, o la clínica nunca adoptó multi-sucursal, este bloque
  // no se muestra — es exactamente el corte de siempre.
  const sucursalesActivas = sucursales.filter((s) => s.activa)
  const mostrarConsolidado = !sucursalActualId && sucursalesActivas.length >= 2
  const totalesPorSucursal = mostrarConsolidado ? calcularTotalesPorSucursal(pagos) : []

  const handleImprimir = async () => {
    if (pagos.length === 0) return toastError('No hay movimientos en este periodo.')
    setImprimiendo(true)
    try {
      const sucursalElegida = sucursales.find((s) => s.id === sucursalActualId)
      await imprimirCorteDeCaja({
        pagos,
        desde: inicioDelDia(desde),
        hasta: finDelDia(hasta),
        clinicaId: perfil.clinica_id,
        totalesPorMetodo,
        totalGeneral,
        nombreSucursal: sucursalElegida?.nombre ?? null
      })
    } catch (err) {
      toastError(err.message)
    } finally {
      setImprimiendo(false)
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Corte de caja</h1>
          <p className="text-sm text-slate-500">Totales de todo lo cobrado en la clínica, por método de pago.</p>
        </div>
        <Button onClick={handleImprimir} disabled={imprimiendo}>
          {imprimiendo ? 'Generando…' : '🖨 Imprimir corte'}
        </Button>
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Desde</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Hasta</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <Button variante="secundario" onClick={cargar} disabled={cargando}>{cargando ? 'Buscando…' : 'Buscar'}</Button>
      </div>

      {cargando ? (
        <p className="text-slate-400">Cargando…</p>
      ) : (
        <>
          {mostrarConsolidado && (
            <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">Consolidado por sucursal</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {totalesPorSucursal.map((s) => (
                  <div key={s.sucursalId ?? 'sin-sucursal'} className="rounded-lg bg-slate-50 p-3">
                    <div className="text-xs text-slate-400">{s.nombre}</div>
                    <div className="text-lg font-bold text-slate-800">${s.total.toFixed(2)}</div>
                  </div>
                ))}
                <div className="rounded-lg border-2 border-clinico-azul bg-clinico-azulClaro p-3">
                  <div className="text-xs text-clinico-azul">Consolidado</div>
                  <div className="text-lg font-bold text-clinico-azul">${totalGeneral.toFixed(2)}</div>
                </div>
              </div>
            </div>
          )}

          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(totalesPorMetodo).map(([metodo, monto]) => (
              <div key={metodo} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-xs uppercase tracking-wide text-slate-400">{metodo}</div>
                <div className="text-xl font-bold text-slate-800">${monto.toFixed(2)}</div>
              </div>
            ))}
            <div className="rounded-xl border-2 border-clinico-azul bg-clinico-azulClaro p-4">
              <div className="text-xs uppercase tracking-wide text-clinico-azul">Total</div>
              <div className="text-xl font-bold text-clinico-azul">${totalGeneral.toFixed(2)}</div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-2">Recibo</th>
                  <th className="px-4 py-2">Paciente</th>
                  {mostrarConsolidado && <th className="px-4 py-2">Sucursal</th>}
                  <th className="px-4 py-2">Método</th>
                  <th className="px-4 py-2">Tipo</th>
                  <th className="px-4 py-2">Registrado por</th>
                  <th className="px-4 py-2 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {pagos.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">{p.numero_recibo}</td>
                    <td className="px-4 py-2">{p.paciente?.nombre_completo}</td>
                    {mostrarConsolidado && <td className="px-4 py-2 text-slate-500">{p.sucursal?.nombre ?? '—'}</td>}
                    <td className="px-4 py-2 capitalize">{p.metodo}</td>
                    <td className="px-4 py-2 capitalize">{p.tipo}</td>
                    <td className="px-4 py-2 text-slate-500">{p.registrado_por?.nombre}</td>
                    <td className="px-4 py-2 text-right font-medium">
                      {p.tipo === 'reembolso' && '-'}${Number(p.monto).toFixed(2)}
                    </td>
                  </tr>
                ))}
                {pagos.length === 0 && (
                  <tr><td colSpan={mostrarConsolidado ? 7 : 6} className="px-4 py-6 text-center text-slate-400">Sin movimientos en este periodo.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
