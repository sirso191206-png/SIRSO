import { Link } from 'react-router-dom'
import { mensajeAlta } from '../../lib/planes'

// Ocupa el lugar del botón "+ Nuevo usuario" / "+ Nueva sucursal" cuando el plan ya no permite
// agregar más, y dice por qué. Es solo interfaz: la base de datos rechaza el alta de más.
export function AvisoAltaBloqueada({ tipo, evaluacion }) {
  return (
    <div className="flex items-center gap-3" role="status">
      <p className="max-w-xs text-right text-xs text-slate-500">{mensajeAlta(tipo, evaluacion)}</p>
      <Link to="/contacto" className="whitespace-nowrap rounded-xl bg-clinico-azul px-3 py-2 text-xs font-medium text-white hover:opacity-90">
        Mejorar plan
      </Link>
    </div>
  )
}
