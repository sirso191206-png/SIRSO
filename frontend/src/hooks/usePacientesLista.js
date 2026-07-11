import { useEffect, useState } from 'react'
import { buscarPacientesDetallado } from '../services/pacientes'

export function usePacientesLista({ termino, filtroEstado, filtroExtra, orden, pagina, porPagina }) {
  const [pacientes, setPacientes] = useState([])
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let activo = true
    setCargando(true)
    setError(null)

    // Debounce simple del texto de búsqueda
    const timeout = setTimeout(async () => {
      try {
        const { pacientes: data, total: totalRegistros } = await buscarPacientesDetallado({
          termino, filtroEstado, filtroExtra, orden, pagina, porPagina
        })
        if (activo) {
          setPacientes(data)
          setTotal(totalRegistros)
        }
      } catch (err) {
        if (activo) setError(err.message)
      } finally {
        if (activo) setCargando(false)
      }
    }, 300)

    return () => {
      activo = false
      clearTimeout(timeout)
    }
  }, [termino, filtroEstado, filtroExtra, orden, pagina, porPagina])

  return { pacientes, total, cargando, error }
}
