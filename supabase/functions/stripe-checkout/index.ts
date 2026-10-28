// Edge Function: stripe-checkout (migración 114)
// El OWNER de una clínica elige plan y modalidad; se devuelve la URL de Stripe Checkout para pagar con tarjeta.
// El precio (price de Stripe) lo decide la base de datos (fn_stripe_datos_checkout), nunca el navegador.
// El alta real del plan la hace stripe-webhook cuando Stripe confirma el pago.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { buildCorsHeaders } from '../_shared/cors.ts'
import { registrarFalloEdge } from '../_shared/alertas.ts'
import { ErrorDeSolicitud, leerCuerpoJson, responderError } from '../_shared/solicitud.ts'
import { clienteAdmin, clienteStripe, perfilDelLlamante } from '../_shared/stripe.ts'
import { CODIGO_PLAN, finDePruebaStripe, MODALIDADES, urlsDeRegreso } from '../_shared/stripe-logica.ts'

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get('Origin'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (req.method !== 'POST') throw new ErrorDeSolicitud('Método no permitido', 405)
    const admin = clienteAdmin()
    const perfil = await perfilDelLlamante(req, admin)

    const body = await leerCuerpoJson(req)
    const plan = body.plan
    const modalidad = body.modalidad
    if (typeof plan !== 'string' || !CODIGO_PLAN.test(plan)) throw new ErrorDeSolicitud('Plan inválido')
    if (typeof modalidad !== 'string' || !MODALIDADES.includes(modalidad)) throw new ErrorDeSolicitud('Modalidad inválida (mensual o anual)')

    // Valida en la base: owner, clínica no suspendida, sin pago automático activo, plan visible con price en esa modalidad.
    const { data: datos, error: errDatos } = await admin.rpc('fn_stripe_datos_checkout', { p_usuario: perfil.id, p_plan: plan, p_modalidad: modalidad })
    if (errDatos) throw errDatos

    const stripe = clienteStripe()
    let customer: string | null = datos.stripe_customer_id
    if (!customer) {
      // Clave de idempotencia por clínica: dos clics seguidos no crean dos clientes.
      const nuevo = await stripe.customers.create(
        { email: datos.correo ?? undefined, name: datos.clinica_nombre, metadata: { clinica_id: datos.clinica_id } },
        { idempotencyKey: `siro-cliente-${datos.clinica_id}` },
      )
      const { error: errVinculo } = await admin.rpc('fn_stripe_vincular_cliente', { p_clinica: datos.clinica_id, p_customer: nuevo.id })
      if (errVinculo) throw errVinculo
      customer = nuevo.id
    }

    const urls = urlsDeRegreso(corsHeaders['Access-Control-Allow-Origin'])
    const finPrueba = finDePruebaStripe(datos.fin_prueba, Date.now())
    const sesion = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer,
      line_items: [{ price: datos.price, quantity: 1 }],
      client_reference_id: datos.clinica_id,
      metadata: { clinica_id: datos.clinica_id },
      // Prueba (115): si la clínica aún está en su periodo de prueba, registra la tarjeta hoy y el primer cobro es al terminar.
      subscription_data: { metadata: { clinica_id: datos.clinica_id }, ...(finPrueba ? { trial_end: finPrueba } : {}) },
      locale: 'es',
      success_url: urls.exito,
      cancel_url: urls.cancelado,
    })

    await admin.from('auditoria').insert({
      usuario_id: perfil.id, clinica_id: datos.clinica_id, accion: 'iniciar_pago_stripe', entidad: 'suscripciones', entidad_id: null,
      detalle: { plan, modalidad, via: 'edge_function' },
    })

    return new Response(JSON.stringify({ url: sesion.url }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    const respuesta = responderError(err, corsHeaders, 'stripe-checkout')
    // Un fallo inesperado (5xx) en el cobro se registra y avisa por correo (116).
    if (respuesta.status >= 500) await registrarFalloEdge('stripe-checkout', err)
    return respuesta
  }
})
