import { LIMITES_ARCHIVOS } from './limitesArchivos'

// Centro de ayuda: guías cortas sobre lo que SIRO hace HOY. Reglas de este archivo:
//  * Solo funciones que existen (nada de WhatsApp, inventario ni horarios de atención).
//  * Los nombres de botones y pestañas son los de la pantalla.
//  * Una guía con `funcionalidad` solo se muestra si el plan la incluye; con `roles`, solo a esos roles.
//  * Sin precios ni nombres de planes (salen de la base): se habla de "tu plan".
const MB = 1024 * 1024
const f = (b) => LIMITES_ARCHIVOS[b]

export const CATEGORIAS_AYUDA = ['Primeros pasos', 'Atención clínica', 'Cobros', 'Administración', 'Sin conexión y seguridad', 'Solución de problemas']

export const GUIAS_AYUDA = [
  {
    id: 'crear-paciente', categoria: 'Primeros pasos', titulo: 'Registrar un paciente',
    resumen: 'Cómo dar de alta a un paciente nuevo.',
    pasos: ['En el menú elige Pacientes (o usa "Nuevo paciente" en Mi día).', 'Pulsa "Nuevo paciente".', 'Escribe el nombre. El teléfono, el correo y el CURP son opcionales.',
      'Si el CURP ya está registrado en tu clínica, SIRO te lo avisa y no crea un duplicado.', 'Guarda: se abre la ficha del paciente.',
      'También puedes registrarlo sin conexión: se sube solo cuando vuelva Internet.']
  },
  {
    id: 'expediente', categoria: 'Primeros pasos', titulo: 'La ficha y el expediente del paciente',
    resumen: 'Dónde está cada cosa dentro de un paciente.', roles: ['owner', 'dentista', 'asistente', 'recepcion'],
    pasos: ['Abre un paciente desde Pacientes.', 'La ficha tiene pestañas: Resumen, Datos generales, Historial, Odontograma, Plan, Documentos clínicos y Archivos.',
      'Las pestañas que ves dependen de tu rol y del plan de tu clínica: recepción, por ejemplo, ve Datos generales y Plan, pero no el historial clínico.',
      'Todo lo que capturas queda guardado en el expediente y lo puedes consultar después.']
  },
  {
    id: 'odontograma', categoria: 'Atención clínica', titulo: 'Odontograma', funcionalidad: 'odontograma_2d', roles: ['owner', 'dentista'],
    resumen: 'Registrar el estado de cada pieza dental.',
    pasos: ['Abre al paciente y entra a la pestaña Odontograma.', 'Elige la vista que prefieras entre las que incluye tu plan (clínica 2D, anatómica 3D, periodontograma u hoja clínica).',
      'Toca una pieza para registrar o cambiar su estado: se guarda al momento.', 'Si tu plan no incluye la vista 3D, SIRO usa la 2D automáticamente.',
      'Funciona sin conexión: los cambios se suben solos al volver Internet.']
  },
  {
    id: 'periodontograma', categoria: 'Atención clínica', titulo: 'Periodontograma', funcionalidad: 'periodontograma', roles: ['owner', 'dentista'],
    resumen: 'Sondaje, recesión, sangrado, movilidad y furca por pieza.',
    pasos: ['Dentro de la pestaña Odontograma, elige la vista "Periodontograma".', 'Selecciona una pieza y captura los valores de sus sitios.', 'Los cambios se guardan al momento y quedan en el historial de la pieza.',
      'Si dos personas editan la misma pieza a la vez, SIRO te avisa en vez de pisar el trabajo de la otra.']
  },
  {
    id: 'agenda', categoria: 'Atención clínica', titulo: 'Agenda y citas', funcionalidad: 'agenda',
    resumen: 'Crear, ver y gestionar citas.',
    pasos: ['Entra a Agenda y cambia entre las vistas Día, Semana y Mes.', 'Pulsa "Nueva cita", elige paciente, odontólogo, fecha y hora (según tu plan y tu rol).',
      'Para una emergencia usa "Nueva urgencia"; para quien espera un hueco, "Lista de espera".', 'Toca una cita para confirmarla, cambiar su estado, reprogramarla o cancelarla.']
  },
  {
    id: 'consulta', categoria: 'Atención clínica', titulo: 'Atender una consulta', roles: ['owner', 'dentista', 'asistente'],
    resumen: 'Del inicio al cierre de la consulta.',
    pasos: ['En Mi día o en la Agenda, pulsa "Iniciar consulta" sobre la cita del paciente.', 'Captura el motivo y lo que tu plan permita en esa pantalla: signos vitales, hallazgos, diagnóstico, odontograma, tratamiento, nota, próxima cita y receta.',
      'Al terminar, cierra la consulta. La nota clínica es opcional: la consulta se puede cerrar sin ella.', 'Lo capturado queda en el expediente del paciente.']
  },
  {
    id: 'recetas', categoria: 'Atención clínica', titulo: 'Recetas', funcionalidad: 'recetas', roles: ['owner', 'dentista'],
    resumen: 'Crear, firmar e imprimir recetas.',
    pasos: ['Abre al paciente → pestaña "Documentos clínicos" → Recetas.', 'Pulsa "Nueva receta" y captura los medicamentos.', 'La receta usa el logo de tu clínica y tu cédula y firma (menú de tu nombre → "Datos profesionales").',
      'Puedes imprimirla o descargarla, y consultar las anteriores en el historial.']
  },
  {
    id: 'consentimientos', categoria: 'Atención clínica', titulo: 'Consentimientos informados', funcionalidad: 'consentimientos', roles: ['owner', 'dentista'],
    resumen: 'Crear y firmar consentimientos.',
    pasos: ['Abre al paciente → pestaña "Documentos clínicos" → Consentimientos.', 'Pulsa "Nuevo consentimiento" y elige el procedimiento.', 'El paciente firma en pantalla; el documento queda ligado a su expediente.', 'Los consentimientos anteriores se consultan e imprimen desde la misma pestaña.']
  },
  {
    id: 'archivos', categoria: 'Atención clínica', titulo: 'Fotografías y documentos', funcionalidad: ['fotografias', 'documentos'], roles: ['owner', 'dentista'],
    resumen: 'Subir fotos y estudios al expediente.',
    pasos: ['Abre al paciente → pestaña Archivos.', `Fotografías: ${f('fotos-clinicas').formatos}, hasta ${f('fotos-clinicas').maxBytes / MB} MB cada una.`, `Documentos: ${f('documentos-clinicos').formatos}, hasta ${f('documentos-clinicos').maxBytes / MB} MB cada uno.`,
      'Los archivos son privados: solo los ve quien tiene acceso a ese paciente.', 'Tu plan puede tener un límite de almacenamiento; lo ves en Configuración → Plan actual.']
  },
  {
    id: 'pagos', categoria: 'Cobros', titulo: 'Registrar y corregir pagos', funcionalidad: 'pagos', roles: ['owner', 'dentista', 'recepcion', 'asistente'],
    resumen: 'Anticipos, pagos, saldo y anulaciones.',
    pasos: ['Abre al paciente → pestaña Plan.', 'Pulsa "Registrar pago", indica el monto y el método.', 'El saldo pendiente se calcula solo: tratamientos menos pagos. Si pagó de más, aparece como saldo a favor.',
      'Un pago mal capturado no se borra: se anula (queda el registro) o se corrige.', 'Los pagos anulados no cuentan en el saldo ni en los ingresos.']
  },
  {
    id: 'corte-caja', categoria: 'Cobros', titulo: 'Corte de caja', funcionalidad: 'caja', roles: ['owner', 'recepcion'],
    resumen: 'Cobros de un periodo, por método y sucursal.',
    pasos: ['Entra a Corte de caja.', 'Elige el periodo (y la sucursal, si tu plan las incluye) y pulsa Buscar.', 'Verás los totales por método de pago y cada movimiento.', 'Puedes imprimirlo. Los pagos anulados aparecen tachados y no suman.']
  },
  {
    id: 'usuarios', categoria: 'Administración', titulo: 'Usuarios de tu clínica', roles: ['owner'],
    resumen: 'Agregar y administrar a tu equipo.',
    pasos: ['Entra a Usuarios y pulsa "Nuevo usuario".', 'Elige el rol: dentista, recepción o asistente. Cada persona recibe una contraseña temporal que cambia al entrar.',
      'Tu plan define cuántos usuarios puedes tener. Al llegar al límite el botón desaparece y se te explica por qué.', 'Solo el equipo de SIRO da de alta clínicas nuevas: un propietario no puede crear otra clínica.']
  },
  {
    id: 'plan-limites', categoria: 'Administración', titulo: 'Tu plan, límites y vencimiento', roles: ['owner'],
    resumen: 'Qué incluye tu plan y cuánto llevas usado.',
    pasos: ['Entra a Configuración: arriba verás tu plan actual, lo que incluye y barras de uso (pacientes, usuarios, sucursales y almacenamiento).',
      'Si pasas el límite NO se borra nada: puedes seguir consultando tus registros, pero no dar de alta más hasta mejorar el plan.', 'Si tu suscripción vence, verás un aviso con la fecha límite para renovar; tu información se conserva.',
      'Para cambiar de plan, usa "Mejorar plan" o contacta a SIRO.']
  },
  {
    id: 'reportes', categoria: 'Administración', titulo: 'Reportes del dashboard', funcionalidad: 'estadisticas', roles: ['owner'],
    resumen: 'Ingresos, citas, tratamientos y pacientes nuevos.',
    pasos: ['Entra a Reportes.', 'Usa los filtros: período (6 meses, 12 meses, año actual o un rango de hasta 24 meses), semanas, odontólogo, sucursal y el estado de los tratamientos.',
      'El filtro de odontólogo no aplica a ingresos (los cobra recepción) y el de sucursal no aplica a pacientes nuevos.', 'Si tu plan incluye reportes, cada gráfica tiene un botón CSV para exportarla; la exportación queda registrada en la auditoría.']
  },
  {
    id: 'auditoria', categoria: 'Administración', titulo: 'Auditoría', funcionalidad: 'auditoria', roles: ['owner'],
    resumen: 'Quién hizo qué y cuándo en tu clínica.',
    pasos: ['Entra a Auditoría.', 'Filtra por fechas, usuario, módulo y tipo de acción.', 'Cada fila muestra fecha y hora, quién, qué acción, en qué módulo y un identificador corto del registro.',
      'Solo ves lo de tu clínica, y nadie puede modificar ni borrar la bitácora.']
  },
  {
    id: 'sin-conexion', categoria: 'Sin conexión y seguridad', titulo: 'Trabajar sin Internet',
    resumen: 'Qué pasa cuando se va la conexión.',
    pasos: ['SIRO prepara solo, con conexión, lo de tu día: citas y datos de los pacientes de hoy. No tienes que hacer nada.',
      'Si se va el Internet puedes seguir consultando y capturando; arriba aparece un aviso y los cambios quedan pendientes en este dispositivo.', 'Al volver la conexión se suben solos.',
      'Si un cambio no se puede aceptar (por ejemplo, el plan ya no permite más pacientes o un CURP ya existe) queda como conflicto: no se pierde y puedes revisarlo en el aviso.',
      'Para que esto funcione, abre SIRO con conexión al menos una vez al día.']
  },
  {
    id: 'seguridad', categoria: 'Sin conexión y seguridad', titulo: 'Contraseña y sesiones',
    resumen: 'Cuidar tu cuenta y tus dispositivos.',
    pasos: ['Abre el menú de tu nombre (abajo a la izquierda) → Seguridad.', 'Ahí cambias tu contraseña y ves los dispositivos donde tienes sesión abierta.',
      'Con "Cerrar esta sesión" cierras de verdad la de otro dispositivo; también puedes cerrar todas.', 'Tu plan limita cuántos dispositivos pueden estar abiertos a la vez: si abres uno nuevo, el más antiguo se cierra.',
      'Si olvidaste tu contraseña, usa "¿Olvidaste tu contraseña?" en la pantalla de inicio de sesión.']
  },
  {
    id: 'p-sin-conexion', categoria: 'Solución de problemas', titulo: 'Dice que no hay conexión',
    resumen: 'El aviso de arriba.', pasos: ['Revisa tu Internet. Mientras tanto puedes seguir trabajando.', 'Tus cambios quedan pendientes en este dispositivo y se suben solos al volver la conexión.', 'No cierres sesión con cambios pendientes: SIRO te lo advertirá.']
  },
  {
    id: 'p-limite', categoria: 'Solución de problemas', titulo: '"Has alcanzado el límite de tu plan"',
    resumen: 'No puedo agregar pacientes, usuarios o sucursales.', pasos: ['Tu plan tiene un tope para eso y ya lo alcanzaste.', 'Tus datos están a salvo: puedes seguir consultándolos.', 'Para dar de alta más, mejora tu plan desde Configuración → "Mejorar plan".']
  },
  {
    id: 'p-no-incluida', categoria: 'Solución de problemas', titulo: '"Esta funcionalidad no está disponible en tu plan"',
    resumen: 'Una pantalla o un botón no aparece.', pasos: ['Tu plan no incluye esa función, o tu rol no la usa.', 'Si crees que debería estar, pregunta al propietario de tu clínica o contacta a SIRO.']
  },
  {
    id: 'p-curp', categoria: 'Solución de problemas', titulo: '"El CURP ya está registrado en esta clínica"',
    resumen: 'No se pudo guardar un paciente.', pasos: ['Ya existe un paciente con ese CURP en tu clínica: revísalo antes de continuar.', 'Si es la misma persona, SIRO une la información. Si es otra, corrige el CURP.', 'Si lo capturaste sin conexión, el cambio queda guardado como conflicto hasta que lo resuelvas.']
  },
  {
    id: 'p-archivo', categoria: 'Solución de problemas', titulo: 'No puedo subir un archivo',
    resumen: 'La foto o el documento no se sube.', pasos: [`Fotos: ${f('fotos-clinicas').formatos}, hasta ${f('fotos-clinicas').maxBytes / MB} MB. Documentos: ${f('documentos-clinicos').formatos}, hasta ${f('documentos-clinicos').maxBytes / MB} MB. Logo: ${f('logos-clinicas').formatos}, hasta ${f('logos-clinicas').maxBytes / MB} MB.`,
      'Si el formato y el tamaño están bien, puede que tu clínica haya llegado al límite de almacenamiento de su plan.']
  },
  {
    id: 'p-sesion', categoria: 'Solución de problemas', titulo: 'Se cerró mi sesión',
    resumen: 'Me pidió iniciar sesión otra vez.', pasos: ['Alguien cerró esa sesión desde otro dispositivo, o abriste más dispositivos de los que permite tu plan.', 'Vuelve a iniciar sesión: tus cambios pendientes se conservan.', 'Si no fuiste tú, cambia tu contraseña en Seguridad.']
  },
  {
    id: 'p-no-veo', categoria: 'Solución de problemas', titulo: 'No veo una sección o un botón',
    resumen: 'Falta algo en el menú.', pasos: ['El menú muestra solo lo que tu rol usa y lo que incluye el plan de tu clínica.', 'Si escribes una dirección a la que no tienes acceso, SIRO te lo indica.', 'Pide al propietario que revise tu rol.']
  }
]

const sinAcentos = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

// ¿Se muestra esta guía a esta persona? `disponible(codigo|codigos)` es el del plan.
export function guiasVisibles(guias, { rol, esSuperAdmin = false, disponible = () => true } = {}) {
  return guias.filter((g) => {
    if (g.roles && !esSuperAdmin && !g.roles.includes(rol)) return false
    if (g.funcionalidad && !esSuperAdmin && !disponible(g.funcionalidad)) return false
    return true
  })
}

export function buscarGuias(guias, texto) {
  const q = sinAcentos(texto).trim()
  if (!q) return guias
  return guias.filter((g) => sinAcentos([g.titulo, g.resumen, ...g.pasos].join(' ')).includes(q))
}
