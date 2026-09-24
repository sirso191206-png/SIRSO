import { supabase } from '../lib/supabase'

// navigator.userAgent crudo es poco legible — se extrae solo lo
// suficiente para que la persona reconozca "cuál es cuál" sin agregar
// una librería completa de parseo de user agents por algo tan simple.
function descripcionDispositivo() {
  const ua = navigator.userAgent
  const navegador = /Edg\//.test(ua) ? 'Edge'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Navegador desconocido'
  const so = /Windows/.test(ua) ? 'Windows'
    : /Mac OS/.test(ua) ? 'macOS'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad/.test(ua) ? 'iOS'
    : /Linux/.test(ua) ? 'Linux'
    : 'Sistema desconocido'
  return `${navegador} · ${so}`
}

export async function registrarSesion(usuarioId) {
  const { data, error } = await supabase
    .from('sesiones_usuario')
    .insert({ usuario_id: usuarioId, dispositivo: descripcionDispositivo() })
    .select()
    .single()
  if (error) {
    console.error('No se pudo registrar la sesión:', error.message)
    return null
  }
  return data
}

export async function listarMisSesiones() {
  const { data, error } = await supabase
    .from('sesiones_usuario')
    .select('*')
    .is('finalizada_en', null)
    .order('iniciada_en', { ascending: false })
  if (error) throw error
  return data
}

// Solo cierra el REGISTRO de esta sesión — el signOut() real del
// dispositivo actual lo maneja useAuthStore.logout() por separado.
export async function marcarSesionFinalizada(id) {
  const { error } = await supabase
    .from('sesiones_usuario')
    .update({ finalizada_en: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// Esto SÍ revoca de verdad todos los refresh tokens del usuario en
// Supabase Auth (scope 'global') — a diferencia de un botón que solo
// borrara filas de esta tabla sin afectar la sesión real en otros
// dispositivos.
export async function cerrarTodasLasSesiones(usuarioId) {
  const { error: errorSignOut } = await supabase.auth.signOut({ scope: 'global' })
  if (errorSignOut) throw errorSignOut

  const { error: errorFilas } = await supabase
    .from('sesiones_usuario')
    .update({ finalizada_en: new Date().toISOString() })
    .eq('usuario_id', usuarioId)
    .is('finalizada_en', null)
  if (errorFilas) console.error('No se pudieron marcar todas las sesiones como finalizadas:', errorFilas.message)
}
