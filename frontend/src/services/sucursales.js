import { supabase } from '../lib/supabase'

// Mismo patrón que listarUsuarios()/listarPacientes(): sin clinicaId
// como parámetro — RLS (sucursales_select) ya restringe a la propia
// clínica y, para roles distintos de owner, a las sucursales
// asignadas. No se duplica ese filtro aquí.

// ---------- Sucursales ----------

export async function listarSucursales() {
  const { data, error } = await supabase
    .from('sucursales')
    .select('*')
    .order('creado_en')
  if (error) throw error
  return data
}

// Mismo patrón que crearPaciente(paciente): el llamador ya incluye
// clinica_id en el objeto (típicamente perfil.clinica_id) — RLS
// (sucursales_write) valida que coincida con la clínica real del
// usuario, no se "adivina" aquí.
export async function crearSucursal(sucursal) {
  const { data, error } = await supabase
    .from('sucursales')
    .insert(sucursal)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function actualizarSucursal(sucursalId, cambios) {
  const { data, error } = await supabase
    .from('sucursales')
    .update(cambios)
    .eq('id', sucursalId)
    .select()
    .single()
  if (error) throw error
  return data
}

// No se borra físicamente — se desactiva, mismo criterio que el resto
// de SIRO con clínicas/usuarios (conserva el historial de citas/pagos
// que ya la referencian).
export async function desactivarSucursal(sucursalId) {
  return actualizarSucursal(sucursalId, { activa: false })
}

export async function reactivarSucursal(sucursalId) {
  return actualizarSucursal(sucursalId, { activa: true })
}

// ---------- Consultorios ----------

export async function listarConsultorios(sucursalId) {
  const { data, error } = await supabase
    .from('consultorios')
    .select('*')
    .eq('sucursal_id', sucursalId)
    .order('creado_en')
  if (error) throw error
  return data
}

export async function crearConsultorio(sucursalId, nombre) {
  const { data, error } = await supabase
    .from('consultorios')
    .insert({ sucursal_id: sucursalId, nombre })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function desactivarConsultorio(consultorioId) {
  const { data, error } = await supabase
    .from('consultorios')
    .update({ activo: false })
    .eq('id', consultorioId)
    .select()
    .single()
  if (error) throw error
  return data
}

// ---------- Sillones ----------

export async function listarSillones(consultorioId) {
  const { data, error } = await supabase
    .from('sillones')
    .select('*')
    .eq('consultorio_id', consultorioId)
    .order('creado_en')
  if (error) throw error
  return data
}

export async function crearSillon(consultorioId, nombre) {
  const { data, error } = await supabase
    .from('sillones')
    .insert({ consultorio_id: consultorioId, nombre })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function desactivarSillon(sillonId) {
  const { data, error } = await supabase
    .from('sillones')
    .update({ activo: false })
    .eq('id', sillonId)
    .select()
    .single()
  if (error) throw error
  return data
}

// ---------- Asignación de usuarios a sucursales ----------

export async function listarUsuariosDeSucursal(sucursalId) {
  const { data, error } = await supabase
    .from('sucursal_usuarios')
    .select('id, activo, usuario:usuarios(id, nombre, rol)')
    .eq('sucursal_id', sucursalId)
  if (error) throw error
  return data
}

export async function asignarUsuarioASucursal(sucursalId, usuarioId) {
  const { data, error } = await supabase
    .from('sucursal_usuarios')
    .insert({ sucursal_id: sucursalId, usuario_id: usuarioId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function quitarUsuarioDeSucursal(sucursalUsuarioId) {
  const { error } = await supabase
    .from('sucursal_usuarios')
    .delete()
    .eq('id', sucursalUsuarioId)
  if (error) throw error
}
