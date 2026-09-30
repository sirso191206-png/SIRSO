import { useCallback, useEffect, useState } from 'react'
import {
  obtenerOdontogramaCompleto,
  actualizarPiezaOdontograma,
  actualizarCara,
  construirCambiosPieza
} from '../services/odontograma'
import { encolarOperacion, listarOperacionesPendientes } from '../lib/colaOffline'
import { esIdOffline } from '../lib/mapeoIdsOffline'
import { piezasOfflineIniciales, numeroDePiezaOffline } from '../lib/odontogramaOffline'
import { useAuthStore } from '../store/useAuthStore'
import { useSucursalStore } from '../store/useSucursalStore'

export function useOdontograma(pacienteId) {
  const [piezas, setPiezas] = useState([])
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    setCargando(true)

    if (esIdOffline(pacienteId)) {
      // No hay nada que pedirle al servidor todavía: las 32 piezas las
      // crea un trigger cuando el paciente existe ahí. Se muestra un
      // odontograma "en blanco" (igual al que crearía ese trigger) con
      // los cambios que ya se encolaron encima.
      const pendientes = await listarOperacionesPendientes().catch(() => [])
      const propias = pendientes.filter((op) => op.tipo === 'actualizar_pieza_odontograma' && op.payload.pacienteIdOffline === pacienteId)
      const base = piezasOfflineIniciales()
      const conPendientes = base.map((pieza) => {
        const pendiente = propias.find((op) => op.payload.numeroPieza === pieza.numero_pieza)
        if (!pendiente) return pieza
        return { ...pieza, ...construirCambiosPieza(pendiente.payload.cambios), _pendiente: true }
      })
      setPiezas(conPendientes)
      setCargando(false)
      return
    }

    const data = await obtenerOdontogramaCompleto(pacienteId)
    // Si hay cambios de pieza sin subir todavía (cola offline), se
    // re-aplican encima de los datos frescos del servidor — si no, la
    // vista los perdería de vista hasta que terminen de subirse.
    const pendientes = await listarOperacionesPendientes().catch(() => [])
    const dataConPendientes = data.map((pieza) => {
      const pendiente = pendientes.find((op) => op.tipo === 'actualizar_pieza_odontograma' && op.payload.piezaId === pieza.id)
      if (!pendiente) return pieza
      return { ...pieza, ...construirCambiosPieza(pendiente.payload.cambios), _pendiente: true }
    })
    setPiezas(dataConPendientes)
    setCargando(false)
  }, [pacienteId])

  useEffect(() => {
    if (pacienteId) recargar()
  }, [pacienteId, recargar])

  const cambiarEstadoPieza = async (piezaId, cambios) => {
    const numeroPiezaOffline = numeroDePiezaOffline(piezaId)
    if (numeroPiezaOffline) {
      // Un id de pieza offline solo puede venir de un odontograma
      // offline, es decir, de un paciente offline — pacienteId ya lo es.
      // Clave estable por pieza: volver a tocarla antes de sincronizar
      // reemplaza el cambio anterior en vez de acumular uno por click.
      const id = `actualizar_pieza_odontograma_offline_${pacienteId}_${numeroPiezaOffline}`
      const perfil = useAuthStore.getState().perfil
      // El candado de concurrencia (actualizadoEnEsperado) no aplica
      // aquí: la pieza todavía no existe en ningún lado, nadie más pudo
      // haberla tocado antes.
      const { actualizadoEnEsperado: _sinUsar, ...cambiosSinCandado } = cambios
      await encolarOperacion({
        id,
        tipo: 'actualizar_pieza_odontograma',
        entidad: 'odontograma_piezas',
        entidadId: id,
        payload: { pacienteIdOffline: pacienteId, numeroPieza: numeroPiezaOffline, cambios: cambiosSinCandado },
        dependeDe: [pacienteId],
        creado_en: Date.now(),
        usuarioId: perfil?.id ?? null,
        clinicaId: perfil?.clinica_id ?? null,
        sucursalId: useSucursalStore.getState().sucursalActualId,
        claveIdempotencia: id
      })
      const camposVisibles = construirCambiosPieza(cambios)
      setPiezas((actuales) => actuales.map((p) => (p.id === piezaId ? { ...p, ...camposVisibles, _pendiente: true } : p)))
      return
    }

    if (!navigator.onLine) {
      // Clave estable por pieza (no un id nuevo cada vez): si la misma
      // pieza se vuelve a tocar antes de reconectar, el cambio nuevo
      // reemplaza al anterior en la cola en vez de acumularse — solo
      // importa el último estado, no cada paso intermedio.
      const id = `actualizar_pieza_odontograma_${piezaId}`
      const perfil = useAuthStore.getState().perfil
      await encolarOperacion({
        id,
        tipo: 'actualizar_pieza_odontograma',
        entidad: 'odontograma_piezas',
        entidadId: piezaId,
        payload: { piezaId, cambios },
        creado_en: Date.now(),
        usuarioId: perfil?.id ?? null,
        clinicaId: perfil?.clinica_id ?? null,
        sucursalId: useSucursalStore.getState().sucursalActualId,
        claveIdempotencia: id
      })
      // Optimista: refleja el cambio en pantalla de inmediato, usando
      // exactamente la misma conversión de campos que usaría el
      // guardado real, para que nunca se vean distintos.
      const camposVisibles = construirCambiosPieza(cambios)
      setPiezas((actuales) => actuales.map((p) => (p.id === piezaId ? { ...p, ...camposVisibles, _pendiente: true } : p)))
      return
    }
    await actualizarPiezaOdontograma(piezaId, cambios)
    await recargar()
  }

  const cambiarEstadoCara = async (caraId, cambios) => {
    await actualizarCara(caraId, cambios)
    await recargar()
  }

  return { piezas, cargando, cambiarEstadoPieza, cambiarEstadoCara }
}
