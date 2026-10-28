// Edge Function: stripe-portal (migración 114)
// El OWNER abre el portal de Stripe de su clínica: cambiar tarjeta, cambiar de plan, cancelar y descargar recibos.
// Lo que cambie ahí llega a SIRO por stripe-webhook.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { buildCorsHeaders } from '../_shared/cors.ts'
import { registrarFalloEdge } from '../_shared/alertas.ts'
import { ErrorDeSolicitud, responderError } from '../_shared/solicitud.ts'
import { clienteAdmin, clienteStripe, perfilDelLlamante } from '../_shared/stripe.ts'
import { urlsDeRegreso } from '../_shared/stripe-logica.ts'

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get('Origin'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (req.method !== 'POST') throw new ErrorDeSolicitud('Método no permitido', 405)
    const admin = clienteAdmin()
    const perfil = await perfilDelLlamante(req, admin)
    if (perfil.rol !== 'owner') throw new ErrorDeSolicitud('Solo el propietario de la clínica administra el pago.', 403, 'NO_AUTORIZADO')

    const { data: clinica, error } = await admin.from('clinicas').select('stripe_customer_id').eq('id', perfil.clinica_id).single()
    if (error) throw error
    if (!clinica?.stripe_customer_id) throw new ErrorDeSolicitud('Tu clínica todavía no tiene pagos en línea.', 400, 'SIN_CLIENTE_STRIPE')

    const sesion = await clienteStripe().billingPortal.sessions.create({
      customer: clinica.stripe_customer_id,
      return_url: urlsDeRegreso(corsHeaders['Access-Control-Allow-Origin']).portal,
      locale: 'es',
    })
    return new Response(JSON.stringify({ url: sesion.url }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    const respuesta = responderError(err, corsHeaders, 'stripe-portal')
    // Un fallo inesperado (5xx) en el cobro se registra y avisa por correo (116).
    if (respuesta.status >= 500) await registrarFalloEdge('stripe-portal', err)
    return respuesta
  }
})
