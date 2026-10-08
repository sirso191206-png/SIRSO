import { Link } from 'react-router-dom'
import { rutaInicioPorRol } from '../../lib/accesoPorRol'

// Se muestra cuando alguien escribe la dirección de una sección que su rol no usa. Solo interfaz:
// aunque llegara a ver la pantalla, la base de datos no le devolvería ni le dejaría guardar nada.
export function AccesoNoAutorizado({ rol }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center" role="alert">
      <h1 className="mb-2 text-xl font-semibold text-slate-800">No tienes acceso a esta sección</h1>
      <p className="mb-5 text-sm text-slate-600">
        Tu rol no incluye esta pantalla. Si crees que deberías tener acceso, pídeselo al propietario de tu clínica.
      </p>
      <Link to={rutaInicioPorRol(rol)} className="inline-block rounded-xl bg-clinico-azul px-4 py-2 text-sm font-medium text-white hover:opacity-90">
        Ir al inicio
      </Link>
    </div>
  )
}
