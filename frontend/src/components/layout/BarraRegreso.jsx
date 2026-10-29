import { Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/useAuthStore'
import { rutaPadre } from '../../lib/navegacion'
import { puedeEntrarARuta } from '../../lib/accesoPorRol'

const CLASE = 'mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-clinico-azul'

// «← Volver a …» en toda subpágina (pacientes/:id, configuración/seguridad, administración/…). Las de primer nivel
// están en el menú lateral y no lo necesitan.
export function BarraRegreso() {
  const { pathname } = useLocation()
  const perfil = useAuthStore((s) => s.perfil)
  const padre = rutaPadre(pathname)
  // Si la página «padre» no es de su rol (p. ej. el owner en /administracion/arco: /administracion es solo del
  // superadmin), no se ofrece un enlace que terminaría en «No tienes acceso».
  if (!padre || !puedeEntrarARuta(padre.to, perfil)) return null
  return (
    <nav aria-label="Regresar">
      <Link to={padre.to} className={CLASE}><span aria-hidden="true">←</span> Volver a {padre.etiqueta}</Link>
    </nav>
  )
}

// Páginas públicas (centro legal, contacto): con sesión no hay menú lateral, así que se ofrece volver a SIRO; en un
// documento legal, además, volver al centro legal.
export function BarraRegresoPublica() {
  const { pathname } = useLocation()
  const session = useAuthStore((s) => s.session)
  const padre = rutaPadre(pathname)
  if (!session && !padre) return null
  return (
    <nav aria-label="Regresar" className="mb-6 flex flex-wrap gap-x-5 gap-y-1">
      {session && <Link to="/" className={CLASE.replace('mb-4 ', '')}><span aria-hidden="true">←</span> Volver a SIRO</Link>}
      {padre && <Link to={padre.to} className={CLASE.replace('mb-4 ', '')}><span aria-hidden="true">←</span> {padre.etiqueta}</Link>}
    </nav>
  )
}
