import { useEffect } from 'react'
import { useAuthStore } from '../store/useAuthStore'
import { usePlanStore } from '../store/usePlanStore'
import { identidadSuscripcion } from '../lib/planes'

const REFRESCO_AL_VOLVER_MS = 60 * 1000
const REFRESCO_PERIODICO_MS = 5 * 60 * 1000

// Mantiene la suscripción de la clínica ACTUAL al día. Se monta una vez (Sidebar).
// Carga al iniciar sesión o cuando cambia la identidad (usuario/clínica) — el store
// ya descartó lo anterior — y vuelve a pedirla al recuperar la conexión, al volver
// a la pestaña (máx. 1 vez por minuto) y cada 5 min, para que un cambio de plan
// hecho por el superadmin llegue sin tener que cerrar sesión. Siempre se pide la
// versión fresca; la caché solo cubre la falta de red.
export function useSuscripcionAlDia() {
  const identidad = useAuthStore((s) => identidadSuscripcion(s.perfil))

  useEffect(() => {
    if (!identidad) return undefined
    const cargar = () => usePlanStore.getState().cargar()
    let ultima = Date.now()
    cargar()

    const refrescar = (minimoMs) => {
      if (Date.now() - ultima >= minimoMs) {
        ultima = Date.now()
        cargar()
      }
    }
    const alVolver = () => {
      if (document.visibilityState === 'visible') refrescar(REFRESCO_AL_VOLVER_MS)
    }
    const alConectar = () => {
      ultima = Date.now()
      cargar()
    }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('online', alConectar)
    const intervalo = setInterval(() => refrescar(REFRESCO_PERIODICO_MS), 60 * 1000)

    return () => {
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('online', alConectar)
      clearInterval(intervalo)
    }
  }, [identidad])
}
