import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copia .env.example a .env y complétalo.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Cuando una Edge Function responde con un status distinto de 2xx,
// supabase-js solo da un error genérico ("non-2xx status code") — el
// mensaje real que mandó la función viene en el cuerpo de la respuesta,
// hay que leerlo aparte de `error.context`. Un solo lugar para esto —
// antes estaba duplicado en services/usuarios.js y services/admin.js.
async function extraerMensajeError(error) {
  try {
    if (error?.context && typeof error.context.json === 'function') {
      const cuerpo = await error.context.json()
      if (cuerpo?.error) return cuerpo.error
    }
  } catch {
    // si no se pudo leer el cuerpo, cae al mensaje genérico de abajo
  }
  return error?.message ?? 'Ocurrió un error inesperado.'
}

const PATRON_ERROR_DE_AUTENTICACION = /token inválido|falta autenticación|falta token de acceso/i

/**
 * Llama a una Edge Function administrativa/de usuarios, adjuntando
 * EXPLÍCITAMENTE el access_token vigente de la sesión — no se confía
 * en que functions.invoke() lo adjunte solo. Si no hay sesión válida,
 * falla ANTES de llamar a la función, con un mensaje claro.
 *
 * Si la función responde con un error que suena a problema de
 * autenticación (p. ej. el access_token estaba a punto de vencer al
 * momento del primer intento), se refresca la sesión con
 * supabase.auth.refreshSession() y se reintenta UNA sola vez — nunca
 * más de una vez, para no entrar en un bucle si el problema es otro.
 */
export async function invocarFuncionAutenticada(nombreFuncion, opciones = {}) {
  const intentar = async () => {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !session?.access_token) {
      throw new Error('La sesión expiró. Cierra sesión e inicia sesión nuevamente.')
    }
    const { data, error } = await supabase.functions.invoke(nombreFuncion, {
      ...opciones,
      headers: { ...opciones.headers, Authorization: `Bearer ${session.access_token}` }
    })
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    return data
  }

  try {
    return await intentar()
  } catch (primerError) {
    const mensaje = await extraerMensajeError(primerError)
    if (!PATRON_ERROR_DE_AUTENTICACION.test(mensaje)) throw new Error(mensaje)

    await supabase.auth.refreshSession()
    try {
      return await intentar()
    } catch (segundoError) {
      throw new Error(await extraerMensajeError(segundoError))
    }
  }
}
