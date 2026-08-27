import { supabase, invocarFuncionAutenticada } from '../lib/supabase'

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

// Llama a la Edge Function `crear-usuario` con el access_token vigente
// de la sesión adjunto explícitamente — ver invocarFuncionAutenticada
// en lib/supabase.js.
export async function crearUsuario({ correo, nombre, rol, nombreClinica }) {
  return invocarFuncionAutenticada('crear-usuario', {
    body: { correo, nombre, rol, nombreClinica }
  }) // { correo, passwordTemporal }
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
  return invocarFuncionAutenticada('eliminar-usuario', {
    body: { usuarioId }
  })
}
