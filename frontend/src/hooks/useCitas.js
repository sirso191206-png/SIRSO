import { useCallback, useEffect, useState } from 'react'
import { obtenerCitasRango, crearCita, actualizarCita, eliminarCita } from '../services/citas'

export function useCitas({ dentistaId, estado, desde, hasta, sucursalId }) {
  const [citas, setCitas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    const data = await obtenerCitasRango({ dentistaId, estado, desde, hasta, sucursalId })
    setCitas(data)
    setCargando(false)
  }, [dentistaId, estado, desde, hasta, sucursalId])

  useEffect(() => {
    recargar()
  }, [recargar])

  const agendar = async (cita) => {
    setError(null)
    try {
      await crearCita(cita)
      await recargar()
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  const reagendar = async (id, cambios) => {
    setError(null)
    try {
      await actualizarCita(id, cambios)
      await recargar()
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  // Cambiar solo el estado (confirmar, marcar en espera, iniciar
  // consulta, completar, no asistió...) — mismo mecanismo que reagendar,
  // con nombre más claro para las acciones del panel de cita.
  const cambiarEstado = (id, nuevoEstado) => reagendar(id, { estado: nuevoEstado })

  const cancelar = (id) => reagendar(id, { estado: 'cancelada' })

  const desagendar = async (id) => {
    setError(null)
    try {
      await eliminarCita(id)
      await recargar()
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  return { citas, cargando, error, agendar, reagendar, cambiarEstado, cancelar, desagendar, recargar }
}
