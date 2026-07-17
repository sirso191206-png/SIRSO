import { supabase } from '../lib/supabase'

export async function enviarMensajeContacto({ nombre, correo, mensaje }) {
  // 1) Se guarda primero — así el mensaje no se pierde aunque el correo falle.
  const { data: fila, error: errorGuardar } = await supabase
    .from('mensajes_contacto')
    .insert({ nombre, correo, mensaje })
    .select()
    .single()
  if (errorGuardar) throw errorGuardar

  // 2) Se intenta el envío real por correo (Resend, vía Edge Function).
  const { error: errorEnvio } = await supabase.functions.invoke('enviar-contacto', {
    body: { mensajeId: fila.id, nombre, correo, mensaje }
  })
  if (errorEnvio) {
    // El mensaje ya quedó guardado — se informa que el correo no salió,
    // pero no se pierde la información del visitante.
    throw new Error('Tu mensaje se guardó, pero no se pudo enviar el correo de notificación. Igual lo vamos a revisar.')
  }
}
