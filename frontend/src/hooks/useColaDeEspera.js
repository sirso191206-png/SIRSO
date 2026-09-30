import { useCallback, useEffect, useState } from 'react'
import { obtenerColaDeEspera, actualizarCita } from '../services/citas'
import { encolarOperacion } from '../lib/colaOffline'
import { useAuthStore } from '../store/useAuthStore'
import { useSucursalStore } from '../store/useSucursalStore'

export function useColaDeEspera() {
  const perfil = useAuthStore((s) => s.perfil)
  const [turnos, setTurnos] = useState([])
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    if (!perfil) return
    setCargando(true)
    const dentistaId = perfil.rol === 'dentista' ? perfil.id : undefined
    const data = await obtenerColaDeEspera({ dentistaId })
    setTurnos(data)
    setCargando(false)
  }, [perfil])

  useEffect(() => {
    recargar()
  }, [recargar])

  const cambiarEstado = async (citaId, estado) => {
    if (!navigator.onLine) {
      const idOp = crypto.randomUUID()
      await encolarOperacion({
        id: idOp,
        tipo: 'actualizar_cita',
        entidad: 'citas',
        entidadId: citaId,
        payload: { id: citaId, cambios: { estado } },
        dependeDe: [],
        creado_en: Date.now(),
        usuarioId: perfil?.id ?? null,
        clinicaId: perfil?.clinica_id ?? null,
        sucursalId: useSucursalStore.getState().sucursalActualId,
        claveIdempotencia: idOp
      })
      // obtenerColaDeEspera() no está cacheado (a diferencia de
      // obtenerMiDia) — recargar() fallaría sin red justo después de
      // haber encolado con éxito. Se refleja el cambio a mano en vez:
      // si el nuevo estado ya no calificaría para la cola, desaparece
      // de la vista; si no, se actualiza en el lugar.
      const fueraDeCola = ['completada', 'cancelada', 'no_asistio'].includes(estado)
      setTurnos((actuales) => (fueraDeCola
        ? actuales.filter((t) => t.id !== citaId)
        : actuales.map((t) => (t.id === citaId ? { ...t, estado } : t))
      ))
      return
    }
    await actualizarCita(citaId, { estado })
    await recargar()
  }

  return { turnos, cargando, recargar, cambiarEstado }
}
