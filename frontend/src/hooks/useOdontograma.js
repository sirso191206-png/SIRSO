import { useCallback, useEffect, useRef, useState } from 'react'
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
import { conReintentos } from '../lib/reintento'
import { mensajeErrorDeCarga } from '../lib/errorDeRed'

// `habilitado: false` → no pide nada (lo usa quien recibe los datos de un padre y solo necesita las acciones).
//
// `cargando` es SOLO la carga INICIAL del paciente actual (todavía no hay nada que mostrar). Un refresco posterior
// (por ejemplo, tras guardar una pieza) NO lo vuelve a poner en true: antes sí, y como las pantallas devuelven
// "Cargando…" mientras cargando=true, cada guardado desmontaba el odontograma completo — en el 3D, destruyendo el
// <Canvas> y su contexto WebGL y reiniciando la cámara — para volver a crearlos un instante después.
export function useOdontograma(pacienteId, { habilitado = true } = {}) {
  const [piezas, setPiezas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  // Quién es el paciente VIGENTE y cuál fue la última petición. Una respuesta que llega tarde (de otro paciente, o
  // superada por una más nueva) se ignora: sin esto, cambiar de paciente rápido podía pintar el odontograma del
  // paciente anterior sobre el nuevo.
  const pacienteVigente = useRef(pacienteId)
  const secuencia = useRef(0)
  pacienteVigente.current = pacienteId

  const recargar = useCallback(async () => {
    if (!pacienteId || pacienteId !== pacienteVigente.current) return
    const mia = ++secuencia.current
    const vigente = () => mia === secuencia.current && pacienteId === pacienteVigente.current
    try {
      let lista
      if (esIdOffline(pacienteId)) {
        // No hay nada que pedirle al servidor todavía: las 32 piezas las
        // crea un trigger cuando el paciente existe ahí. Se muestra un
        // odontograma "en blanco" (igual al que crearía ese trigger) con
        // los cambios que ya se encolaron encima.
        const pendientes = await listarOperacionesPendientes().catch(() => [])
        const propias = pendientes.filter((op) => op.tipo === 'actualizar_pieza_odontograma' && op.payload.pacienteIdOffline === pacienteId)
        lista = piezasOfflineIniciales().map((pieza) => {
          const pendiente = propias.find((op) => op.payload.numeroPieza === pieza.numero_pieza)
          if (!pendiente) return pieza
          return { ...pieza, ...construirCambiosPieza(pendiente.payload.cambios), _pendiente: true }
        })
      } else {
        // Un fallo TRANSITORIO (red, tiempo agotado, 5xx) se reintenta con espera creciente; uno definitivo
        // (permisos, datos) no. La lectura ya cae a la copia local si existe (ver conCacheDeLectura).
        const data = await conReintentos(() => obtenerOdontogramaCompleto(pacienteId), { vigente })
        // Si hay cambios de pieza sin subir todavía (cola offline), se
        // re-aplican encima de los datos frescos del servidor — si no, la
        // vista los perdería de vista hasta que terminen de subirse.
        const pendientes = await listarOperacionesPendientes().catch(() => [])
        lista = data.map((pieza) => {
          const pendiente = pendientes.find((op) => op.tipo === 'actualizar_pieza_odontograma' && op.payload.piezaId === pieza.id)
          if (!pendiente) return pieza
          return { ...pieza, ...construirCambiosPieza(pendiente.payload.cambios), _pendiente: true }
        })
      }
      if (!vigente()) return
      setPiezas(lista)
      setError(null)
    } catch (err) {
      if (!vigente()) return
      console.error('No se pudo cargar el odontograma:', err)
      // Se conservan las piezas que ya hubiera (un refresco fallido no borra lo que se estaba viendo).
      setError(mensajeErrorDeCarga(err, 'el odontograma'))
    } finally {
      if (vigente()) setCargando(false)
    }
  }, [pacienteId])

  // Paciente nuevo: se descarta lo del anterior ANTES de pedir lo nuevo (nunca mostrar el odontograma de otra
  // persona), y se invalida cualquier petición que siguiera en vuelo.
  const invalidarPeticiones = useCallback(() => { secuencia.current += 1 }, [])
  useEffect(() => {
    setPiezas([])
    setError(null)
    setCargando(true)
    return invalidarPeticiones
  }, [pacienteId, invalidarPeticiones])

  useEffect(() => {
    if (habilitado && pacienteId) recargar()
  }, [habilitado, pacienteId, recargar])

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

  return { piezas, cargando, error, recargar, cambiarEstadoPieza, cambiarEstadoCara }
}
