import { supabase, invocarFuncionAutenticada } from '../lib/supabase'
import { conCacheDeLectura } from '../lib/cacheLectura'
import { nombreParaSelector } from '../lib/profesionales'

export async function listarUsuarios() {
  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .order('nombre')
  if (error) throw error
  return data
}

// Odontólogos activos de la clínica: los dentistas Y los propietarios que ejercen como dentista (marca
// ejerce_como_dentista, migración 084). Un propietario sin la marca NO aparece. El propietario se muestra con
// "(propietario)" para distinguirlo; `rol` viaja por si la pantalla necesita saberlo.
export async function listarDentistas() {
  const { datos } = await conCacheDeLectura('dentistas-activos', async () => {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, nombre, rol')
      .or('rol.eq.dentista,and(rol.eq.owner,ejerce_como_dentista.eq.true)')
      .eq('activo', true)
      .order('nombre')
    if (error) throw error
    return data.map((u) => ({ ...u, nombre: nombreParaSelector(u) }))
  })
  return datos
}

// Llama a la Edge Function `crear-usuario` con el access_token vigente
// de la sesión adjunto explícitamente — ver invocarFuncionAutenticada
// en lib/supabase.js.
// Agrega un usuario a la clínica DEL QUE LLAMA. No crea clínicas ni owners (solo el
// superadmin da de alta una clínica, con su plan, vía admin-crear-clinica).
export async function crearUsuario({ correo, nombre, rol }) {
  return invocarFuncionAutenticada('crear-usuario', {
    body: { correo, nombre, rol }
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
// `ejerceComoDentista` solo lo manda un propietario (undefined = no se toca). La base lo exige: la restricción de la
// migración 084 rechaza la marca en cualquier otro rol.
export async function actualizarMiPerfilProfesional(id, { nombre, rfc, cedulaProfesional, escuelaProcedencia, firmaPng, ejerceComoDentista }) {
  const cambios = {
    nombre,
    rfc: rfc || null,
    cedula_profesional: cedulaProfesional || null,
    escuela_procedencia: escuelaProcedencia || null,
    firma_png: firmaPng || null
  }
  if (typeof ejerceComoDentista === 'boolean') cambios.ejerce_como_dentista = ejerceComoDentista
  const { data, error } = await supabase
    .from('usuarios')
    .update(cambios)
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
