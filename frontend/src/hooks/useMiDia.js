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

  // OJO: aquí YA NO se completa ninguna cita. "Finalizar consulta" es un acto CLÍNICO (nota, verificación, seguimiento): se hace desde
  // la pantalla de consulta (fn_finalizar_consulta). Marcar una cita como completada desde aquí dejaba consultas "completadas" sin
  // nota. La base de datos (migración 090) tampoco lo permite ya. El avance de la fila ocurre al finalizar la consulta.
  return { datos, cargando, error, recargar, iniciarConsulta }
}
