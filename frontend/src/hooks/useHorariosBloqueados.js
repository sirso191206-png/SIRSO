import { useCallback, useEffect, useState } from 'react'
import {
  obtenerHorariosBloqueados,
  crearHorarioBloqueado,
  eliminarHorarioBloqueado
} from '../services/horariosBloqueados'
import { encolarOperacion, listarOperacionesPendientes, quitarOperacion } from '../lib/colaOffline'
import { actualizarCacheDeLectura } from '../lib/cacheLectura'
import { useAuthStore } from '../store/useAuthStore'
import { useSucursalStore } from '../store/useSucursalStore'

export function useHorariosBloqueados({ desde, hasta }) {
  const [bloqueos, setBloqueos] = useState([])
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    setCargando(true)
    const data = await obtenerHorariosBloqueados({ desde, hasta })
    setBloqueos(data)
    setCargando(false)
  }, [desde, hasta])

  useEffect(() => {
    recargar()
  }, [recargar])

  const agregar = async (bloqueo) => {
    if (!navigator.onLine) {
      // Id generado en el navegador, upsert-safe — mismo patrón que
      // pacientes/citas/tratamientos: reintentar nunca duplica.
      const id = crypto.randomUUID()
      const bloqueoCompleto = { ...bloqueo, id }
      const perfil = useAuthStore.getState().perfil
      await encolarOperacion({
        id,
        tipo: 'crear_horario_bloqueado',
        entidad: 'horarios_bloqueados',
        entidadId: id,
        payload: bloqueoCompleto,
        dependeDe: [],
        creado_en: Date.now(),
        usuarioId: perfil?.id ?? null,
        clinicaId: perfil?.clinica_id ?? null,
        sucursalId: useSucursalStore.getState().sucursalActualId,
        claveIdempotencia: id
      })
      // obtenerHorariosBloqueados() SÍ está cacheado por rango — se
      // actualiza esa caché con el bloqueo optimista para que la
      // Agenda lo muestre de inmediato (si no, parecería que el
      // horario sigue libre).
      const actuales = await obtenerHorariosBloqueados({ desde, hasta })
      await actualizarCacheDeLectura(
        `horarios-bloqueados:${JSON.stringify({ desde, hasta })}`,
        [...actuales, { ...bloqueoCompleto, _pendiente: true }]
      )
      await recargar()
      return
    }
    await crearHorarioBloqueado(bloqueo)
    await recargar()
  }

  const eliminar = async (id) => {
    if (!navigator.onLine) {
      // Si este bloqueo todavía ni se ha subido (se creó offline en
      // esta misma sesión), no tiene caso encolar un viaje de
      // "crear, luego eliminar" — se cancela la creación pendiente
      // directo, como si nunca hubiera pasado.
      const pendientes = await listarOperacionesPendientes().catch(() => [])
      const creacionPendiente = pendientes.find((op) => op.tipo === 'crear_horario_bloqueado' && op.entidadId === id)
      if (creacionPendiente) {
        await quitarOperacion(creacionPendiente.id)
      } else {
        const idOp = crypto.randomUUID()
        const perfil = useAuthStore.getState().perfil
        await encolarOperacion({
          id: idOp,
          tipo: 'eliminar_horario_bloqueado',
          entidad: 'horarios_bloqueados',
          entidadId: id,
          payload: { id },
          dependeDe: [],
          creado_en: Date.now(),
          usuarioId: perfil?.id ?? null,
          clinicaId: perfil?.clinica_id ?? null,
          sucursalId: useSucursalStore.getState().sucursalActualId,
          claveIdempotencia: idOp
        })
      }
      const actuales = await obtenerHorariosBloqueados({ desde, hasta })
      await actualizarCacheDeLectura(
        `horarios-bloqueados:${JSON.stringify({ desde, hasta })}`,
        actuales.filter((b) => b.id !== id)
      )
      await recargar()
      return
    }
    await eliminarHorarioBloqueado(id)
    await recargar()
  }

  return { bloqueos, cargando, agregar, eliminar }
}
