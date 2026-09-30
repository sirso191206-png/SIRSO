import { useCallback, useEffect, useState } from 'react'
import { obtenerSignosVitales, agregarSignosVitales } from '../services/signosVitales'
import { encolarOperacion, listarOperacionesPendientes } from '../lib/colaOffline'
import { esIdOffline } from '../lib/mapeoIdsOffline'
import { useAuthStore } from '../store/useAuthStore'
import { useSucursalStore } from '../store/useSucursalStore'

export function useSignosVitales(pacienteId) {
  const [registros, setRegistros] = useState([])
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    setCargando(true)

    if (esIdOffline(pacienteId)) {
      // Un paciente que todavía no existe en el servidor no puede
      // tener registros reales — solo los que ya se encolaron.
      const pendientes = await listarOperacionesPendientes().catch(() => [])
      const registrosPendientes = pendientes
        .filter((op) => op.tipo === 'crear_signos_vitales' && op.payload.paciente_id === pacienteId)
        .map((op) => ({ ...op.payload, _pendiente: true }))
      setRegistros(registrosPendientes)
      setCargando(false)
      return
    }

    const data = await obtenerSignosVitales(pacienteId)
    const pendientes = await listarOperacionesPendientes().catch(() => [])
    const registrosPendientes = pendientes
      .filter((op) => op.tipo === 'crear_signos_vitales' && op.payload.paciente_id === pacienteId)
      .map((op) => ({ ...op.payload, _pendiente: true }))
    setRegistros([...registrosPendientes, ...data])
    setCargando(false)
  }, [pacienteId])

  useEffect(() => {
    if (pacienteId) recargar()
  }, [pacienteId, recargar])

  const agregar = async (registro) => {
    // Un paciente offline SIEMPRE se encola, incluso si en este
    // instante hay internet — su fila todavía no existe en el
    // servidor, así que registrarlo ahí directo fallaría de cualquier forma.
    if (!navigator.onLine || esIdOffline(pacienteId)) {
      const id = crypto.randomUUID()
      const registroCompleto = { ...registro, id, paciente_id: pacienteId, creado_en: new Date().toISOString() }
      const perfil = useAuthStore.getState().perfil
      await encolarOperacion({
        id,
        tipo: 'crear_signos_vitales',
        entidad: 'signos_vitales',
        entidadId: id,
        payload: registroCompleto,
        dependeDe: esIdOffline(pacienteId) ? [pacienteId] : [],
        creado_en: Date.now(),
        usuarioId: perfil?.id ?? null,
        clinicaId: perfil?.clinica_id ?? null,
        sucursalId: useSucursalStore.getState().sucursalActualId,
        claveIdempotencia: id
      })
      await recargar()
      return { ...registroCompleto, _pendiente: true }
    }
    const nuevo = await agregarSignosVitales({ ...registro, paciente_id: pacienteId })
    await recargar()
    return nuevo
  }

  return { registros, cargando, agregar }
}
