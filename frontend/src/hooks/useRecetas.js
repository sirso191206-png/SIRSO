import { useCallback, useEffect, useState } from 'react'
import { obtenerRecetas, crearReceta } from '../services/recetas'

export function useRecetas(pacienteId) {
  const [recetas, setRecetas] = useState([])
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    setCargando(true)
    const data = await obtenerRecetas(pacienteId)
    setRecetas(data)
    setCargando(false)
  }, [pacienteId])

  useEffect(() => {
    if (pacienteId) recargar()
  }, [pacienteId, recargar])

  const agregar = async (receta) => {
    const nueva = await crearReceta({ ...receta, paciente_id: pacienteId })
    await recargar()
    return nueva
  }

  return { recetas, cargando, agregar }
}
