import { supabase } from './supabase'

// Registro de errores del navegador (migración 116; auditoría P1-06). Lo ve el superadmin en «Errores».
// Privacidad: solo mensaje y pila técnica recortados; los identificadores de la URL se reemplazan por «:id»; sin datos
// de formularios. Sin sesión o sin conexión no se envía nada. Máximo 10 por pestaña y sin repetir el mismo error.
const MAX_POR_PESTANA = 10
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
// Ruido conocido que no es un fallo de SIRO (red caída, extensiones del navegador, avisos de ResizeObserver).
const IGNORAR = [/ResizeObserver loop/i, /Failed to fetch/i, /NetworkError/i, /Load failed/i, /^Script error\.?$/i, /AbortError/i]
const VERSION = (import.meta.env?.VITE_VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 12)

const vistos = new Set()
let enviados = 0

export function rutaSinIdentificadores(pathname) {
  return String(pathname ?? '').replace(UUID, ':id')
}

export function registrarErrorCliente(error, contexto = '') {
  try {
    if (enviados >= MAX_POR_PESTANA) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    const mensaje = String(error?.message ?? error ?? '').trim().slice(0, 300)
    if (!mensaje || IGNORAR.some((r) => r.test(mensaje))) return
    const clave = `${contexto}|${mensaje}`
    if (vistos.has(clave)) return
    vistos.add(clave)
    enviados += 1
    const pila = typeof error?.stack === 'string' ? error.stack.replace(UUID, ':id') : ''
    const detalle = [contexto, pila].filter(Boolean).join('\n').slice(0, 1500)
    const ruta = typeof window !== 'undefined' ? rutaSinIdentificadores(window.location.pathname) : ''
    supabase.rpc('fn_registrar_error_cliente', { p_ruta: ruta, p_mensaje: mensaje.replace(UUID, ':id'), p_detalle: detalle, p_version: VERSION })
      .then(() => {}, () => {})
  } catch {
    // Registrar un error nunca debe provocar otro.
  }
}

export function instalarCapturaDeErrores(objetivo = window) {
  objetivo.addEventListener('error', (e) => registrarErrorCliente(e.error ?? e.message, 'error no capturado'))
  objetivo.addEventListener('unhandledrejection', (e) => registrarErrorCliente(e.reason, 'promesa sin capturar'))
}

// Solo para pruebas.
export function _reiniciarRegistroErrores() {
  vistos.clear()
  enviados = 0
}
