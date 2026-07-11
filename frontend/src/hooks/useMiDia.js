import { useCallback, useEffect, useState } from 'react'
import { obtenerMiDia } from '../services/miDia'
import { actualizarCita } from '../services/citas'
import { useAuthStore } from '../store/useAuthStore'

export function useMiDia() {
  const perfil = useAuthStore((s) => s.perfil)
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const recargar = useCallback(async () => {
    if (!perfil) return
    setCargando(true)
    setError(null)
    try {
      const data = await obtenerMiDia(perfil)
      setDatos(data)
      return data
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }, [perfil])

  useEffect(() => {
    recargar()
  }, [recargar])

  const iniciarConsulta = async (citaId) => {
    await actualizarCita(citaId, { estado: 'en_consulta' })
    await recargar()
  }

  // Al finalizar, si hay alguien "en espera" pasa automáticamente a ser
  // el nuevo paciente en consulta — el odontólogo no tiene que volver a
  // dar clic para avanzar a la fila.
  const finalizarConsulta = async (citaId) => {
    await actualizarCita(citaId, { estado: 'completada' })

    const siguienteEnEspera = datos?.siguientes
      ?.filter((c) => c.id !== citaId && c.estado === 'en_espera')
      ?.sort((a, b) => new Date(a.inicio) - new Date(b.inicio))[0]

    if (siguienteEnEspera) {
      await actualizarCita(siguienteEnEspera.id, { estado: 'en_consulta' })
    }

    await recargar()
  }

  return { datos, cargando, error, recargar, iniciarConsulta, finalizarConsulta }
}
