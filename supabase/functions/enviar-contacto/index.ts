// Edge Function: enviar-contacto
// Reenvía por correo real (API de Resend) al buzón de soporte un mensaje YA GUARDADO en `mensajes_contacto`.
// No requiere sesión de usuario — el formulario de contacto es público.
//
// Como es PÚBLICA, se limita lo que puede hacer (fase 8):
//  · Solo envía un mensaje que EXISTE en `mensajes_contacto` y usa el contenido GUARDADO, nunca el que diga el llamante
//    (antes enviaba cualquier texto con cualquier `reply_to`: un buzón de soporte inundable con contenido arbitrario).
//  · UN correo por mensaje: el mensaje se «reclama» con un UPDATE condicional (correo_enviado = false), así que repetir la llamada o llamar
//    en paralelo no envía más. Si Resend falla, el mensaje se libera para poder reintentar.
//  · Solo mensajes guardados hace menos de 15 minutos (el envío lo dispara el propio formulario justo después de guardar).
//  · No devuelve al llamante la respuesta cruda de Resend ni detalles internos (se registran en el servidor).
// La FRECUENCIA de envíos (CAPTCHA o límite por IP) NO se resuelve aquí: es una decisión pendiente (ver docs/FASE8_INFORME_AUDITORIA_OFFLINE.md).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { buildCorsHeaders } from '../_shared/cors.ts'

// A dónde llega el correo de soporte — se puede ajustar sin tocar código
// usando el secreto CORREO_SOPORTE (ver instrucciones de despliegue).
const CORREO_SOPORTE_DEFECTO = 'soporte@siro.app'
const VENTANA_MS = 15 * 60 * 1000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Errores PROPIOS (mensaje fijo y seguro de mostrar). Cualquier otro error es inesperado: se registra y se responde algo genérico.
class ErrorDeSolicitud extends Error {}

serve(async (req) => {
  // CORS por petición: refleja el Origin si está en la lista blanca.
  const corsHeaders = buildCorsHeaders(req.headers.get('Origin'))
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  const responder = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    let body: unknown
    try { body = await req.json() } catch { throw new ErrorDeSolicitud('Solicitud inválida') }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ErrorDeSolicitud('Solicitud inválida')
    const mensajeId = (body as Record<string, unknown>).mensajeId
    if (typeof mensajeId !== 'string' || !UUID.test(mensajeId)) throw new ErrorDeSolicitud('Falta el identificador del mensaje guardado')

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const correoSoporte = Deno.env.get('CORREO_SOPORTE') ?? CORREO_SOPORTE_DEFECTO
    if (!resendApiKey) {
      // Sin la llave configurada, no se puede enviar el correo de verdad
      // — se avisa con claridad en vez de fingir que se envió.
      throw new ErrorDeSolicitud('El servicio de correo no está configurado todavía (falta RESEND_API_KEY).')
    }

    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const { data: guardado, error: errorLectura } = await supabaseAdmin
      .from('mensajes_contacto').select('nombre, correo, mensaje, correo_enviado, creado_en').eq('id', mensajeId).single()
    if (errorLectura || !guardado) throw new ErrorDeSolicitud('Mensaje no encontrado')
    if (guardado.correo_enviado) return responder({ ok: true, yaEnviado: true })
    if (Date.now() - new Date(guardado.creado_en).getTime() > VENTANA_MS) {
      throw new ErrorDeSolicitud('Este mensaje ya no se puede enviar por correo (pasó demasiado tiempo desde que se guardó).')
    }

    // «Reclamar» el mensaje ANTES de enviar: si dos llamadas llegan a la vez, solo una gana.
    const { data: reclamado, error: errorReclamo } = await supabaseAdmin
      .from('mensajes_contacto').update({ correo_enviado: true }).eq('id', mensajeId).eq('correo_enviado', false).select('id')
    if (errorReclamo) throw errorReclamo
    if (!reclamado || reclamado.length === 0) return responder({ ok: true, yaEnviado: true })

    const asunto = `Nuevo mensaje de contacto — ${String(guardado.nombre).replace(/[\r\n]+/g, ' ').slice(0, 120)}`
    let respuestaResend: Response
    try {
      respuestaResend = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'SIRO <onboarding@resend.dev>', // cambiar cuando haya dominio propio verificado en Resend
          to: [correoSoporte],
          reply_to: guardado.correo,
          subject: asunto,
          html: `
            <p><strong>Nombre:</strong> ${escaparHtml(guardado.nombre)}</p>
            <p><strong>Correo:</strong> ${escaparHtml(guardado.correo)}</p>
            <p><strong>Mensaje:</strong></p>
            <p>${escaparHtml(guardado.mensaje).replace(/\n/g, '<br/>')}</p>
          `
        })
      })
    } catch (causa) {
      await supabaseAdmin.from('mensajes_contacto').update({ correo_enviado: false }).eq('id', mensajeId)
      console.error('enviar-contacto: no se pudo contactar a Resend:', (causa as Error)?.message)
      return responder({ error: 'No se pudo enviar el correo de notificación en este momento.' }, 502)
    }

    if (!respuestaResend.ok) {
      // El detalle se registra en el servidor; NO se devuelve al llamante (puede revelar la cuenta o la configuración). El mensaje se libera para reintentar.
      console.error('enviar-contacto: Resend respondió con error', respuestaResend.status, await respuestaResend.text())
      await supabaseAdmin.from('mensajes_contacto').update({ correo_enviado: false }).eq('id', mensajeId)
      return responder({ error: 'No se pudo enviar el correo de notificación en este momento.' }, 502)
    }

    return responder({ ok: true })
  } catch (error) {
    if (error instanceof ErrorDeSolicitud) return responder({ error: error.message }, 400)
    console.error('enviar-contacto: error inesperado', (error as Error)?.message)
    return responder({ error: 'No se pudo completar la operación.' }, 500)
  }
})

function escaparHtml(texto: unknown) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
