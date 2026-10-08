import { Link } from 'react-router-dom'
import { useAuthStore } from '../../store/useAuthStore'
import { usePlanActual } from '../../hooks/useFuncionalidad'
import { avisoSuscripcion } from '../../lib/planes'

const ESTILO = {
  info: 'border-blue-200 bg-blue-50 text-blue-800',
  alerta: 'border-amber-200 bg-amber-50 text-amber-800',
  critico: 'border-red-200 bg-red-50 text-red-800'
}

// Franja de aviso sobre el vencimiento de la suscripción. Solo para quien administra la clínica (el propietario)
// y el personal de plataforma: dentistas y recepción no tienen por qué ver temas de cobro. Solo informa: vencer no
// bloquea el uso ni borra información.
export function AvisoSuscripcion() {
  const perfil = useAuthStore((s) => s.perfil)
  const { suscripcion } = usePlanActual()
  if (perfil?.rol !== 'owner' && !perfil?.es_super_admin) return null
  const aviso = avisoSuscripcion(suscripcion)
  if (!aviso) return null
  return (
    <div role="status" data-nivel={aviso.nivel} className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm ${ESTILO[aviso.nivel]}`}>
      <span>{aviso.mensaje}</span>
      <Link to="/contacto" className="whitespace-nowrap rounded-lg bg-white/70 px-3 py-1.5 text-xs font-medium hover:bg-white">Contactar a SIRO</Link>
    </div>
  )
}
