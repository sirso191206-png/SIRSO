// Guía de primeros pasos para el PROPIETARIO de una clínica nueva. Cada paso se marca como hecho a partir de datos
// REALES de la clínica (no de lo que la persona diga): si borra el logo, el paso vuelve a estar pendiente. No se
// ofrecen pasos de funciones que SIRO no tiene (p. ej. no hay "horarios de atención": no se lista).
const lleno = (v) => typeof v === 'string' && v.trim().length > 0

// entrada: { clinica, perfil, totales: { pacientes, citas, usuarios }, puedeAgregarUsuarios, incluyeAgenda }
export function calcularPasos({ clinica, perfil, totales = {}, puedeAgregarUsuarios = true, incluyeAgenda = true } = {}) {
  const pasos = [
    {
      id: 'datos_clinica', titulo: 'Completa los datos de tu clínica',
      descripcion: 'El domicilio y el teléfono salen en tus recetas y recibos.',
      hecho: lleno(clinica?.direccion) && lleno(clinica?.telefono), ruta: '/configuracion', accion: 'Ir a Configuración'
    },
    {
      id: 'logo', titulo: 'Sube el logo de tu clínica',
      descripcion: 'Aparece en las recetas nuevas.', hecho: lleno(clinica?.logo_url), ruta: '/configuracion', accion: 'Ir a Configuración'
    },
    {
      id: 'datos_profesionales', titulo: 'Captura tu cédula profesional y tu firma',
      descripcion: 'Salen en tus recetas. Abre el menú de tu nombre (abajo a la izquierda) y elige "Datos profesionales".',
      hecho: lleno(perfil?.cedula_profesional) && !!perfil?.firma_png, ruta: null, accion: null
    },
    puedeAgregarUsuarios && {
      id: 'usuarios', titulo: 'Agrega a tu equipo',
      descripcion: 'Dentistas, recepción o asistentes, según lo que permita tu plan.',
      hecho: Number(totales.usuarios ?? 0) > 1, ruta: '/usuarios', accion: 'Ir a Usuarios'
    },
    {
      id: 'paciente', titulo: 'Registra tu primer paciente',
      descripcion: 'Desde Pacientes, con el botón "Nuevo paciente".', hecho: Number(totales.pacientes ?? 0) > 0, ruta: '/pacientes', accion: 'Ir a Pacientes'
    },
    incluyeAgenda && {
      id: 'cita', titulo: 'Agenda tu primera cita',
      descripcion: 'Desde la Agenda, con el botón "Nueva cita".', hecho: Number(totales.citas ?? 0) > 0, ruta: '/agenda', accion: 'Ir a la Agenda'
    }
  ]
  return pasos.filter(Boolean)
}

export function progresoOnboarding(pasos) {
  const hechos = pasos.filter((p) => p.hecho).length
  const total = pasos.length
  return { hechos, total, porcentaje: total === 0 ? 100 : Math.round((hechos * 100) / total), completo: total > 0 && hechos === total }
}

export const claveOnboardingOculto = (usuarioId) => `siro:onboarding-oculto:${usuarioId}`

// Solo el PROPIETARIO de una clínica ve la guía (el personal de plataforma, el dentista, la recepción y los asistentes no).
export function puedeVerOnboarding(perfil) {
  return perfil?.rol === 'owner' && !perfil?.es_super_admin
}
