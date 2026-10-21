// Edge Function: stripe-webhook (migración 114)
// La llama STRIPE, no el navegador: se despliega con --no-verify-jwt y la autenticidad se comprueba con la FIRMA del evento
// (STRIPE_WEBHOOK_SECRET). Un evento sin firma válida se rechaza con 400 sin tocar nada.
// La suscripción se VUELVE A LEER de Stripe (con la versión de API fijada): así no importa el orden en que lleguen los eventos.
// Cada evento se aplica una sola vez (stripe_eventos, en la base). Si algo falla se responde 500 y Stripe reintenta.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { clienteAdmin, clienteStripe, proveedorCripto } from '../_shared/stripe.ts'
import { datosFactura, datosSuscripcion, EVENTO_CHECKOUT, EVENTOS_FACTURA, EVENTOS_SUSCRIPCION, idDe } from '../_shared/stripe-logica.ts'

const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
  const secreto = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  if (!secreto) {
    console.error('stripe-webhook: falta STRIPE_WEBHOOK_SECRET')
    return json({ error: 'No configurado' }, 500)
  }

  const stripe = clienteStripe()
  const cuerpo = await req.text()
  let evento
  try {
    evento = await stripe.webhooks.constructEventAsync(cuerpo, req.headers.get('Stripe-Signature') ?? '', secreto, undefined, proveedorCripto)
  } catch {
    return json({ error: 'Firma inválida' }, 400)
  }

  const admin = clienteAdmin()
  const sincronizar = async (subscriptionId: string, idEvento: string) => {
    const d = datosSuscripcion(await stripe.subscriptions.retrieve(subscriptionId))
    const { data, error } = await admin.rpc('fn_stripe_sincronizar_suscripcion', {
      p_evento: idEvento, p_tipo: evento.type, p_clinica: d.clinicaId, p_customer: d.customer, p_subscription: d.subscription,
      p_price: d.price, p_status: d.status, p_periodo_fin: d.periodoFin, p_cancela_al_final: d.cancelaAlFinal,
    })
    if (error) throw error
    return data?.resultado
  }

  try {
    // deno-lint-ignore no-explicit-any
    const objeto = evento.data.object as any
    let resultado: unknown = 'ignorado'

    if (EVENTOS_SUSCRIPCION.includes(evento.type)) {
      resultado = await sincronizar(objeto.id, evento.id)
    } else if (evento.type === EVENTO_CHECKOUT) {
      const sub = objeto.mode === 'subscription' ? idDe(objeto.subscription) : null
      if (sub) resultado = await sincronizar(sub, evento.id)
    } else if (EVENTOS_FACTURA.includes(evento.type)) {
      const f = datosFactura(objeto, evento.type)
      const { data, error } = await admin.rpc('fn_stripe_registrar_pago', {
        p_evento: evento.id, p_tipo: evento.type, p_customer: f.customer, p_subscription: f.subscription, p_invoice: f.invoice,
        p_estado: f.estado, p_monto_centavos: f.montoCentavos, p_moneda: f.moneda, p_periodo_inicio: f.periodoInicio,
        p_periodo_fin: f.periodoFin, p_url: f.url,
      })
      if (error) throw error
      resultado = { pago: data?.resultado, suscripcion: f.subscription ? await sincronizar(f.subscription, `${evento.id}:suscripcion`) : null }
    }

    console.log('stripe-webhook:', evento.type, evento.id, JSON.stringify(resultado))
    return json({ recibido: true, resultado })
  } catch (err) {
    const e = err as { code?: string; message?: string }
    console.error('stripe-webhook: error procesando', evento.type, evento.id, e?.code ?? '', e?.message ?? String(err))
    return json({ error: 'No se pudo procesar el evento' }, 500)
  }
})
