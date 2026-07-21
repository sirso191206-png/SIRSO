import { useCallback, useEffect, useState } from 'react'
import { obtenerReferencias, crearReferencia } from '../services/referencias'

export function useReferencias(pacienteId) {
  const [referencias, setReferencias] = useState([])
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    setCargando(true)
    const data = await obtenerReferencias(pacienteId)
    setReferencias(data)
    setCargando(false)
  }, [pacienteId])

  useEffect(() => {
    if (pacienteId) recargar()
  }, [pacienteId, recargar])

  const agregar = async (referencia) => {
    const nueva = await crearReferencia({ ...referencia, paciente_id: pacienteId })
    await recargar()
    return nueva
  }

  return { referencias, cargando, agregar }
}
