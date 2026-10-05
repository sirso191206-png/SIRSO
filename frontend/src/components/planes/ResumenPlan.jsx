import { ListaFuncionalidades } from './ListaFuncionalidades'
import { etiquetaPeriodo, formatearLimite, formatearPrecio, precioDePlan } from '../../lib/planes'

// Vista previa de un plan: precio según modalidad, límites y funcionalidades.
// Todo viene de la base (planes_catalogo / plan_funcionalidades): este componente
// no conoce ningún plan por nombre.
export function ResumenPlan({ plan, modalidad, funcionalidades }) {
  if (!plan) return null
  const precio = precioDePlan(plan, modalidad)
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 text-2xl font-semibold text-slate-800">
        {formatearPrecio(precio, plan.moneda)}
        <span className="ml-1 text-sm font-normal text-slate-500">/ {etiquetaPeriodo(modalidad)}</span>
      </div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Límites</div>
      <ul className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-700">
        <li>{formatearLimite(plan.max_pacientes)} pacientes</li>
        <li>{formatearLimite(plan.max_usuarios)} usuarios</li>
        <li>{formatearLimite(plan.limite_sucursales)} sucursales</li>
        <li>{formatearLimite(plan.limite_sesiones_simultaneas)} sesiones simultáneas</li>
      </ul>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Funcionalidades</div>
      {funcionalidades ? (
        <ListaFuncionalidades funcionalidades={funcionalidades} />
      ) : (
        <p className="text-sm text-slate-400">Cargando funcionalidades…</p>
      )}
    </div>
  )
}
