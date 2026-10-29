import { create } from 'zustand'

const CLAVE = 'siro_preferencias_cookies'
const VERSION_ACTUAL = 1

// Almacenamiento de la categoría «Preferencias» (ver lib/inventarioCookies.js). SOLO se escribe con
// guardarPreferenciaLocal, que respeta la decisión de la persona; al rechazarlas se borra lo ya guardado.
export const CLAVES_PREFERENCIAS = ['sirso_odontograma_view', 'siro_usuario_recordado']
export const PREFIJOS_PREFERENCIAS = ['siro:onboarding-oculto:']

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

export function borrarPreferenciasLocales() {
  try {
    const claves = []
    for (let i = 0; i < localStorage.length; i++) claves.push(localStorage.key(i))
    for (const c of claves) {
      if (CLAVES_PREFERENCIAS.includes(c) || PREFIJOS_PREFERENCIAS.some((p) => c?.startsWith(p))) localStorage.removeItem(c)
    }
  } catch {
    // Sin acceso al almacenamiento no hay nada guardado que borrar.
  }
}

const guardadas = cargar()
// Quien ya había rechazado antes de que el interruptor tuviera efecto: se limpia lo que quedó guardado.
if (guardadas && guardadas.preferencias?.preferencias !== true) borrarPreferenciasLocales()

// necesarias siempre true (no se puede desactivar — la app no funciona
// sin sesión). analiticas/marketing quedan en false siempre, porque
// hoy no existe ninguna cookie de esas categorías que activar — no
// tiene sentido un interruptor que enciende algo que no existe.
export const useCookiesStore = create((set, get) => ({
  decisionTomada: Boolean(guardadas),
  // Sin decisión, lo opcional empieza APAGADO (al abrir «Configurar» no debe aparecer ya activado).
  preferencias: guardadas?.preferencias ?? { necesarias: true, preferencias: false, analiticas: false, marketing: false },

  guardar: (preferencias) => {
    const datos = { version: VERSION_ACTUAL, preferencias: { ...preferencias, necesarias: true, analiticas: false, marketing: false }, fecha: new Date().toISOString() }
    try {
      localStorage.setItem(CLAVE, JSON.stringify(datos))
    } catch {
      // localStorage puede fallar en modo privado — la preferencia
      // simplemente no persiste entre sesiones, no es crítico.
    }
    if (!datos.preferencias.preferencias) borrarPreferenciasLocales()
    set({ decisionTomada: true, preferencias: datos.preferencias })
  },

  aceptarTodas: () => get().guardar({ necesarias: true, preferencias: true, analiticas: false, marketing: false }),
  rechazarNoNecesarias: () => get().guardar({ necesarias: true, preferencias: false, analiticas: false, marketing: false })
}))

// Hasta que la persona decide (o si las rechazó) no se guarda nada de «Preferencias» en el dispositivo.
export function preferenciasPermitidas() {
  const { decisionTomada, preferencias } = useCookiesStore.getState()
  return decisionTomada && preferencias.preferencias === true
}

export function guardarPreferenciaLocal(clave, valor) {
  if (!preferenciasPermitidas()) return false
  try {
    localStorage.setItem(clave, valor)
    return true
  } catch {
    return false
  }
}

export function leerPreferenciaLocal(clave) {
  if (!preferenciasPermitidas()) return null
  try {
    return localStorage.getItem(clave)
  } catch {
    return null
  }
}

export function borrarPreferenciaLocal(clave) {
  try { localStorage.removeItem(clave) } catch { /* nada que borrar */ }
}
