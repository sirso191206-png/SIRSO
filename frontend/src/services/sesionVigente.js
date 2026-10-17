import { supabase } from '../lib/supabase'

// ¿El cliente conserva una sesión? Sirve para distinguir "no hay sesión" de "no existe / no tengo acceso" cuando el servidor
// responde igual (0 filas). Si no se puede comprobar, se asume que sí (no se acusa a la sesión sin evidencia).
export async function haySesionVigente() {
  try {
    const { data } = await supabase.auth.getSession()
    return Boolean(data?.session)
  } catch {
    return true
  }
}
