import { invocarFuncionAutenticada } from '../lib/supabase'

// Todas las llamadas de esta pantalla usan invocarFuncionAutenticada
// (lib/supabase.js) — adjunta explícitamente el access_token vigente
// de la sesión y reintenta una sola vez si el error parece de
// autenticación (p. ej. el token estaba a punto de vencer).

export async function listarTodasLasClinicas() {
  return invocarFuncionAutenticada('admin-listar-clinicas')
}

export async function verClinica(clinicaId) {
  return invocarFuncionAutenticada('admin-ver-clinica', {
    body: { clinicaId }
  }) // { clinica, pacientes, usuarios }
}

// Cambia estado y fechas de una clínica. Solo super admin.
// `cambios` puede incluir: estado, fechaInicio, fechaVencimiento (solo se envía
// lo que se quiera cambiar). El PLAN y los LÍMITES ya no se cambian por aquí
// (la función lo rechaza): usa asignarPlanClinica / ajustarCondicionesClinica
// de services/planes.js, que trabajan sobre la suscripción de la clínica.
export async function actualizarClinica(clinicaId, cambios) {
  return invocarFuncionAutenticada('admin-actualizar-clinica', {
    body: { clinicaId, ...cambios }
  }) // { clinica }
}

// Elimina una clínica por completo: usuarios (cuentas incluidas),
// pacientes y todo lo que cuelga de ellos, Storage, catálogos —
// IRREVERSIBLE. Requiere el nombre exacto de la clínica como
// confirmación (lo valida también el backend, no solo el frontend).
export async function eliminarClinica(clinicaId, confirmarNombre) {
  return invocarFuncionAutenticada('admin-eliminar-clinica', {
    body: { clinicaId, confirmarNombre }
  }) // { ok, advertencias }
}

// Crea una clínica nueva, su suscripción (con el snapshot del plan elegido) y su
// usuario dueño (owner). Solo super admin. `planCodigo`/`modalidad` salen del
// selector de planes (base de datos); `precioContratado` es opcional para
// convenios a la medida.
// Devuelve { clinica, correo, passwordTemporal, suscripcion } — la contraseña
// temporal se le entrega al dueño para su primer inicio de sesión.
export async function crearClinicaConOwner({ nombreClinica, ownerNombre, ownerCorreo, planCodigo, modalidad, precioContratado, fechaFin, autoRenovacion }) {
  return invocarFuncionAutenticada('admin-crear-clinica', {
    body: { nombreClinica, ownerNombre, ownerCorreo, planCodigo, modalidad, precioContratado, fechaFin, autoRenovacion }
  })
}
