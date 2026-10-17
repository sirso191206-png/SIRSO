import { supabase } from '../lib/supabase'

// Límites de tamaño del formulario público. DEBEN coincidir con las restricciones CHECK de la migración 099 (una prueba lo comprueba): la interfaz los aplica
// antes de enviar para que una persona legítima nunca vea un error técnico de la base de datos.
export const LIMITES_CONTACTO = { nombre: 120, correo: 254, mensaje: 5000 }
const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Función pura: devuelve un objeto con un texto por cada campo inválido ({} si todo está bien).
export function validarContacto({ nombre = '', correo = '', mensaje = '' }) {
  const e = {}
  const n = nombre.trim(), c = correo.trim(), m = mensaje.trim()
  if (!n) e.nombre = 'El nombre es obligatorio.'
  else if (n.length > LIMITES_CONTACTO.nombre) e.nombre = `El nombre no puede tener más de ${LIMITES_CONTACTO.nombre} caracteres.`
  if (!REGEX_CORREO.test(c)) e.correo = 'Ingresa un correo válido.'
  else if (c.length > LIMITES_CONTACTO.correo) e.correo = `El correo no puede tener más de ${LIMITES_CONTACTO.correo} caracteres.`
  if (!m) e.mensaje = 'Escribe tu mensaje.'
  else if (m.length > LIMITES_CONTACTO.mensaje) e.mensaje = `El mensaje no puede tener más de ${LIMITES_CONTACTO.mensaje} caracteres.`
  return e
}

export async function enviarMensajeContacto({ nombre, correo, mensaje }) {
  // El id se genera aquí mismo (no se deja que la BD lo genere y se lea
  // de vuelta con .select()) — a propósito el SELECT de esta tabla está
  // restringido solo al superadmin, así que pedir la fila de vuelta
  // fallaría por RLS aunque el INSERT en sí sea válido.
  const id = crypto.randomUUID()

  const { error: errorGuardar } = await supabase
    .from('mensajes_contacto')
    .insert({ id, nombre, correo, mensaje })
  if (errorGuardar) {
    // La base de datos pone dos límites al formulario público (migraciones 099 y 102): tamaño y frecuencia. Se explican con claridad, nunca como un error técnico.
    if (errorGuardar.hint === 'CONTACTO_DEMASIADOS_MENSAJES') throw new Error('Se han recibido demasiados mensajes. Inténtalo de nuevo más tarde.')
    if (errorGuardar.code === '23514') throw new Error('Alguno de los campos es demasiado largo. Revisa tu mensaje e inténtalo de nuevo.')
    throw errorGuardar
  }

  // Se intenta el envío real por correo (Resend, vía Edge Function).
  const { error: errorEnvio } = await supabase.functions.invoke('enviar-contacto', {
    body: { mensajeId: id, nombre, correo, mensaje }
  })
  if (errorEnvio) {
    // El mensaje ya quedó guardado — se informa que el correo no salió,
    // pero no se pierde la información del visitante.
    throw new Error('Tu mensaje se guardó, pero no se pudo enviar el correo de notificación. Igual lo vamos a revisar.')
  }
}
