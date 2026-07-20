import { useCallback, useEffect, useState } from 'react'
import { obtenerColaDeEspera, actualizarCita } from '../services/citas'
import { useAuthStore } from '../store/useAuthStore'

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
    await actualizarCita(citaId, { estado })
    await recargar()
  }

  return { turnos, cargando, recargar, cambiarEstado }
}
