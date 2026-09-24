import { create } from 'zustand'

const CLAVE = 'siro_preferencias_cookies'
const VERSION_ACTUAL = 1

function cargar() {
  try {
    const guardado = localStorage.getItem(CLAVE)
    if (!guardado) return null
    const datos = JSON.parse(guardado)
    if (datos.version !== VERSION_ACTUAL) return null
    return datos
  } catch {
    return null
  }
}

const guardadas = cargar()

// necesarias siempre true (no se puede desactivar — la app no funciona
// sin sesión). analiticas/marketing quedan en false siempre, porque
// hoy no existe ninguna cookie de esas categorías que activar — no
// tiene sentido un interruptor que enciende algo que no existe.
export const useCookiesStore = create((set, get) => ({
  decisionTomada: Boolean(guardadas),
  preferencias: guardadas?.preferencias ?? { necesarias: true, preferencias: true, analiticas: false, marketing: false },

  guardar: (preferencias) => {
    const datos = { version: VERSION_ACTUAL, preferencias: { ...preferencias, necesarias: true }, fecha: new Date().toISOString() }
    try {
      localStorage.setItem(CLAVE, JSON.stringify(datos))
    } catch {
      // localStorage puede fallar en modo privado — la preferencia
      // simplemente no persiste entre sesiones, no es crítico.
    }
    set({ decisionTomada: true, preferencias: datos.preferencias })
  },

  aceptarTodas: () => get().guardar({ necesarias: true, preferencias: true, analiticas: false, marketing: false }),
  rechazarNoNecesarias: () => get().guardar({ necesarias: true, preferencias: false, analiticas: false, marketing: false })
}))
