import { useCallback, useEffect, useState } from 'react'
import {
  obtenerOdontogramaCompleto,
  actualizarPiezaOdontograma,
  actualizarCara,
  construirCambiosPieza
} from '../services/odontograma'
import { encolarOperacion, listarOperacionesPendientes } from '../lib/colaOffline'

export function useOdontograma(pacienteId) {
  const [piezas, setPiezas] = useState([])
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    setCargando(true)
    const data = await obtenerOdontogramaCompleto(pacienteId)
    // Si hay cambios de pieza sin subir todavía (cola offline), se
    // re-aplican encima de los datos frescos del servidor — si no, la
    // vista los perdería de vista hasta que terminen de subirse.
    const pendientes = await listarOperacionesPendientes().catch(() => [])
    const dataConPendientes = data.map((pieza) => {
      const pendiente = pendientes.find((op) => op.tipo === 'actualizar_pieza_odontograma' && op.payload.piezaId === pieza.id)
      if (!pendiente) return pieza
      return { ...pieza, ...construirCambiosPieza(pendiente.payload.cambios), _pendiente: true }
    })
    setPiezas(dataConPendientes)
    setCargando(false)
  }, [pacienteId])

  useEffect(() => {
    if (pacienteId) recargar()
  }, [pacienteId, recargar])

  const cambiarEstadoPieza = async (piezaId, cambios) => {
    if (!navigator.onLine) {
      // Clave estable por pieza (no un id nuevo cada vez): si la misma
      // pieza se vuelve a tocar antes de reconectar, el cambio nuevo
      // reemplaza al anterior en la cola en vez de acumularse — solo
      // importa el último estado, no cada paso intermedio.
      const id = `actualizar_pieza_odontograma_${piezaId}`
      await encolarOperacion({ id, tipo: 'actualizar_pieza_odontograma', payload: { piezaId, cambios }, creado_en: Date.now() })
      // Optimista: refleja el cambio en pantalla de inmediato, usando
      // exactamente la misma conversión de campos que usaría el
      // guardado real, para que nunca se vean distintos.
      const camposVisibles = construirCambiosPieza(cambios)
      setPiezas((actuales) => actuales.map((p) => (p.id === piezaId ? { ...p, ...camposVisibles, _pendiente: true } : p)))
      return
    }
    await actualizarPiezaOdontograma(piezaId, cambios)
    await recargar()
  }

  const cambiarEstadoCara = async (caraId, cambios) => {
    await actualizarCara(caraId, cambios)
    await recargar()
  }

  return { piezas, cargando, cambiarEstadoPieza, cambiarEstadoCara }
}
