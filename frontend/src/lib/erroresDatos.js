import { esErrorDeRed, esErrorDeServidor } from './errorDeRed'

// Una respuesta de PostgREST NO distingue por qué una fila "no está": una cita que no existe, una que RLS oculta, una que se ve
// pero no se puede actualizar y una petición hecha SIN sesión (supabase-js recurre entonces a la clave anon) dan EXACTAMENTE el
// mismo `406 PGRST116 «The result contains 0 rows»`. Solo un token VENCIDO o malformado se distingue (401 PGRST301). Verificado
// contra un PostgREST real: supabase/tests/postgrest/verificar_postgrest.mjs. Por eso aquí se clasifica con lo que SÍ se sabe
// (el código, el estado HTTP y si el cliente conserva una sesión) y se dice honestamente lo que NO se puede saber.
export const CODIGOS_DATOS = ['SESION_INVALIDA', 'SIN_CONEXION', 'SERVIDOR_NO_DISPONIBLE', 'NO_DISPONIBLE', 'SIN_PERMISO', 'NOTA_CONFLICTO', 'NOTA_NO_VERIFICABLE', 'NOTA_NO_CONFIRMADA', 'COMPLETAR_SOLO_VIA_CONSULTA', 'INTEGRIDAD_DATOS', 'DESCONOCIDO']

export class ErrorDeDatos extends Error {
  constructor(codigo, mensaje, original = null) {
    super(mensaje)
    this.name = 'ErrorDeDatos'
    this.codigo = codigo
    this.original = original
    if (original?.code) this.code = original.code // quien ya leía `.code` (p. ej. '42501') sigue pudiéndolo hacer
  }
}

export const esCeroFilas = (error) => error?.code === 'PGRST116' && /0 rows|no rows/i.test(`${error.details ?? ''} ${error.message ?? ''}`)
export const esErrorDeSesion = (error) => ['PGRST301', 'PGRST302', 'PGRST303'].includes(error?.code) || Number(error?.status) === 401

const TEXTO = {
  SESION_INVALIDA: 'Tu sesión venció o no es válida. Vuelve a iniciar sesión.',
  SIN_CONEXION: 'No hay conexión con el servidor o tardó demasiado en responder.',
  SERVIDOR_NO_DISPONIBLE: 'El servidor no está disponible en este momento. Intenta de nuevo en unos segundos.',
  SIN_PERMISO: 'Tu usuario no tiene permiso para esta operación.',
  DESCONOCIDO: 'Ocurrió un error inesperado. Intenta de nuevo y, si continúa, avisa al administrador.'
}

