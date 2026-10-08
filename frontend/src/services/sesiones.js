import { supabase } from '../lib/supabase'

// navigator.userAgent crudo es poco legible — se extrae solo lo
// suficiente para que la persona reconozca "cuál es cuál" sin agregar
// una librería completa de parseo de user agents por algo tan simple.
export function describirDispositivo(ua) {
  if (!ua) return 'Dispositivo desconocido'
  const navegador = /Edg\//.test(ua) ? 'Edge'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Navegador desconocido'
  // iPhone/iPad ANTES que Mac OS: su user agent dice "like Mac OS X" y saldría como macOS.
  const so = /Windows/.test(ua) ? 'Windows'
    : /iPhone|iPad/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Mac OS/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : 'Sistema desconocido'
  return `${navegador} · ${so}`
}

function descripcionDispositivo() {
  return describirDispositivo(navigator.userAgent)
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

// Cuántas sesiones simultáneas permite el plan de la clínica — la
// base de datos es quien realmente lo aplica (trigger en
// sesiones_usuario); esto es solo para poder mostrárselo a la persona.
export async function obtenerMiLimiteSesiones() {
  const { data, error } = await supabase.rpc('mi_limite_sesiones')
  if (error) throw error
  return data
}

// ---- Sesiones REALES (migración 078) ----------------------------------------
// Vienen de auth.sessions —la tabla donde Supabase Auth guarda cada sesión—, no de un registro
// que escriba el navegador. Cerrar una de ellas la revoca de verdad (su refresh token deja de
// servir) y, con el interruptor de la base encendido, su token deja de leer y escribir al instante.

// [{ id, creada_en, ultima_actividad, user_agent, es_actual, vigente }]; `vigente` = false
// cuando excede el límite del plan (se cierra sola). Solo las del propio usuario.
export async function listarSesionesReales() {
  const { data, error } = await supabase.rpc('mis_sesiones_activas')
  if (error) throw error
  return data ?? []
}

// Cierra UNA sesión de otro dispositivo (no la de este: para eso está "Cerrar sesión").
export async function cerrarSesionRemota(sesionId) {
  const { error } = await supabase.rpc('cerrar_sesion_remota', { p_sesion_id: sesionId })
  if (error) throw error
}

// { valida, motivo: 'activa' | 'revocada' | 'excedida' | 'no_identificable' | 'no_verificable',
//   limite, activas, estricto }. El dispositivo la consulta para enterarse de que lo cerraron.
export async function obtenerEstadoMiSesion() {
  const { data, error } = await supabase.rpc('mi_sesion_estado')
  if (error) throw error
  return data
}

export function mensajeSesionCerrada(motivo, limite) {
  if (motivo === 'excedida') {
    return `Se inició sesión en otro dispositivo y tu plan permite ${limite ?? 'un número limitado de'} ${limite === 1 ? 'sesión a la vez' : 'sesiones a la vez'}, así que esta se cerró. Tus cambios sin subir se conservan.`
  }
  return 'Tu sesión se cerró desde otro dispositivo. Vuelve a iniciar sesión; tus cambios sin subir se conservan.'
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

// Cuántas sesiones simultáneas permite el plan de la clínica de este
// usuario (o un override específico de esa clínica, si tiene uno).
// null significa sin límite — hoy solo aplica a super_admin.
export async function obtenerLimiteSesiones(usuarioId) {
  const { data, error } = await supabase.rpc('fn_limite_sesiones_de', { p_usuario_id: usuarioId })
  if (error) {
    console.error('No se pudo consultar el límite de sesiones:', error.message)
    return null
  }
  return data
}
