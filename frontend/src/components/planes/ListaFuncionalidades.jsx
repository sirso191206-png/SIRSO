import { Icon } from '../ui/Icon'
import { agruparFuncionalidades } from '../../lib/planes'

// ✓ incluida / ✕ no incluida, agrupada por categoría. `aplicacion` (de la base)
// indica si se aplica en la base de datos o solo en la interfaz — se muestra al
// superadmin para no prometer más de lo que se cumple.
export function ListaFuncionalidades({ funcionalidades, mostrarAplicacion = false }) {
  const grupos = agruparFuncionalidades(funcionalidades)
  if (grupos.length === 0) return <p className="text-sm text-slate-400">Sin funcionalidades.</p>
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {grupos.map((g) => (
        <div key={g.categoria}>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.etiqueta}</div>
          <ul className="space-y-1">
            {g.items.map((f) => (
              <li key={f.codigo} className="flex items-center gap-2 text-sm">
                <span className={f.habilitada ? 'text-green-600' : 'text-slate-300'}>
                  {f.habilitada ? <Icon.check /> : <Icon.x />}
                </span>
                <span className={f.habilitada ? 'text-slate-700' : 'text-slate-400'}>{f.nombre}</span>
                {mostrarAplicacion && f.aplicacion === 'interfaz' && (
                  <span className="rounded bg-slate-100 px-1.5 text-[10px] text-slate-500" title="Solo oculta la interfaz; la base de datos no la bloquea">
                    solo interfaz
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
