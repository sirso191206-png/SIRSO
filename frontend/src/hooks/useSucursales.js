import { useCallback, useEffect, useState } from 'react'
import {
  listarSucursales, crearSucursal, actualizarSucursal, desactivarSucursal, reactivarSucursal
} from '../services/sucursales'

export function useSucursales() {
  const [sucursales, setSucursales] = useState([])
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    setCargando(true)
    const data = await listarSucursales()
    setSucursales(data)
    setCargando(false)
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar])

  const crear = async (datos) => {
    const resultado = await crearSucursal(datos)
    await recargar()
    return resultado
  }

  const actualizar = async (id, cambios) => {
    await actualizarSucursal(id, cambios)
    await recargar()
  }

  const cambiarActiva = async (id, activa) => {
    await (activa ? reactivarSucursal(id) : desactivarSucursal(id))
    await recargar()
  }

  return { sucursales, cargando, crear, actualizar, cambiarActiva, recargar }
}
