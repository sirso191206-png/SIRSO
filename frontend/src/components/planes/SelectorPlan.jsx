import { useEffect, useState } from 'react'
import { ResumenPlan } from './ResumenPlan'
import { funcionalidadesDePlan, listarPlanes } from '../../services/planes'
import { modalidadesPermitidas } from '../../lib/planes'

const CLASE_INPUT = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm'

// Selector de plan + modalidad con vista previa inmediata (precio, límites,
// funcionalidades). Ofrece solo planes ACTIVOS; los datos salen de la base.
// `valor` = { planCodigo, modalidad }; `onChange` recibe el valor nuevo.
export function SelectorPlan({ valor, onChange }) {
  const [planes, setPlanes] = useState(null)
  const [funcs, setFuncs] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    listarPlanes()
      .then((lista) => {
        const activos = lista.filter((p) => p.activo)
        setPlanes(activos)
        if (!valor.planCodigo && activos.length > 0) {
          const elegido = activos.find((p) => p.recomendado) ?? activos[0]
          onChange({ planCodigo: elegido.plan, modalidad: modalidadesPermitidas(elegido)[0] ?? 'mensual' })
        }
      })
      .catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!valor.planCodigo) return
    setFuncs(null)
    funcionalidadesDePlan(valor.planCodigo).then(setFuncs).catch(() => setFuncs([]))
  }, [valor.planCodigo])

  if (error) return <p className="text-sm text-clinico-rojo">{error}</p>
  if (!planes) return <p className="text-sm text-slate-400">Cargando planes…</p>
  if (planes.length === 0) return <p className="text-sm text-clinico-rojo">No hay planes activos. Crea o activa uno en Planes.</p>

  const plan = planes.find((p) => p.plan === valor.planCodigo)
  const modalidades = modalidadesPermitidas(plan)

  function elegirPlan(codigo) {
    const nuevo = planes.find((p) => p.plan === codigo)
    const permitidas = modalidadesPermitidas(nuevo)
    onChange({ planCodigo: codigo, modalidad: permitidas.includes(valor.modalidad) ? valor.modalidad : permitidas[0] ?? 'mensual' })
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">Plan</span>
          <select className={CLASE_INPUT} value={valor.planCodigo} onChange={(e) => elegirPlan(e.target.value)}>
            {planes.map((p) => <option key={p.plan} value={p.plan}>{p.nombre ?? p.plan}{p.recomendado ? ' (recomendado)' : ''}</option>)}
          </select>
        </label>
        <fieldset className="text-sm">
          <legend className="mb-1 text-slate-500">Modalidad</legend>
          <div className="flex gap-4 pt-2">
            {modalidades.map((m) => (
              <label key={m} className="flex items-center gap-1.5">
                <input type="radio" name="modalidad-plan" checked={valor.modalidad === m} onChange={() => onChange({ ...valor, modalidad: m })} />
                {m === 'anual' ? 'Anual' : 'Mensual'}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <ResumenPlan plan={plan} modalidad={valor.modalidad} funcionalidades={funcs} />
    </div>
  )
}
