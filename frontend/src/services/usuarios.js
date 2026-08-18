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
export async function actualizarUsuario(id, { nombre, rol, cedulaProfesional, curp, primerApellido, segundoApellido, tipoPersonalSis }) {
  const { data, error } = await supabase
    .from('usuarios')
    .update({
      nombre,
      rol,
      cedula_profesional: cedulaProfesional || null,
      curp: curp || null,
      primer_apellido: primerApellido || null,
      segundo_apellido: segundoApellido || null,
      tipo_personal_sis: tipoPersonalSis || null
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
