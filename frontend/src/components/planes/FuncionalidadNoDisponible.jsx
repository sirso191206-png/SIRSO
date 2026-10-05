import { Link } from 'react-router-dom'
import { usePlanActual } from '../../hooks/useFuncionalidad'
import { nombreDeFuncionalidad } from '../../lib/planes'

// Estado que se muestra cuando se llega a una pantalla que el plan no incluye.
// Es SOLO protección de UX (no es un 403): quien de verdad impide usar la
// funcionalidad es la base de datos. Los nombres salen de la suscripción (base de
// datos); aquí no hay nombres de funcionalidades ni de planes escritos a mano.
export function FuncionalidadNoDisponible({ funcionalidad }) {
  const { suscripcion } = usePlanActual()
  const codigos = Array.isArray(funcionalidad) ? funcionalidad : [funcionalidad]
  const nombres = codigos.map((c) => nombreDeFuncionalidad(suscripcion, c)).filter(Boolean)
  const plan = suscripcion?.plan?.nombre ?? suscripcion?.plan?.codigo

  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center" role="status">
      <h1 className="mb-2 text-xl font-semibold text-slate-800">Esta funcionalidad no está disponible en tu plan.</h1>
      {nombres.length > 0 && (
        <p className="mb-1 text-sm text-slate-600">
          Funcionalidad: <strong>{nombres.join(', ')}</strong>
        </p>
      )}
      {plan && (
        <p className="mb-5 text-sm text-slate-600">
          Plan actual: <strong>{plan}</strong>
        </p>
      )}
      <Link to="/contacto" className="inline-block rounded-xl bg-clinico-azul px-4 py-2 text-sm font-medium text-white hover:opacity-90">
        Mejorar plan
      </Link>
    </div>
  )
}
