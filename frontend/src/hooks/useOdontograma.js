import { useCallback, useEffect, useState } from 'react'
import {
  obtenerOdontogramaCompleto,
  actualizarPiezaOdontograma,
  actualizarCara
} from '../services/odontograma'

export function useOdontograma(pacienteId) {
  const [piezas, setPiezas] = useState([])
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    setCargando(true)
    const data = await obtenerOdontogramaCompleto(pacienteId)
    setPiezas(data)
    setCargando(false)
  }, [pacienteId])

  useEffect(() => {
    if (pacienteId) recargar()
  }, [pacienteId, recargar])

  const cambiarEstadoPieza = async (piezaId, cambios) => {
    await actualizarPiezaOdontograma(piezaId, cambios)
    await recargar()
  }

  const cambiarEstadoCara = async (caraId, cambios) => {
    await actualizarCara(caraId, cambios)
    await recargar()
  }

  return { piezas, cargando, cambiarEstadoPieza, cambiarEstadoCara }
}
