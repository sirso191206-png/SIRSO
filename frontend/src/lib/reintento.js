import { esErrorDeRed, esErrorDeServidor } from './errorDeRed'

const esperarMs = (ms) => new Promise((resolver) => setTimeout(resolver, ms))

// Repite una operación SOLO cuando tiene sentido: fallos transitorios (red caída, tiempo agotado, 5xx). Un error de
// permisos, de validación o de autenticación se lanza de inmediato — repetirlo no lo arregla. Con espera creciente y
// un tope de intentos (nunca un bucle). Para LECTURAS o escrituras idempotentes; no para altas que no lo sean.
//   vigente(): si devuelve false (la pantalla se cerró, cambió de paciente) se deja de insistir.
export async function conReintentos(operacion, { intentos = 3, esperasMs = [600, 1500], debeReintentar = (e) => esErrorDeRed(e) || esErrorDeServidor(e), vigente = () => true, esperar = esperarMs } = {}) {
  for (let i = 0; ; i++) {
    try {
      return await operacion()
    } catch (error) {
      const ultimo = i >= intentos - 1
      if (ultimo || !debeReintentar(error) || !vigente()) throw error
      await esperar(esperasMs[Math.min(i, esperasMs.length - 1)])
      if (!vigente()) throw error
    }
  }
}
