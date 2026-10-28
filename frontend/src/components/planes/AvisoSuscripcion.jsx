import { Link } from 'react-router-dom'
import { useAuthStore } from '../../store/useAuthStore'
import { usePlanActual } from '../../hooks/useFuncionalidad'
import { avisoMetodoDePago, avisoSuscripcion } from '../../lib/planes'

const ESTILO = {
  info: 'border-blue-200 bg-blue-50 text-blue-800',
  alerta: 'border-amber-200 bg-amber-50 text-amber-800',
  critico: 'border-red-200 bg-red-50 text-red-800'
}

// Franja de aviso sobre el vencimiento de la suscripción y, tras el primer paciente, para registrar el método de pago.
// Solo para quien administra la clínica (el propietario) y el personal de plataforma: dentistas y recepción no tienen
// por qué ver temas de cobro. Al propietario lo lleva directo a «Pago en línea»; desde la 115, terminada la gracia se
// suspende el acceso hasta que se pague (pantalla BloqueoPorPago).
export function AvisoSuscripcion() {
  const perfil = useAuthStore((s) => s.perfil)
  const { suscripcion } = usePlanActual()
  if (perfil?.rol !== 'owner' && !perfil?.es_super_admin) return null
  const aviso = avisoSuscripcion(suscripcion) ?? (perfil?.rol === 'owner' ? avisoMetodoDePago(suscripcion) : null)
  if (!aviso) return null
  const esOwner = perfil?.rol === 'owner'
  return (
    <div role="status" data-nivel={aviso.nivel} className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm ${ESTILO[aviso.nivel]}`}>
      <span>{aviso.mensaje}</span>
      <Link to={esOwner ? '/configuracion?seccion=pago' : '/contacto'} className="whitespace-nowrap rounded-lg bg-white/70 px-3 py-1.5 text-xs font-medium hover:bg-white">
        {esOwner ? 'Agregar método de pago' : 'Contactar a SIRO'}
      </Link>
    </div>
  )
}
