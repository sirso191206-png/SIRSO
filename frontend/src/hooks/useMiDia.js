import { useCallback, useEffect, useState } from 'react'
import { obtenerMiDia } from '../services/miDia'
import { actualizarCita } from '../services/citas'
import { encolarOperacion } from '../lib/colaOffline'
import { useAuthStore } from '../store/useAuthStore'
import { useSucursalStore } from '../store/useSucursalStore'

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

  // Compartida por iniciarConsulta/finalizarConsulta: sin conexión,
  // encola el cambio de estado en vez de fallar — usa el mismo
  // ejecutor `actualizar_cita` que ya sube lo que se reagenda desde
  // Agenda. Id nuevo cada vez (no una clave estable): cada transición
  // de estado es un paso distinto de la fila del día, no una edición
  // que solo importa en su última versión.
  const encolarCambioEstadoCita = async (citaId, estado) => {
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
  }

  const iniciarConsulta = async (citaId) => {
    if (!navigator.onLine) {
      await encolarCambioEstadoCita(citaId, 'en_consulta')
      await recargar()
      return
    }
    await actualizarCita(citaId, { estado: 'en_consulta' })
    await recargar()
  }

  // Al finalizar, si hay alguien "en espera" pasa automáticamente a ser
  // el nuevo paciente en consulta — el odontólogo no tiene que volver a
  // dar clic para avanzar a la fila.
  const finalizarConsulta = async (citaId) => {
    const siguienteEnEspera = datos?.siguientes
      ?.filter((c) => c.id !== citaId && c.estado === 'en_espera')
      ?.sort((a, b) => new Date(a.inicio) - new Date(b.inicio))[0]

    if (!navigator.onLine) {
      await encolarCambioEstadoCita(citaId, 'completada')
      if (siguienteEnEspera) {
        await encolarCambioEstadoCita(siguienteEnEspera.id, 'en_consulta')
      }
      await recargar()
      return
    }

    await actualizarCita(citaId, { estado: 'completada' })
    if (siguienteEnEspera) {
      await actualizarCita(siguienteEnEspera.id, { estado: 'en_consulta' })
    }
    await recargar()
  }

  return { datos, cargando, error, recargar, iniciarConsulta, finalizarConsulta }
}
