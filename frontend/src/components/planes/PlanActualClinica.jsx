import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { BarraUso } from './BarraUso'
import { avisoSuscripcion } from '../../lib/planes'
import { ListaFuncionalidades } from './ListaFuncionalidades'
import { usePlanStore } from '../../store/usePlanStore'
import { usePlanActual } from '../../hooks/useFuncionalidad'
import { etiquetaPeriodo, formatearLimite, formatearPrecio, mensajeExceso } from '../../lib/planes'

// "Plan actual" de la propia clínica: lo CONTRATADO (su snapshot), el uso real y
// qué incluye. Los números vienen de mi_suscripcion() — nada está escrito aquí.
// onMejorarPlan: si la clínica puede pagar en línea, «Mejorar plan» abre esa sección; si no, lleva a Contacto.
export function PlanActualClinica({ onMejorarPlan = null } = {}) {
  // Solo la suscripción de ESTA cuenta y clínica (nunca la de otra identidad).
  const { suscripcion, esOffline, ultimaActualizacion, cargada } = usePlanActual()
  const cargar = usePlanStore((s) => s.cargar)

  // Se refresca al abrir la pantalla para que el uso no quede desactualizado.
  useEffect(() => {
    cargar()
  }, [cargar])

  if (!cargada && !suscripcion) return <p className="mb-6 text-sm text-slate-400">Cargando plan…</p>
  if (!suscripcion) return null

  const { plan, modalidad, precio_contratado: precio, moneda, estado, limites, uso, excesos = [], funcionalidades = [], sin_suscripcion: sinSuscripcion } = suscripcion

  return (
    <div className="mb-6 max-w-3xl rounded-xl border border-slate-200 bg-white p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Plan actual</div>
          <div className="text-2xl font-semibold text-slate-800">{plan?.nombre ?? plan?.codigo}</div>
          {!sinSuscripcion && precio != null && modalidad && (
            <div className="text-sm text-slate-500">{formatearPrecio(precio, moneda)} / {etiquetaPeriodo(modalidad)}</div>
          )}
          {sinSuscripcion && (
            <div className="text-sm text-slate-500">Tu clínica todavía no tiene un plan contratado registrado.</div>
          )}
        </div>
        {funcionalidades.length > 0 && funcionalidades.every((f) => f.habilitada) ? (
          // Ya incluye todas las funcionalidades: no hay a qué «mejorar».
          <Link to="/contacto" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Hablar con soporte
          </Link>
        ) : onMejorarPlan ? (
          <button type="button" onClick={onMejorarPlan} className="rounded-xl bg-clinico-azul px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            Mejorar plan
          </button>
        ) : (
          <Link to="/contacto" className="rounded-xl bg-clinico-azul px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            Mejorar plan
          </Link>
        )}
      </div>

      {esOffline && (
        <p className="mb-4 rounded-lg bg-slate-100 p-3 text-xs text-slate-600" role="status">
          Mostrando datos guardados en este dispositivo
          {ultimaActualizacion ? ` (actualizados el ${new Date(ultimaActualizacion).toLocaleString('es-MX')})` : ''}. Se actualizarán al recuperar la conexión.
        </p>
      )}

      {avisoSuscripcion(suscripcion) && avisoSuscripcion(suscripcion).nivel !== 'info' && (
        <p className={`mb-4 rounded-lg p-3 text-sm ${avisoSuscripcion(suscripcion).nivel === 'critico' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>
          {avisoSuscripcion(suscripcion).mensaje}
        </p>
      )}

      {estado === 'suspendida' && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">Tu suscripción está suspendida. Contacta al administrador.</p>
      )}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BarraUso etiqueta="Pacientes" usado={uso?.pacientes ?? 0} limite={limites?.pacientes} />
        <BarraUso etiqueta="Usuarios" usado={uso?.usuarios ?? 0} limite={limites?.usuarios} />
        <BarraUso etiqueta="Sucursales" usado={uso?.sucursales ?? 0} limite={limites?.sucursales} />
        <BarraUso etiqueta="Almacenamiento" usado={uso?.almacenamiento_mb ?? 0} limite={limites?.almacenamiento_mb} unidad="MB" />
      </div>
      <p className="mb-4 text-xs text-slate-500">Sesiones simultáneas por usuario: {formatearLimite(limites?.sesiones)}</p>

      {excesos.length > 0 && (
        <div className="mb-4 space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          {excesos.map((e) => <p key={e.tipo}>{mensajeExceso(e)}</p>)}
        </div>
      )}

      <details className="group">
        <summary className="cursor-pointer list-none text-sm font-medium text-slate-700 [&::-webkit-details-marker]:hidden">
          Tu plan incluye: <span className="font-normal text-slate-500">{funcionalidades.filter((f) => f.habilitada).length} de {funcionalidades.length} funcionalidades</span>
          <span aria-hidden="true" className="ml-1 inline-block text-slate-400 transition-transform group-open:rotate-180">⌄</span>
        </summary>
        <div className="mt-2"><ListaFuncionalidades funcionalidades={funcionalidades} /></div>
      </details>
    </div>
  )
}
