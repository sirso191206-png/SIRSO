import { useCallback, useEffect, useState } from 'react'
import {
  obtenerPeriodontogramaCompleto,
  actualizarPiezaPeriodontal,
  actualizarSitioPeriodontal
} from '../services/periodontograma'

export function usePeriodontograma(pacienteId) {
  const [piezas, setPiezas] = useState([])
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    setCargando(true)
    const data = await obtenerPeriodontogramaCompleto(pacienteId)
    setPiezas(data)
    setCargando(false)
  }, [pacienteId])

  useEffect(() => {
    if (pacienteId) recargar()
  }, [pacienteId, recargar])

  const cambiarPieza = async (piezaId, cambios) => {
    await actualizarPiezaPeriodontal(piezaId, cambios)
    await recargar()
  }

  const cambiarSitio = async (sitioId, cambios) => {
    await actualizarSitioPeriodontal(sitioId, cambios)
    await recargar()
  }

  return { piezas, cargando, cambiarPieza, cambiarSitio }
}
