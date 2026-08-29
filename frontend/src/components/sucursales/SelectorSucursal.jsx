import { useSucursales } from '../../hooks/useSucursales'
import { useSucursalStore } from '../../store/useSucursalStore'

// Se oculta a sí mismo (return null) si la clínica tiene 0 o 1
// sucursal activa — para esas clínicas, mostrar un selector sería
// ruido sin ningún beneficio: no hay nada entre qué elegir.
export function SelectorSucursal() {
  const { sucursales, cargando } = useSucursales()
  const sucursalActualId = useSucursalStore((s) => s.sucursalActualId)
  const setSucursalActual = useSucursalStore((s) => s.setSucursalActual)

  if (cargando) return null

  const activas = sucursales.filter((s) => s.activa)
  if (activas.length < 2) return null

  return (
    <label className="block px-3 py-2 text-xs">
      <span className="mb-1 block font-medium text-slate-400">Sucursal</span>
      <select
        value={sucursalActualId ?? ''}
        onChange={(e) => setSucursalActual(e.target.value || null)}
        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700"
      >
        <option value="">Todas las sucursales</option>
        {activas.map((s) => (
          <option key={s.id} value={s.id}>{s.nombre}</option>
        ))}
      </select>
    </label>
  )
}
