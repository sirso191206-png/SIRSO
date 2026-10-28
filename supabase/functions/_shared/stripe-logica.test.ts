// Pruebas de la lógica pura del cobro con Stripe — corren con `deno test` (como sis-cifrado.test.ts).
import { datosFactura, datosSuscripcion, finDePruebaStripe, idDe, urlsDeRegreso } from './stripe-logica.ts'

function assertEquals(actual: unknown, esperado: unknown, mensaje?: string) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(esperado)
  if (a !== e) throw new Error(`${mensaje ?? 'Assertion falló'}\n  esperado: ${e}\n  obtenido: ${a}`)
}
function assertThrows(fn: () => void, patron: RegExp) {
  try { fn() } catch (err) { if (patron.test((err as Error).message)) return; throw err }
  throw new Error('Se esperaba un error')
}

const CLINICA = '11111111-2222-3333-4444-555555555555'
const sub = (cambios: Record<string, unknown> = {}) => ({
  id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: false, current_period_end: 1767225600,
  metadata: { clinica_id: CLINICA }, items: { data: [{ price: { id: 'price_1' } }] }, ...cambios,
})

Deno.test('datosSuscripcion — extrae lo necesario y convierte el período a ISO', () => {
  assertEquals(datosSuscripcion(sub()), {
    clinicaId: CLINICA, customer: 'cus_1', subscription: 'sub_1', price: 'price_1', status: 'active',
    periodoFin: '2026-01-01T00:00:00.000Z', cancelaAlFinal: false,
  })
})

Deno.test('datosSuscripcion — customer expandido, cancelación al final y período en el item (API 2025+)', () => {
  const d = datosSuscripcion(sub({ customer: { id: 'cus_9' }, cancel_at_period_end: true, current_period_end: undefined,
    items: { data: [{ price: 'price_2', current_period_end: 1767225600 }] } }))
  assertEquals([d.customer, d.price, d.cancelaAlFinal, d.periodoFin], ['cus_9', 'price_2', true, '2026-01-01T00:00:00.000Z'])
})

Deno.test('datosSuscripcion — una clinica_id que no es uuid se ignora (la base busca por customer)', () => {
  assertEquals(datosSuscripcion(sub({ metadata: { clinica_id: "x'; drop table--" } })).clinicaId, null)
  assertEquals(datosSuscripcion(sub({ metadata: undefined })).clinicaId, null)
})

Deno.test('datosSuscripcion — incompleta lanza error (el webhook responde 500 y Stripe reintenta)', () => {
  assertThrows(() => datosSuscripcion(sub({ items: { data: [] } })), /incompleta/)
  assertThrows(() => datosSuscripcion(sub({ customer: null })), /incompleta/)
  assertThrows(() => datosSuscripcion(sub({ current_period_end: 'mañana' })), /incompleta/)
})

const factura = (cambios: Record<string, unknown> = {}) => ({
  id: 'in_1', customer: 'cus_1', subscription: 'sub_1', currency: 'mxn', amount_paid: 99900, amount_due: 99900,
  hosted_invoice_url: 'https://invoice.stripe.com/i/1', lines: { data: [{ period: { start: 1764547200, end: 1767225600 } }] }, ...cambios,
})

Deno.test('datosFactura — pagada', () => {
  assertEquals(datosFactura(factura(), 'invoice.paid'), {
    customer: 'cus_1', subscription: 'sub_1', invoice: 'in_1', estado: 'pagado', montoCentavos: 99900, moneda: 'mxn',
    periodoInicio: '2025-12-01T00:00:00.000Z', periodoFin: '2026-01-01T00:00:00.000Z', url: 'https://invoice.stripe.com/i/1',
  })
})

Deno.test('datosFactura — fallida usa amount_due; suscripción en parent (API 2025+); URL no https se descarta', () => {
  const f = datosFactura(factura({ amount_paid: 0, amount_due: 59900, subscription: null, hosted_invoice_url: 'javascript:alert(1)',
    parent: { subscription_details: { subscription: 'sub_7' } } }), 'invoice.payment_failed')
  assertEquals([f.estado, f.montoCentavos, f.subscription, f.url], ['fallido', 59900, 'sub_7', null])
})

Deno.test('datosFactura — sin customer lanza error', () => {
  assertThrows(() => datosFactura(factura({ customer: null }), 'invoice.paid'), /incompleta/)
})

Deno.test('idDe y urlsDeRegreso', () => {
  assertEquals([idDe('a'), idDe({ id: 'b' }), idDe(null), idDe(undefined)], ['a', 'b', null, null])
  assertEquals(urlsDeRegreso('https://sirso.vercel.app/'), {
    exito: 'https://sirso.vercel.app/configuracion?pago=exito',
    cancelado: 'https://sirso.vercel.app/configuracion?pago=cancelado',
    portal: 'https://sirso.vercel.app/configuracion',
  })
})

Deno.test('finDePruebaStripe — fin del día en CDMX, solo si faltan ≥ 49 h y ≤ 730 días', () => {
  const ahora = Date.parse('2026-10-27T12:00:00-06:00')
  assertEquals(finDePruebaStripe('2026-11-10', ahora), Math.floor(Date.parse('2026-11-10T23:59:00-06:00') / 1000))
  assertEquals(finDePruebaStripe('2026-10-29', ahora), Math.floor(Date.parse('2026-10-29T23:59:00-06:00') / 1000)) // 59 h
  assertEquals(finDePruebaStripe('2026-10-28', ahora), null) // 35 h: Stripe no lo acepta → se cobra al pagar
  assertEquals(finDePruebaStripe('2026-10-20', ahora), null) // ya pasó
  assertEquals(finDePruebaStripe('2029-01-01', ahora), null) // más de 730 días
  assertEquals([finDePruebaStripe(null, ahora), finDePruebaStripe('10/11/2026', ahora), finDePruebaStripe('2026-13-40', ahora)], [null, null, null])
})
