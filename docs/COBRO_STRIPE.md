# Cobro automático de suscripciones con Stripe (migración 114)

## Qué hace
- El **owner** abre *Configuración → Pago en línea*, elige un plan y una modalidad, y paga con tarjeta en Stripe Checkout.
- A partir de ahí Stripe cobra solo cada mes o cada año. En *Administrar pago* (el portal de Stripe), el owner puede:
  - cambiar la tarjeta;
  - cambiar de plan;
  - cancelar;
  - descargar sus recibos.
- Stripe avisa a SIRO por webhook (`stripe-webhook`) y SIRO actúa así:
  - **Pago correcto:** la `fecha_fin` de la suscripción se mueve al final del período pagado.
  - **Cambio de plan en el portal:** se aplica el plan nuevo, con sus límites y funcionalidades.
  - **Pago fallido o cancelación:** no se bloquea ni se borra nada. Lo pagado sigue vigente hasta su `fecha_fin`, y después la suscripción pasa a gracia y luego a vencida (migración 082).
  - **Suspensión:** sigue siendo una decisión manual del superadmin. Stripe nunca suspende ni reactiva una clínica.
- SIRO **no guarda tarjetas**. El precio que se cobra lo define Stripe (`price`), y la relación entre cada price y su plan está en la base de datos; el navegador no decide ninguna de las dos cosas.
- El historial de cobros (pagados y fallidos) se ve en la misma pantalla, con un enlace al recibo de Stripe.
- **No incluye facturación electrónica (CFDI).** Por ahora se factura aparte; está prevista como una segunda etapa.

## Piezas
| Pieza | Archivo |
|---|---|
| Base de datos | `supabase/migrations/114_sirso_cobro_stripe.sql` (rollback: `supabase/rollback/siro_v3/rollback_114.sql`) |
| Pruebas de la base | `supabase/tests/cobro_stripe_test.sql` (33 pruebas) |
| Edge Functions | `stripe-checkout`, `stripe-portal`, `stripe-webhook`. Código común en `_shared/stripe.ts` y `_shared/stripe-logica.ts` (pruebas: `_shared/stripe-logica.test.ts`) |
| Pantallas | `components/planes/PagoEnLinea.jsx` (owner) y la pestaña *Precios* de `FormularioPlan.jsx` (superadmin) |

## Alta en Stripe (la hace el responsable; Claude no crea cuentas ni maneja llaves)
1. Crea la cuenta en stripe.com y completa los datos fiscales de México. Empieza en **modo de prueba**.
2. **Productos:** crea un producto por plan («SIRO Esencial», etc.). En cada uno, crea un precio **recurrente en MXN**, mensual y, si aplica, anual. Los montos deben ser los mismos que en `/superadmin/planes`.
3. **Portal del cliente** (Settings → Billing → Customer portal). Activa:
   - actualizar el método de pago;
   - cancelar *al final del período*;
   - cambiar de plan entre esos precios;
   - el historial de facturas.
4. **Webhook** (Developers → Webhooks → Add endpoint):
   - URL: `https://mhqdgvdcupzhatrryapw.supabase.co/functions/v1/stripe-webhook`
   - Eventos:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.paid`
     - `invoice.payment_failed`
   - Copia el *Signing secret* (`whsec_…`).
5. **Secretos de Supabase.** Ejecútalos tú en tu terminal; no los pegues en el chat:
   ```
   supabase secrets set --project-ref mhqdgvdcupzhatrryapw STRIPE_SECRET_KEY=sk_test_…
   supabase secrets set --project-ref mhqdgvdcupzhatrryapw STRIPE_WEBHOOK_SECRET=whsec_…
   ```
6. **Precios en SIRO:** en `/superadmin/planes` → Editar plan → pestaña *Precios* → *Pago en línea (Stripe)*, pega el `price_…` mensual y el anual de cada plan.

## Despliegue (en este orden; nada se activa hasta completar el paso 6 del alta)
1. Migración 114 con el script validado (comprueba el destino y pide la ref tecleada).
2. Funciones:
   ```
   supabase functions deploy stripe-checkout
   supabase functions deploy stripe-portal
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```
   El webhook no lleva JWT porque lo llama Stripe; su seguridad es la firma del evento.
3. Frontend: commit y push a `main` (Vercel publica). Mientras ningún plan tenga un price configurado, la sección *Pago en línea* no aparece.

## Prueba de punta a punta (modo de prueba)
1. Con una clínica sintética, el owner paga con la tarjeta de prueba `4242 4242 4242 4242`.
   - El plan y la `fecha_fin` se actualizan en segundos.
   - El cobro aparece en el historial.
2. Prueba la tarjeta que falla, `4000 0000 0000 0341`: queda registrado un cobro fallido y la `fecha_fin` no cambia.
3. En el portal, cambia de plan y cancela. Comprueba que se aplica el plan nuevo y que la suscripción deja de renovarse.
4. En Stripe → Webhooks, todos los eventos deben haber recibido una respuesta 200.

Cuando todo funcione, repite los pasos 2 a 6 del alta en **modo real**, con `sk_live_…` y un webhook nuevo.

## Rollback
`rollback_114.sql` deja el esquema como 001–113. Se niega a ejecutarse si ya hay cobros o vínculos con Stripe, para no perder el historial.

## Prueba gratuita y bloqueo por falta de pago (migración 115)
- **Alta:** el superadmin crea la clínica indicando los **días de prueba** (obligatorio). La suscripción vence al terminar la prueba.
- **Durante la prueba:** después del primer paciente, el owner ve el aviso «Agrega tu método de pago». Si paga con tarjeta durante la prueba, Stripe **no cobra hasta que termina** (`trial_end` = fin de la prueba; Stripe exige al menos 48 h por delante).
- **Si no paga:** al vencer empiezan los días de gracia (`dias_gracia_suscripcion`, 7). Terminada la gracia, la clínica queda **suspendida por completo**: la base de datos bloquea todos sus datos (`auth_clinica_id()` → RLS). El owner ve una pantalla con «Pago en línea» y, **en cuanto Stripe confirma el pago, el acceso vuelve solo**. Los demás usuarios ven que el propietario debe pagar.
- **Nunca se borra información.** El superadmin no se bloquea y puede extender la fecha de fin de cualquier clínica.
- **Clínicas sin fecha de fin** (convenios, clínicas anteriores a la 115) **nunca vencen**.
- **Interruptor de emergencia:** `plataforma_config.bloqueo_por_falta_de_pago = 'off'` desactiva el bloqueo al instante.
- **Suspensión manual:** sigue siendo independiente. Solo el superadmin la quita, y Stripe no la levanta.
