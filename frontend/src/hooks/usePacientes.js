import { useEffect, useState } from 'react'
import { buscarPacientes } from '../services/pacientes'

export function usePacientes(termino) {
  const [pacientes, setPacientes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let activo = true
    setCargando(true)

    // Debounce simple: espera 300ms de silencio antes de buscar
    const timeout = setTimeout(async () => {
      try {
        const data = await buscarPacientes(termino)
        if (activo) setPacientes(data)
      } catch (err) {
        if (activo) setError(err)
      } finally {
        if (activo) setCargando(false)
      }
    }, 300)

    return () => {
      activo = false
      clearTimeout(timeout)
    }
  }, [termino])

  return { pacientes, cargando, error }
}