// error: lo que devolvió supabase-js. haySesion: ¿el cliente conserva una sesión? entidad: cómo llamar a lo que se pedía.
export function clasificarErrorDeDatos(error, { haySesion = true, entidad = 'el registro', accion = 'cargar' } = {}) {
  if (error instanceof ErrorDeDatos) return error
  // La base de datos no deja completar una cita por fuera de la consulta clínica (migración 090).
  // Migraciones 091/092: la base rechaza referencias incoherentes (autor distinto de la sesión, cita de otro paciente, odontólogo o sillón de otra clínica).
  // Son DEFINITIVOS (reintentar nunca los arregla) y su mensaje es nuestro, claro y seguro de mostrar.
  if (HINTS_INTEGRIDAD.includes(error?.hint)) return new ErrorDeDatos('INTEGRIDAD_DATOS', error.message, error)
  // Migración 094: una cita completada no se modifica directamente; se corrige con motivo (fn_corregir_estado_cita).
  if (error?.hint === 'CORREGIR_ESTADO_REQUIERE_MOTIVO') return new ErrorDeDatos('INTEGRIDAD_DATOS', 'Una cita completada no se modifica directamente: usa «Corregir consulta», que pide un motivo y queda registrada.', error)
  if (error?.hint === 'COMPLETAR_SOLO_VIA_CONSULTA') return new ErrorDeDatos('COMPLETAR_SOLO_VIA_CONSULTA', 'Esa cita se intentó marcar como completada sin guardar la consulta clínica. Ábrela y finalízala desde la consulta.', error)
  if (esErrorDeSesion(error)) return new ErrorDeDatos('SESION_INVALIDA', TEXTO.SESION_INVALIDA, error)
  if (esErrorDeRed(error)) return new ErrorDeDatos('SIN_CONEXION', TEXTO.SIN_CONEXION, error)
  if (esErrorDeServidor(error)) return new ErrorDeDatos('SERVIDOR_NO_DISPONIBLE', TEXTO.SERVIDOR_NO_DISPONIBLE, error)
  if (esCeroFilas(error)) {
    // Sin sesión, "0 filas" es solo la consecuencia de que RLS no deja ver nada a un anónimo: el problema real es la sesión.
    if (!haySesion) return new ErrorDeDatos('SESION_INVALIDA', TEXTO.SESION_INVALIDA, error)
    return new ErrorDeDatos('NO_DISPONIBLE', accion === 'actualizar'
      ? `No se pudo actualizar ${entidad}: no existe o tu usuario no tiene permiso para modificarla. El sistema no puede distinguir ambos casos.`
      : `${entidad[0].toUpperCase()}${entidad.slice(1)} no existe o tu usuario no tiene acceso a ella. El sistema no puede distinguir ambos casos; si crees que es un error, avisa al administrador.`, error)
  }
  if (error?.code === '42501' || Number(error?.status) === 403) return new ErrorDeDatos('SIN_PERMISO', TEXTO.SIN_PERMISO, error)
  return new ErrorDeDatos('DESCONOCIDO', TEXTO.DESCONOCIDO, error)
}

// Errores definitivos al sincronizar la cola offline: repetirlos no los arregla (hace falta que alguien cambie algo).
// SESION_INVALIDA / SIN_CONEXION / SERVIDOR_NO_DISPONIBLE NO lo son: se resuelven solos o al volver a iniciar sesión.
export const CODIGOS_DATOS_DEFINITIVOS = ['SIN_PERMISO', 'NOTA_CONFLICTO', 'NOTA_NO_VERIFICABLE', 'COMPLETAR_SOLO_VIA_CONSULTA', 'INTEGRIDAD_DATOS']
export const esErrorDeDatosDefinitivo = (error) => CODIGOS_DATOS_DEFINITIVOS.includes(error?.codigo)

// Migraciones 091–098: la base rechaza referencias incoherentes (autor distinto de la sesión, cita de otro paciente, odontólogo, sillón, consultorio o tratamiento de otra
// clínica o paciente) y fechas fuera del límite configurado. Reintentarlos NUNCA los arregla y su mensaje es nuestro, claro y seguro de mostrar.
export const HINTS_INTEGRIDAD = [
  'NOTA_AUTOR_INCOHERENTE', 'NOTA_CITA_INCOHERENTE', 'NOTA_FECHA_FUERA_DE_LIMITE',
  'CITA_DENTISTA_INCOHERENTE', 'CITA_SILLON_INCOHERENTE', 'CITA_CONSULTORIO_INCOHERENTE',
  'REFERENCIA_DENTISTA_INCOHERENTE', 'REFERENCIA_TRATAMIENTO_INCOHERENTE', 'ACTOR_INCOHERENTE', 'FIRMANTE_INCOHERENTE', 'PACIENTE_INCOHERENTE',
  'MATERIAL_INCOHERENTE', 'RECETA_INCOHERENTE'   // 117: inventario
]
// Reconoce el rechazo tanto si el servicio ya lo TIPIFICÓ (codigo) como si lo lanzó CRUDO (PostgrestError con `hint`): sin esto, un error crudo caía en «transitorio» y la
// operación offline se reintentaba en cada sincronización, para siempre.
export const esRechazoDeIntegridad = (error) => error?.codigo === 'INTEGRIDAD_DATOS' || (typeof error?.hint === 'string' && HINTS_INTEGRIDAD.includes(error.hint))
