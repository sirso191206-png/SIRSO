import { useEffect, useState } from 'react'
import { obtenerLineaTiempo } from '../services/lineaTiempo'

export function useLineaTiempo(pacienteId) {
  const [eventos, setEventos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!pacienteId) return
    let activo = true
    setCargando(true)
    obtenerLineaTiempo(pacienteId)
      .then((data) => activo && setEventos(data))
      .catch((err) => activo && setError(err.message))
      .finally(() => activo && setCargando(false))
    return () => { activo = false }
  }, [pacienteId])

  return { eventos, cargando, error }
}
