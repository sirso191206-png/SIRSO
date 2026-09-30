import { useCallback, useEffect, useState } from 'react'
import {
  obtenerTratamientos,
  crearTratamiento,
  cambiarEstadoTratamiento,
  cancelarTratamiento,
  actualizarTratamiento,
  registrarSesion
} from '../services/tratamientos'
import { encolarOperacion, listarOperacionesPendientes } from '../lib/colaOffline'
import { esIdOffline } from '../lib/mapeoIdsOffline'
import { useAuthStore } from '../store/useAuthStore'
import { useSucursalStore } from '../store/useSucursalStore'

export function useTratamientos(pacienteId) {
  const [tratamientos, setTratamientos] = useState([])
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    setCargando(true)

    if (esIdOffline(pacienteId)) {
      // Un paciente que todavía no existe en el servidor no puede
      // tener tratamientos reales — solo los que ya se encolaron.
      const pendientes = await listarOperacionesPendientes().catch(() => [])
      const tratamientosPendientes = pendientes
        .filter((op) => op.tipo === 'crear_tratamiento' && op.payload.paciente_id === pacienteId)
        .map((op) => ({ ...op.payload, _pendiente: true }))
      setTratamientos(tratamientosPendientes)
      setCargando(false)
      return
    }

    const data = await obtenerTratamientos(pacienteId)
    // Tratamientos creados sin conexión y todavía no subidos: se
    // agregan encima para que no desaparezcan de la vista mientras se
    // suben (mismo patrón que notas clínicas y recetas).
    const pendientes = await listarOperacionesPendientes().catch(() => [])
    const tratamientosPendientes = pendientes
      .filter((op) => op.tipo === 'crear_tratamiento' && op.payload.paciente_id === pacienteId)
      .map((op) => ({ ...op.payload, _pendiente: true }))
    setTratamientos([...tratamientosPendientes, ...data])
    setCargando(false)
  }, [pacienteId])

  useEffect(() => {
    if (pacienteId) recargar()
  }, [pacienteId, recargar])

  const agregar = async (tratamiento) => {
    // Un paciente offline SIEMPRE se encola, incluso si en este
    // instante hay internet — su fila todavía no existe en el
    // servidor, así que crearlo ahí directo fallaría de cualquier forma.
    if (!navigator.onLine || esIdOffline(pacienteId)) {
      // Id generado en el navegador, upsert-safe — mismo patrón que
      // notas clínicas y recetas: reintentar la subida nunca duplica.
      const id = crypto.randomUUID()
      const tratamientoCompleto = { ...tratamiento, id, paciente_id: pacienteId, creado_en: new Date().toISOString() }
      const perfil = useAuthStore.getState().perfil
      await encolarOperacion({
        id,
        tipo: 'crear_tratamiento',
        entidad: 'tratamientos',
        entidadId: id,
        payload: tratamientoCompleto,
        dependeDe: esIdOffline(pacienteId) ? [pacienteId] : [],
        creado_en: Date.now(),
        usuarioId: perfil?.id ?? null,
        clinicaId: perfil?.clinica_id ?? null,
        sucursalId: useSucursalStore.getState().sucursalActualId,
        claveIdempotencia: id
      })
      await recargar()
      return { ...tratamientoCompleto, _pendiente: true }
    }
    const nuevo = await crearTratamiento({ ...tratamiento, paciente_id: pacienteId })
    await recargar()
    return nuevo
  }

  const cambiarEstado = async (id, estado) => {
    await cambiarEstadoTratamiento(id, estado)
    await recargar()
  }

  const cancelar = async (id, datos) => {
    await cancelarTratamiento(id, datos)
    await recargar()
  }

  const actualizar = async (id, cambios) => {
    await actualizarTratamiento(id, cambios)
    await recargar()
  }

  const sumarSesion = async (tratamiento) => {
    await registrarSesion(tratamiento)
    await recargar()
  }

  return { tratamientos, cargando, agregar, cambiarEstado, cancelar, actualizar, sumarSesion }
}
