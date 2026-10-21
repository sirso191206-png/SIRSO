// ============================================================
// SIRO — Lógica PURA del cobro con Stripe (migración 114), sin red ni SDK, para poder probarla con `deno test`.
// Extrae de los objetos de Stripe SOLO lo que la base de datos necesita. El plan y la modalidad NO se toman de aquí:
// la base los deduce del `price` (planes_catalogo.stripe_price_*).
// ============================================================

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Eventos que SIRO atiende; el resto se contesta 200 sin hacer nada.
export const EVENTOS_SUSCRIPCION = ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted']
export const EVENTOS_FACTURA = ['invoice.paid', 'invoice.payment_failed']
export const EVENTO_CHECKOUT = 'checkout.session.completed'

type ConId = string | { id: string } | null | undefined
export const idDe = (v: ConId): string | null => (typeof v === 'string' ? v : v && typeof v === 'object' && typeof v.id === 'string' ? v.id : null)

const isoDeSegundos = (s: unknown): string | null => (typeof s === 'number' && Number.isFinite(s) ? new Date(s * 1000).toISOString() : null)

export interface DatosSuscripcion {
  clinicaId: string | null
  customer: string
  subscription: string
  price: string
  status: string
  periodoFin: string
  cancelaAlFinal: boolean
}

// deno-lint-ignore no-explicit-any
export function datosSuscripcion(sub: any): DatosSuscripcion {
  const customer = idDe(sub?.customer)
  const item = sub?.items?.data?.[0]
  const price = idDe(item?.price)
  // Desde la API 2025-03 el período vive en cada item; antes, en la suscripción.
  const periodoFin = isoDeSegundos(sub?.current_period_end ?? item?.current_period_end)
  if (typeof sub?.id !== 'string' || !customer || !price || typeof sub?.status !== 'string' || !periodoFin) {
    throw new Error('Suscripción de Stripe incompleta')
  }
  const clinica = sub?.metadata?.clinica_id
  return {
    clinicaId: typeof clinica === 'string' && UUID.test(clinica) ? clinica : null,
    customer,
    subscription: sub.id,
    price,
    status: sub.status,
    periodoFin,
    cancelaAlFinal: sub.cancel_at_period_end === true,
  }
}

export interface DatosFactura {
  customer: string
  subscription: string | null
  invoice: string
  estado: 'pagado' | 'fallido'
  montoCentavos: number
  moneda: string
  periodoInicio: string | null
  periodoFin: string | null
  url: string | null
}

// deno-lint-ignore no-explicit-any
export function datosFactura(inv: any, tipo: string): DatosFactura {
  const customer = idDe(inv?.customer)
  if (typeof inv?.id !== 'string' || !customer || typeof inv?.currency !== 'string') throw new Error('Factura de Stripe incompleta')
  const pagada = tipo === 'invoice.paid'
  const linea = inv?.lines?.data?.[0]
  const monto = pagada ? inv.amount_paid : inv.amount_due
  return {
    customer,
    // API anterior: invoice.subscription; API 2025+: invoice.parent.subscription_details.subscription
    subscription: idDe(inv.subscription) ?? idDe(inv?.parent?.subscription_details?.subscription),
    invoice: inv.id,
    estado: pagada ? 'pagado' : 'fallido',
    montoCentavos: typeof monto === 'number' && monto >= 0 ? Math.round(monto) : 0,
    moneda: inv.currency,
    periodoInicio: isoDeSegundos(linea?.period?.start ?? inv.period_start),
    periodoFin: isoDeSegundos(linea?.period?.end ?? inv.period_end),
    url: typeof inv.hosted_invoice_url === 'string' && inv.hosted_invoice_url.startsWith('https://') ? inv.hosted_invoice_url : null,
  }
}

// URLs a las que Stripe regresa al usuario: SIEMPRE un origen de la lista blanca de CORS (nunca uno que mande el navegador).
export function urlsDeRegreso(origenPermitido: string): { exito: string; cancelado: string; portal: string } {
  const base = origenPermitido.replace(/\/+$/, '')
  return {
    exito: `${base}/configuracion?pago=exito`,
    cancelado: `${base}/configuracion?pago=cancelado`,
    portal: `${base}/configuracion`,
  }
}

export const MODALIDADES = ['mensual', 'anual']
export const CODIGO_PLAN = /^[a-z0-9_]{1,40}$/
