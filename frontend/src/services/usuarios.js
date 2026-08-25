import { supabase } from '../lib/supabase'

// Cuando una Edge Function responde con un status distinto de 2xx,
// supabase-js solo da un error genérico ("non-2xx status code") — el
// mensaje real que mandó la función viene en el cuerpo de la respuesta,
// hay que leerlo aparte de `error.context`.
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

export async function listarUsuarios() {
  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .order('nombre')
  if (error) throw error
  return data
}

export async function listarDentistas() {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nombre')
    .eq('rol', 'dentista')
    .eq('activo', true)
    .order('nombre')
  if (error) throw error
  return data
}

// Llama a la Edge Function `crear-usuario` — el cliente de supabase-js
// adjunta automáticamente el JWT de la sesión activa como Authorization.
export async function crearUsuario({ correo, nombre, rol, nombreClinica }) {
  const { data, error } = await supabase.functions.invoke('crear-usuario', {
    body: { correo, nombre, rol, nombreClinica }
  })
  if (error) throw new Error(await extraerMensajeError(error))
  if (data?.error) throw new Error(data.error)
  return data // { correo, passwordTemporal }
}

export async function cambiarActivoUsuario(id, activo) {
  const { data, error } = await supabase
    .from('usuarios')
    .update({ activo })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Edición de perfil — no incluye el correo: cambiarlo requeriría también
// actualizar el correo en Supabase Auth (auth.admin.updateUserById), que
// es un flujo aparte todavía no implementado. Por ahora el correo solo
// se define al crear el usuario.
// usuarios.curp existe como columna pero esta función no la lee ni
// escribe — la interfaz actual no la usa.
export async function actualizarUsuario(id, { nombre, rol, cedulaProfesional, rfc, escuelaProcedencia }) {
  const { data, error } = await supabase
    .from('usuarios')
    .update({
      nombre,
      rol,
      cedula_profesional: cedulaProfesional || null,
      rfc: rfc || null,
      escuela_procedencia: escuelaProcedencia || null
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Autoedición del propio perfil profesional — a propósito NO toca
// rol/clinica_id/es_super_admin/activo (ni los recibe como parámetro):
// la policy usuarios_update_self de Supabase exige que esos campos
// queden exactamente igual, así que ni se intenta mandarlos.
export async function actualizarMiPerfilProfesional(id, { nombre, rfc, cedulaProfesional, escuelaProcedencia }) {
  const { data, error } = await supabase
    .from('usuarios')
    .update({
      nombre,
      rfc: rfc || null,
      cedula_profesional: cedulaProfesional || null,
      escuela_procedencia: escuelaProcedencia || null
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function eliminarUsuario(usuarioId) {
  const { data, error } = await supabase.functions.invoke('eliminar-usuario', {
    body: { usuarioId }
  })
  if (error) throw new Error(await extraerMensajeError(error))
  if (data?.error) throw new Error(data.error)
  return data
}
