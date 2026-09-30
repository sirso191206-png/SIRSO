import { useCallback, useEffect, useState } from 'react'
import { obtenerCitasRangoConEstado, crearCita, actualizarCita, eliminarCita } from '../services/citas'
import { encolarOperacion } from '../lib/colaOffline'
import { esIdOffline } from '../lib/mapeoIdsOffline'
import { useAuthStore } from '../store/useAuthStore'
import { useSucursalStore } from '../store/useSucursalStore'

export function useCitas({ dentistaId, estado, desde, hasta, sucursalId }) {
  const [citas, setCitas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [deCache, setDeCache] = useState(false)
  const [guardadoEn, setGuardadoEn] = useState(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    try {
      const r = await obtenerCitasRangoConEstado({ dentistaId, estado, desde, hasta, sucursalId })
      setCitas(r.datos)
      setDeCache(r.deCache)
      setGuardadoEn(r.guardadoEn)
    } catch (err) {
      // Antes una falla dejaba `cargando` en true para siempre.
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }, [dentistaId, estado, desde, hasta, sucursalId])

  useEffect(() => {
    recargar()
  }, [recargar])

  const agendar = async (cita) => {
    setError(null)
    try {
      // Un paciente offline SIEMPRE se encola, incluso si en este
      // instante hay internet — su fila todavía no existe en el
      // servidor, así que crear la cita ahí directo fallaría igual.
      if (!navigator.onLine || esIdOffline(cita.paciente_id)) {
        // Id generado en el navegador, upsert-safe — mismo patrón que
        // notas/recetas/tratamientos: reintentar nunca duplica.
        const id = crypto.randomUUID()
        const citaCompleta = { ...cita, id }
        const perfil = useAuthStore.getState().perfil
        await encolarOperacion({
          id,
          tipo: 'crear_cita',
          entidad: 'citas',
          entidadId: id,
          payload: citaCompleta,
          dependeDe: esIdOffline(cita.paciente_id) ? [cita.paciente_id] : [],
          creado_en: Date.now(),
          usuarioId: perfil?.id ?? null,
          clinicaId: perfil?.clinica_id ?? null,
          sucursalId: useSucursalStore.getState().sucursalActualId,
          claveIdempotencia: id
        })
        await recargar()
        return
      }
      await crearCita(cita)
      await recargar()
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  const reagendar = async (id, cambios) => {
    setError(null)
    try {
      // Mismo criterio que agendar(): un paciente offline siempre
      // encola, pero aquí no aplica — una cita ya agendada siempre
      // referencia a un paciente que ya existe en el servidor. Lo que
      // sí puede faltar es conexión.
      if (!navigator.onLine) {
        const idOp = crypto.randomUUID()
        const perfil = useAuthStore.getState().perfil
        await encolarOperacion({
          id: idOp,
          tipo: 'actualizar_cita',
          entidad: 'citas',
          entidadId: id,
          payload: { id, cambios },
          creado_en: Date.now(),
          usuarioId: perfil?.id ?? null,
          clinicaId: perfil?.clinica_id ?? null,
          sucursalId: useSucursalStore.getState().sucursalActualId,
          claveIdempotencia: idOp
        })
        await recargar()
        return
      }
      await actualizarCita(id, cambios)
      await recargar()
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  // Cambiar solo el estado (confirmar, marcar en espera, iniciar
  // consulta, completar, no asistió...) — mismo mecanismo que reagendar,
  // con nombre más claro para las acciones del panel de cita.
  const cambiarEstado = (id, nuevoEstado) => reagendar(id, { estado: nuevoEstado })

  const cancelar = (id) => reagendar(id, { estado: 'cancelada' })

  const desagendar = async (id) => {
    setError(null)
    try {
      await eliminarCita(id)
      await recargar()
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  return { citas, cargando, error, deCache, guardadoEn, agendar, reagendar, cambiarEstado, cancelar, desagendar, recargar }
}
