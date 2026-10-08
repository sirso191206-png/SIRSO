import { usePuedeVerSucursales } from '../../hooks/useFuncionalidad'
import { FuncionalidadNoDisponible } from './FuncionalidadNoDisponible'

// Si alguien escribe /sucursales a mano y su plan no incluye sucursales (y no tiene ninguna), ve el
// aviso "no disponible en tu plan" en lugar de la pantalla. Solo protección de UX: la base de datos
// rechaza crear sucursales sin la funcionalidad. Sin suscripción cargada no bloquea nada.
export function RutaSucursales({ children }) {
  const ve = usePuedeVerSucursales()
  return ve ? children : <FuncionalidadNoDisponible funcionalidad="multisucursal" />
}
