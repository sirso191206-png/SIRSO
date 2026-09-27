import { useCallback, useEffect, useState } from 'react'
import {
  obtenerPeriodontogramaCompleto,
  actualizarPiezaPeriodontal,
  actualizarSitioPeriodontal
} from '../services/periodontograma'
import { encolarOperacion, listarOperacionesPendientes } from '../lib/colaOffline'

// Los campos que llegan aquí ya vienen en snake_case exacto de la base
// de datos (movilidad, furcacion; profundidad_sondaje, recesion,
// etc.) — a diferencia del odontograma, este formulario no traduce
// nombres, así que la vista optimista puede aplicar los cambios
// directo, sin necesitar un conversor aparte.
function quitarCamposDeControl({ usuarioId, actualizadoEnEsperado, ...resto }) {
  return resto
}

export function usePeriodontograma(pacienteId) {
  const [piezas, setPiezas] = useState([])
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    setCargando(true)
    const data = await obtenerPeriodontogramaCompleto(pacienteId)
    const pendientes = await listarOperacionesPendientes().catch(() => [])

    // Re-aplica cambios de pieza y de sitio todavía sin subir, para que
    // no desaparezcan de la vista mientras se suben.
    const dataConPendientes = data.map((pieza) => {
      const piezaPendiente = pendientes.find((op) => op.tipo === 'actualizar_pieza_periodontal' && op.payload.piezaId === pieza.id)
      const sitiosConPendientes = (pieza.sitios ?? []).map((sitio) => {
        const sitioPendiente = pendientes.find((op) => op.tipo === 'actualizar_sitio_periodontal' && op.payload.sitioId === sitio.id)
        return sitioPendiente ? { ...sitio, ...quitarCamposDeControl(sitioPendiente.payload.cambios), _pendiente: true } : sitio
      })
      return {
        ...pieza,
        ...(piezaPendiente ? { ...quitarCamposDeControl(piezaPendiente.payload.cambios), _pendiente: true } : {}),
        sitios: sitiosConPendientes
      }
    })
    setPiezas(dataConPendientes)
    setCargando(false)
  }, [pacienteId])

  useEffect(() => {
    if (pacienteId) recargar()
  }, [pacienteId, recargar])

  const cambiarPieza = async (piezaId, cambios) => {
    if (!navigator.onLine) {
      const id = `actualizar_pieza_periodontal_${piezaId}`
      await encolarOperacion({ id, tipo: 'actualizar_pieza_periodontal', payload: { piezaId, cambios }, creado_en: Date.now() })
      await recargar()
      return
    }
    await actualizarPiezaPeriodontal(piezaId, cambios)
    await recargar()
  }

  const cambiarSitio = async (sitioId, cambios) => {
    if (!navigator.onLine) {
      const id = `actualizar_sitio_periodontal_${sitioId}`
      await encolarOperacion({ id, tipo: 'actualizar_sitio_periodontal', payload: { sitioId, cambios }, creado_en: Date.now() })
      await recargar()
      return
    }
    await actualizarSitioPeriodontal(sitioId, cambios)
    await recargar()
  }

  return { piezas, cargando, cambiarPieza, cambiarSitio }
}
