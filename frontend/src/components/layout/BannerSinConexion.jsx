import { useConexion } from '../../hooks/useConexion'
import { Icon } from '../ui/Icon'

export function BannerSinConexion() {
  const conectado = useConexion()
  if (conectado) return null

  return (
    <div className="fixed inset-x-0 top-0 z-[200] flex items-center justify-center gap-2 bg-clinico-ambar px-4 py-2 text-center text-sm font-medium text-white">
      <Icon.alertTriangle />
      Sin conexión a internet — lo que ves puede no estar actualizado, y los cambios nuevos no se guardarán hasta que vuelva la señal.
    </div>
  )
}
