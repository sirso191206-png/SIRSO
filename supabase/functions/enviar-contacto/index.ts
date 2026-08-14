// Edge Function: enviar-contacto
// Recibe un mensaje ya guardado en `mensajes_contacto` y lo reenvía por
// correo real al buzón de soporte, usando la API de Resend.
// No requiere sesión de usuario — el formulario de contacto es público.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { buildCorsHeaders } from '../_shared/cors.ts'

// A dónde llega el correo de soporte — se puede ajustar sin tocar código
// usando el secreto CORREO_SOPORTE (ver instrucciones de despliegue).
const CORREO_SOPORTE_DEFECTO = 'soporte@siro.app'

serve(async (req) => {
  // CORS por petición: refleja el Origin si está en la lista blanca.
  const corsHeaders = buildCorsHeaders(req.headers.get('Origin'))
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { mensajeId, nombre, correo, mensaje } = await req.json()
    if (!nombre || !correo || !mensaje) throw new Error('Faltan datos del mensaje')

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const correoSoporte = Deno.env.get('CORREO_SOPORTE') ?? CORREO_SOPORTE_DEFECTO

    if (!resendApiKey) {
      // Sin la llave configurada, no se puede enviar el correo de verdad
      // — se avisa con claridad en vez de fingir que se envió.
      throw new Error('El servicio de correo no está configurado todavía (falta RESEND_API_KEY).')
    }

    const respuestaResend = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'SIRO <onboarding@resend.dev>', // cambiar cuando haya dominio propio verificado en Resend
        to: [correoSoporte],
        reply_to: correo,
        subject: `Nuevo mensaje de contacto — ${nombre}`,
        html: `
          <p><strong>Nombre:</strong> ${escaparHtml(nombre)}</p>
          <p><strong>Correo:</strong> ${escaparHtml(correo)}</p>
          <p><strong>Mensaje:</strong></p>
          <p>${escaparHtml(mensaje).replace(/\n/g, '<br/>')}</p>
        `
      })
    })

    if (!respuestaResend.ok) {
      const detalle = await respuestaResend.text()
      throw new Error(`Resend respondió con error: ${detalle}`)
    }

    // Marca el mensaje como enviado exitosamente (usa service_role, no
    // necesita pasar por la política de RLS pensada para el frontend).
    if (mensajeId) {
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )
      await supabaseAdmin.from('mensajes_contacto').update({ correo_enviado: true }).eq('id', mensajeId)
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

function escaparHtml(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
