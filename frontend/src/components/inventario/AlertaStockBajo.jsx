import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { obtenerStockBajo } from '../../services/inventario'
import { useAuthStore } from '../../store/useAuthStore'
import { useSucursalStore } from '../../store/useSucursalStore'
import { useDisponibilidad } from '../../hooks/useFuncionalidad'
import { formatearCantidad } from '../../lib/inventario'
import { Button } from '../ui/Button'

const MAX_VISIBLES = 5

// Tablero: materiales agotados o en su mínimo. Solo para quien lleva el inventario (propietario y asistente) y si el plan lo
// incluye; la base devuelve la lista vacía en cualquier otro caso. Sin conexión no se muestra (no hay datos frescos).
export function AlertaStockBajo() {
  const navigate = useNavigate()
  const rol = useAuthStore((s) => s.perfil?.rol)
  const sucursalActualId = useSucursalStore((s) => s.sucursalActualId)
  const disponible = useDisponibilidad()
  const incluido = disponible('inventario')
  const aplica = incluido && ['owner', 'asistente'].includes(rol)
  const [materiales, setMateriales] = useState([])

  useEffect(() => {
    if (!aplica || !navigator.onLine) return
    let activo = true
    obtenerStockBajo(sucursalActualId || null)
      .then((lista) => { if (activo) setMateriales(lista) })
      .catch(() => {})
    return () => { activo = false }
  }, [aplica, sucursalActualId])

  if (!aplica || materiales.length === 0) return null
  const agotados = materiales.filter((m) => m.agotado).length

  return (
    <div role="status" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" data-alerta-stock-bajo>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold">
          Stock bajo en inventario ({materiales.length}){agotados > 0 && ` · ${agotados} agotado${agotados === 1 ? '' : 's'}`}
        </div>
        <Button variante="secundario" onClick={() => navigate('/inventario')}>Ver inventario</Button>
      </div>
      <ul className="space-y-0.5">
        {materiales.slice(0, MAX_VISIBLES).map((m) => (
          <li key={m.id}>
            <span className={m.agotado ? 'font-semibold text-clinico-rojo' : ''}>{m.nombre}</span>: {formatearCantidad(m.stock)} {m.unidad}
            <span className="text-amber-700"> (mínimo {formatearCantidad(m.stock_minimo)})</span>
          </li>
        ))}
        {materiales.length > MAX_VISIBLES && <li className="text-amber-700">y {materiales.length - MAX_VISIBLES} más…</li>}
      </ul>
    </div>
  )
}
