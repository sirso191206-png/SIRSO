import { supabase, invocarFuncionAutenticada } from '../lib/supabase'
import { conCacheDeLectura } from '../lib/cacheLectura'
import { nombreParaSelector } from '../lib/profesionales'

// Columnas de `usuarios` que cualquier miembro de la clínica puede leer. CURP, RFC y firma NO están aquí: la base solo las
// entrega por funciones con su propia regla (migración 121) — pedirlas en un select responde «permission denied».
export const COLUMNAS_USUARIO = 'id, clinica_id, nombre, correo, rol, activo, creado_en, ultimo_acceso, es_super_admin, cedula_profesional, escuela_procedencia, ejerce_como_dentista, debe_cambiar_password'

// La propia CURP, RFC y firma (cualquier usuario, solo lo suyo).
// Mientras una base todavía no tenga la migración 121 (la función no existe: PGRST202), se leen como antes, de la tabla.
const funcionNoExiste = (error) => error?.code === 'PGRST202' || /could not find the function/i.test(error?.message ?? '')

export async function obtenerMiPerfilPrivado(userId) {
  const { data, error } = await supabase.rpc('mi_perfil_privado')
  if (error && funcionNoExiste(error) && userId) {
    const anterior = await supabase.from('usuarios').select('curp, rfc, firma_png').eq('id', userId).maybeSingle()
    if (anterior.error) throw anterior.error
    return anterior.data ?? { curp: null, rfc: null, firma_png: null }
  }
  if (error) throw error
  return (Array.isArray(data) ? data[0] : data) ?? { curp: null, rfc: null, firma_png: null }
}

export async function listarUsuarios() {
  const { data, error } = await supabase
    .from('usuarios')
    .select(COLUMNAS_USUARIO)
    .order('nombre')
  if (error) throw error
  // RFC y CURP del equipo: solo el propietario los recibe (los administra aquí). Para otros roles la función no devuelve
  // filas y la lista queda sin esos datos.
  let { data: privados, error: errorPrivados } = await supabase.rpc('datos_privados_equipo')
  if (errorPrivados && funcionNoExiste(errorPrivados)) {
    privados = (await supabase.from('usuarios').select('id, curp, rfc')).data
  }
  const porId = new Map((privados ?? []).map((p) => [p.id, p]))
  return data.map((u) => ({ ...u, rfc: porId.get(u.id)?.rfc ?? null, curp: porId.get(u.id)?.curp ?? null }))
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
    .select(COLUMNAS_USUARIO)
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
    .select(COLUMNAS_USUARIO)
    .single()
  if (error) throw error
  return { ...data, rfc: rfc || null }
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
    .select(COLUMNAS_USUARIO)
    .single()
  if (error) throw error
  return { ...data, rfc: cambios.rfc, firma_png: cambios.firma_png }
}

export async function eliminarUsuario(usuarioId) {
  return invocarFuncionAutenticada('eliminar-usuario', {
    body: { usuarioId }
  })
}
