import { useCallback, useEffect, useState } from 'react'
import {
  obtenerTratamientos,
  crearTratamiento,
  cambiarEstadoTratamiento,
  actualizarTratamiento,
  registrarSesion
} from '../services/tratamientos'

export function useTratamientos(pacienteId) {
  const [tratamientos, setTratamientos] = useState([])
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    setCargando(true)
    const data = await obtenerTratamientos(pacienteId)
    setTratamientos(data)
    setCargando(false)
  }, [pacienteId])

  useEffect(() => {
    if (pacienteId) recargar()
  }, [pacienteId, recargar])

  const agregar = async (tratamiento) => {
    await crearTratamiento({ ...tratamiento, paciente_id: pacienteId })
    await recargar()
  }

  const cambiarEstado = async (id, estado) => {
    await cambiarEstadoTratamiento(id, estado)
    await recargar()
  }

  const actualizar = async (id, cambios) => {
    await actualizarTratamiento(id, cambios)
    await recargar()
  }

  const sumarSesion = async (tratamiento) => {
    await registrarSesion(tratamiento)
    await recargar()
  }

  return { tratamientos, cargando, agregar, cambiarEstado, actualizar, sumarSesion }
}
