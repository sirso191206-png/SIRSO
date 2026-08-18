import { supabase } from '../lib/supabase'

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

export async function listarTodasLasClinicas() {
  const { data, error } = await supabase.functions.invoke('admin-listar-clinicas')
  if (error) throw new Error(await extraerMensajeError(error))
  if (data?.error) throw new Error(data.error)
  return data
}

export async function verClinica(clinicaId) {
  const { data, error } = await supabase.functions.invoke('admin-ver-clinica', {
    body: { clinicaId }
  })
  if (error) throw new Error(await extraerMensajeError(error))
  if (data?.error) throw new Error(data.error)
  return data // { clinica, pacientes, usuarios }
}

// Cambia estado / plan / límites de una clínica. Solo super admin.
// `cambios` puede incluir: estado, plan, limiteUsuarios, limitePacientes,
// fechaInicio, fechaVencimiento (solo se envía lo que se quiera cambiar).
export async function actualizarClinica(clinicaId, cambios) {
  const { data, error } = await supabase.functions.invoke('admin-actualizar-clinica', {
    body: { clinicaId, ...cambios }
  })
  if (error) throw new Error(await extraerMensajeError(error))
  if (data?.error) throw new Error(data.error)
  return data // { clinica }
}

// Elimina una clínica por completo: usuarios (cuentas incluidas),
// pacientes y todo lo que cuelga de ellos, Storage, catálogos —
// IRREVERSIBLE. Requiere el nombre exacto de la clínica como
// confirmación (lo valida también el backend, no solo el frontend).
// Elimina una clínica por completo: usuarios (cuentas incluidas),
// pacientes y todo lo que cuelga de ellos, Storage, catálogos —
// IRREVERSIBLE. Requiere el nombre exacto de la clínica como
// confirmación (lo valida también el backend, no solo el frontend).
export async function eliminarClinica(clinicaId, confirmarNombre) {
  const { data, error } = await supabase.functions.invoke('admin-eliminar-clinica', {
    body: { clinicaId, confirmarNombre }
  })
  if (error) throw new Error(await extraerMensajeError(error))
  if (data?.error) throw new Error(data.error)
  return data // { ok, advertencias }
}

// Crea una clínica nueva y su usuario dueño (owner). Solo super admin.
// Devuelve { clinica, correo, passwordTemporal } — la contraseña temporal
// se le entrega al dueño para su primer inicio de sesión.
export async function crearClinicaConOwner({ nombreClinica, ownerNombre, ownerCorreo }) {
  const { data, error } = await supabase.functions.invoke('admin-crear-clinica', {
    body: { nombreClinica, ownerNombre, ownerCorreo }
  })
  if (error) throw new Error(await extraerMensajeError(error))
  if (data?.error) throw new Error(data.error)
  return data
}
