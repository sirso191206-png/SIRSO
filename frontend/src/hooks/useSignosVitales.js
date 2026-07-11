import { useCallback, useEffect, useState } from 'react'
import { obtenerSignosVitales, agregarSignosVitales } from '../services/signosVitales'

export function useSignosVitales(pacienteId) {
  const [registros, setRegistros] = useState([])
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    setCargando(true)
    const data = await obtenerSignosVitales(pacienteId)
    setRegistros(data)
    setCargando(false)
  }, [pacienteId])

  useEffect(() => {
    if (pacienteId) recargar()
  }, [pacienteId, recargar])

  const agregar = async (registro) => {
    await agregarSignosVitales({ ...registro, paciente_id: pacienteId })
    await recargar()
  }

  return { registros, cargando, agregar }
}
