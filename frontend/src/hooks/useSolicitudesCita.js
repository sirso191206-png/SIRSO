import { useCallback, useEffect, useState } from 'react'
import { listarSolicitudesPendientes, confirmarSolicitudCita, rechazarSolicitudCita } from '../services/reservaEnLinea'

// Solicitudes de cita en línea pendientes de confirmar (las próximas; RLS deja ver solo las de la clínica, y al dentista
// solo las suyas). Sin conexión, o sin la funcionalidad, la lista queda vacía: la Agenda sigue funcionando igual.
export function useSolicitudesCita({ activo }) {
  const [solicitudes, setSolicitudes] = useState([])

  const recargar = useCallback(async () => {
    if (!activo) { setSolicitudes([]); return }
    try {
      setSolicitudes(await listarSolicitudesPendientes())
    } catch {
      setSolicitudes([])
    }
  }, [activo])

  useEffect(() => {
    recargar()
  }, [recargar])

  const confirmar = async (id, pacienteId) => {
    const citaId = await confirmarSolicitudCita(id, pacienteId)
    await recargar()
    return citaId
  }

  const rechazar = async (id, motivo) => {
    await rechazarSolicitudCita(id, motivo)
    await recargar()
  }

  return { solicitudes, recargar, confirmar, rechazar }
}
