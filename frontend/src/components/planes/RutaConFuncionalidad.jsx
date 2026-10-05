import { useFuncionalidad } from '../../hooks/useFuncionalidad'
import { FuncionalidadNoDisponible } from './FuncionalidadNoDisponible'

// Envuelve una ruta que depende de una funcionalidad del plan. Si el usuario
// escribe la dirección a mano y su plan no la incluye, ve el estado "no disponible"
// en vez de la pantalla. Es protección de UX: la seguridad real está en la base de
// datos. Mientras no se conozca la suscripción (o en clínicas anteriores a los
// planes) NO bloquea nada.
export function RutaConFuncionalidad({ funcionalidad, children }) {
  const disponible = useFuncionalidad(funcionalidad)
  return disponible ? children : <FuncionalidadNoDisponible funcionalidad={funcionalidad} />
}
