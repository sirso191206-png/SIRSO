import { supabase } from '../lib/supabase'

export async function enviarMensajeContacto({ nombre, correo, mensaje }) {
  // El id se genera aquí mismo (no se deja que la BD lo genere y se lea
  // de vuelta con .select()) — a propósito el SELECT de esta tabla está
  // restringido solo al superadmin, así que pedir la fila de vuelta
  // fallaría por RLS aunque el INSERT en sí sea válido.
  const id = crypto.randomUUID()

  const { error: errorGuardar } = await supabase
    .from('mensajes_contacto')
    .insert({ id, nombre, correo, mensaje })
  if (errorGuardar) throw errorGuardar

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
