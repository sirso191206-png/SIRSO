import { create } from 'zustand'
import { obtenerMiSuscripcion } from '../services/planes'
import { useAuthStore } from './useAuthStore'
import { identidadSuscripcion } from '../lib/planes'

// Suscripción de la clínica de la sesión (plan, límites, uso, funcionalidades).
// Sirve para MOSTRAR y para ocultar menús: lo que de verdad se aplica lo decide la
// base de datos (RLS y triggers, migración 075). Aquí no hay ningún plan escrito.
//
// `claveSuscripcion` = "usuario:clínica" a quien pertenece lo cargado. Lo cargado
// para una identidad NUNCA se entrega a otra: ver useFuncionalidad.js.
const VACIO = {
  suscripcion: null,
  claveSuscripcion: null,
  cargada: false,
  cargando: false,
  error: null,
  esOffline: false, // true = mostrando el último snapshot guardado, no datos frescos
  ultimaActualizacion: null // cuándo se obtuvo lo que se muestra (ms)
}

const identidadActual = () => identidadSuscripcion(useAuthStore.getState().perfil)

// Cada limpiar() invalida las cargas en vuelo: si la cuenta/clínica cambia mientras
// se espera la respuesta, esa respuesta (de la identidad anterior) se DESCARTA.
let version = 0
// Una recarga pedida mientras otra estaba en curso (p. ej. al crear un usuario): se hace al terminar.
let recargaPendiente = false

export const usePlanStore = create((set, get) => ({
  ...VACIO,

  // `forzar`: si ya hay una carga en curso, pide otra al terminar (el contador de uso cambió y la
  // que va en vuelo pudo haber salido antes del cambio).
  cargar: async ({ forzar = false } = {}) => {
    if (get().cargando) { // sin peticiones simultáneas
      if (forzar) recargaPendiente = true
      return
    }
    const identidad = identidadActual()
    // Lo que hay pertenece a otra identidad: se descarta ANTES de pedir lo nuevo.
    if (get().claveSuscripcion && get().claveSuscripcion !== identidad) {
      version++
      set({ ...VACIO })
    }
    const miVersion = version
    set({ cargando: true, error: null })
    try {
      const { suscripcion, deCache, guardadoEn } = await obtenerMiSuscripcion()
      if (miVersion !== version) return // llegó tarde: ya es otra identidad (o se cerró sesión)
      set({
        suscripcion,
        claveSuscripcion: identidad,
        cargada: true,
        cargando: false,
        esOffline: !!deCache,
        ultimaActualizacion: guardadoEn ?? Date.now()
      })
    } catch (err) {
      if (miVersion !== version) return
      // Sin red y sin caché, o rechazo del servidor: NO se inventa ningún plan.
      // Si ya había uno cargado para esta identidad se conserva (y se avisa del
      // error); si no, queda en null y la interfaz no oculta nada.
      set({ error: err?.message ?? 'No se pudo cargar el plan', cargada: true, cargando: false })
    }
    if (recargaPendiente) {
      recargaPendiente = false
      await get().cargar()
    }
  },

  limpiar: () => {
    version++
    recargaPendiente = false
    set({ ...VACIO })
  }
}))

// Cierre de sesión, cambio de cuenta o cambio de clínica — por CUALQUIER camino
// (logout voluntario, cierre forzado, sesión vencida, recarga de perfil): en cuanto
// cambia la identidad del perfil, lo cargado se descarta. No depende de que ningún
// componente esté montado.
useAuthStore.subscribe((estado, previo) => {
  if (identidadSuscripcion(estado.perfil) !== identidadSuscripcion(previo.perfil)) {
    usePlanStore.getState().limpiar()
  }
})
