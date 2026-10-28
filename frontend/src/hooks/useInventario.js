import { useCallback, useEffect, useState } from 'react'
import {
  obtenerMateriales,
  obtenerMovimientos,
  obtenerRecetas,
  registrarMovimiento,
  crearMaterial,
  actualizarMaterial
} from '../services/inventario'
import { encolarOperacion, listarOperacionesPendientes } from '../lib/colaOffline'
import { useAuthStore } from '../store/useAuthStore'
import { useSucursalStore } from '../store/useSucursalStore'

export function useInventario() {
  const [materiales, setMateriales] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [recetas, setRecetas] = useState([])
  const [pendientes, setPendientes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [m, v, r] = await Promise.all([obtenerMateriales(), obtenerMovimientos(), obtenerRecetas()])
      setMateriales(m)
      setMovimientos(v)
      setRecetas(r)
    } catch (err) {
      setError(err.message)
    }
    // Entradas y salidas hechas sin conexión y todavía no subidas: se muestran como pendientes para no registrarlas dos veces.
    const cola = await listarOperacionesPendientes().catch(() => [])
    setPendientes(cola.filter((op) => op.tipo === 'registrar_movimiento_inventario').map((op) => op.payload))
    setCargando(false)
  }, [])

  useEffect(() => { recargar() }, [recargar])

  // Entrada y salida se encolan sin conexión (id del navegador → reintentar nunca duplica). El AJUSTE no: es un conteo
  // físico «ahora»; subido más tarde pisaría los descuentos de las consultas hechas mientras tanto.
  const registrar = async ({ materialId, tipo, cantidad, motivo }) => {
    const id = crypto.randomUUID()
    if (!navigator.onLine) {
      if (tipo === 'ajuste') throw new Error('El ajuste por conteo físico necesita conexión. Las entradas y salidas sí se guardan sin conexión.')
      const perfil = useAuthStore.getState().perfil
      const payload = { id, materialId, tipo, cantidad: Number(cantidad), motivo: motivo || null }
      await encolarOperacion({
        id,
        tipo: 'registrar_movimiento_inventario',
        entidad: 'movimientos_inventario',
        entidadId: id,
        payload,
        dependeDe: [],
        creado_en: Date.now(),
        usuarioId: perfil?.id ?? null,
        clinicaId: perfil?.clinica_id ?? null,
        sucursalId: useSucursalStore.getState().sucursalActualId,
        claveIdempotencia: id
      })
      await recargar()
      return { ok: true, pendiente: true }
    }
    const resultado = await registrarMovimiento({ id, materialId, tipo, cantidad, motivo })
    await recargar()
    return resultado
  }

  const crear = async (material) => {
    const nuevo = await crearMaterial(material)
    await recargar()
    return nuevo
  }

  const actualizar = async (id, cambios) => {
    await actualizarMaterial(id, cambios)
    await recargar()
  }

  return { materiales, movimientos, recetas, pendientes, cargando, error, recargar, registrar, crear, actualizar }
}
