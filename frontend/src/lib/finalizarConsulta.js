import { esErrorDeRed, esErrorDeServidor } from './errorDeRed'

// Códigos que devuelve fn_finalizar_consulta (migración 088, que reemplaza a la 085) en el HINT del error. El MENSAJE que acompaña a cada uno ya
// está escrito para la persona, en español, y es el que se muestra tal cual.
export const CODIGOS_FINALIZAR = [
  'SESION_INVALIDA', 'SESION_CERRADA', 'ROL_NO_PERMITIDO', 'CITA_NO_ENCONTRADA', 'SUCURSAL_NO_PERMITIDA', 'PACIENTE_NO_ASIGNADO',
  'CITA_DE_OTRO_DENTISTA', 'FUNCIONALIDAD_NO_INCLUIDA', 'ESTADO_INVALIDO', 'CONFLICTO_CONCURRENCIA', 'EXPEDIENTE_NO_ENCONTRADO',
  'SEGUIMIENTO_INVALIDO', 'HORARIO_OCUPADO',
  // 088: los reintentos se VERIFICAN. Un id que existe con otros datos, o una cita completada sin todos los efectos pedidos, se informa.
  'NOTA_CONFLICTO', 'SEGUIMIENTO_CONFLICTO', 'CONSULTA_CON_DATOS_DISTINTOS', 'FINALIZACION_INCOMPLETA', 'ID_REQUERIDO_PARA_REINTENTO',
  'NOTA_NO_CONFIRMADA', 'SEGUIMIENTO_NO_CONFIRMADO',
  // 090: completar una consulta que ya estaba completada sin nota
  'NADA_QUE_COMPLETAR', 'CITA_NO_COMPLETADA', 'CONSULTA_YA_TIENE_NOTA', 'COMPLETAR_SOLO_VIA_CONSULTA',
  // 091–093: integridad de autoría, de referencias entre clínicas y límite (opcional) de retrofecha de la nota
  'NOTA_CITA_INCOHERENTE', 'NOTA_AUTOR_INCOHERENTE', 'CITA_DENTISTA_INCOHERENTE', 'CITA_SILLON_INCOHERENTE', 'NOTA_FECHA_FUERA_DE_LIMITE'
]

// Rechazos DEFINITIVOS: repetirlos no los arregla (hace falta que alguien cambie algo: asignar al paciente, ampliar el plan,
// elegir otro horario…). Al sincronizar la cola offline no se reintentan solos como si fueran una caída de red: se conservan
// como conflicto para que la persona los resuelva. SESION_* no están aquí: se resuelven volviendo a iniciar sesión.
// CONFLICTO_CONCURRENCIA tampoco: la cola ya tiene su propio manejo.
export const CODIGOS_DEFINITIVOS = [
  'ROL_NO_PERMITIDO', 'CITA_NO_ENCONTRADA', 'SUCURSAL_NO_PERMITIDA', 'PACIENTE_NO_ASIGNADO', 'CITA_DE_OTRO_DENTISTA',
  'FUNCIONALIDAD_NO_INCLUIDA', 'ESTADO_INVALIDO', 'EXPEDIENTE_NO_ENCONTRADO', 'SEGUIMIENTO_INVALIDO', 'HORARIO_OCUPADO',
  'NOTA_CONFLICTO', 'SEGUIMIENTO_CONFLICTO', 'CONSULTA_CON_DATOS_DISTINTOS', 'FINALIZACION_INCOMPLETA', 'ID_REQUERIDO_PARA_REINTENTO',
  'NOTA_NO_CONFIRMADA', 'SEGUIMIENTO_NO_CONFIRMADO', 'NADA_QUE_COMPLETAR', 'CITA_NO_COMPLETADA', 'CONSULTA_YA_TIENE_NOTA', 'COMPLETAR_SOLO_VIA_CONSULTA',
  'NOTA_CITA_INCOHERENTE', 'NOTA_AUTOR_INCOHERENTE', 'CITA_DENTISTA_INCOHERENTE', 'CITA_SILLON_INCOHERENTE', 'NOTA_FECHA_FUERA_DE_LIMITE'
]

export const esRechazoDefinitivo = (error) => CODIGOS_DEFINITIVOS.includes(error?.codigo)

// Texto para la persona. Nunca el mensaje técnico del servidor ni nada clínico.
export function mensajeErrorFinalizar(error) {
  if (CODIGOS_FINALIZAR.includes(error?.codigo) && error.codigo !== 'CONFLICTO_CONCURRENCIA') return error.message
  if (error?.codigo === 'CONFLICTO_CONCURRENCIA' || error?.message === 'CONFLICTO_CONCURRENCIA') {
    return 'La cita cambió mientras la atendías (otra persona la modificó). Recarga la consulta y vuelve a intentarlo.'
  }
  if (esErrorDeRed(error)) return 'No se pudo finalizar la consulta: no hay conexión o el servidor tardó demasiado. Tus datos siguen en pantalla; intenta de nuevo.'
  if (esErrorDeServidor(error)) return 'El servidor no está disponible en este momento. Tus datos siguen en pantalla; intenta de nuevo en unos segundos.'
  return 'No se pudo finalizar la consulta. Tus datos siguen en pantalla; intenta de nuevo y, si continúa, avisa al administrador.'
}

// Lo que se registra para diagnosticar: códigos e identificadores técnicos, NUNCA contenido clínico (nota, motivo, diagnóstico).
export function datosDeDiagnostico(errorDelServidor, citaId) {
  return { codigo: errorDelServidor?.hint || null, sqlstate: errorDelServidor?.code || null, cita: citaId ?? null, estado: errorDelServidor?.status ?? null }
}
