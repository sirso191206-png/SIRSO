// Cambio OBLIGATORIO de la contraseña temporal (migración 103). Lógica pura de la pantalla: validación y mensajes.
// La protección REAL (bloqueo de datos y de funciones) vive en la base de datos y en las Edge Functions; esto solo guía a la persona.
export const LONGITUD_MINIMA = 8
export const LONGITUD_MAXIMA = 128   // mismo límite que cambiar-password

// Devuelve un texto de error, o null si los datos son válidos.
export function validarCambioPassword({ nueva = '', confirmar = '' } = {}) {
  if (typeof nueva !== 'string' || typeof confirmar !== 'string') return 'Contraseña no válida.'
  if (nueva.length < LONGITUD_MINIMA) return `La contraseña debe tener al menos ${LONGITUD_MINIMA} caracteres.`
  if (nueva.length > LONGITUD_MAXIMA) return `La contraseña no puede tener más de ${LONGITUD_MAXIMA} caracteres.`
  if (nueva !== confirmar) return 'Las contraseñas no coinciden.'
  return null
}

// Traduce lo que devuelve el servidor (o la red) a un texto claro. NUNCA muestra detalles técnicos.
export function mensajeErrorCambioPassword(error) {
  const m = String(error?.message ?? '')
  if (/distinta de la contraseña temporal/i.test(m)) return 'La nueva contraseña debe ser distinta de la contraseña temporal.'
  if (/Token inválido|Falta autenticación|Falta token|JWT|sesi[oó]n/i.test(m)) return 'Tu sesión expiró. Cierra sesión e inicia de nuevo con tu contraseña temporal.'
  if (/suspendida/i.test(m)) return 'Tu clínica está suspendida. No puedes cambiar tu contraseña en este momento.'
  if (/Failed to fetch|NetworkError|network|Load failed|fetch/i.test(m) || (typeof navigator !== 'undefined' && navigator.onLine === false)) return 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.'
  if (/se cambi[oó], pero no se pudo confirmar/i.test(m)) return 'Tu contraseña se cambió, pero no se pudo confirmar. Escribe la misma contraseña nueva e inténtalo otra vez.'
  if (/al menos \d+ caracteres|no es válida/i.test(m)) return m
  return 'No se pudo cambiar la contraseña. Inténtalo de nuevo; si el problema continúa, avisa al administrador.'
}
