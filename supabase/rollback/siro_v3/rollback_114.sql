-- ROLLBACK de la 114 (cobro con Stripe). Deja el esquema como 001–113. Se NIEGA si ya hay cobros, eventos o clínicas vinculadas a Stripe
-- (borrarlos perdería el historial de pagos): en ese caso primero hay que exportar esa información. Re-ejecutable.
begin;
do $$ begin
  if to_regclass('public.pagos_suscripcion') is not null and (
       exists (select 1 from pagos_suscripcion) or exists (select 1 from stripe_eventos)
       or exists (select 1 from clinicas where stripe_customer_id is not null)
       or exists (select 1 from suscripciones where stripe_subscription_id is not null)) then
    raise exception 'rollback_114: ya hay datos de Stripe (cobros, eventos o vínculos). Exporta esa información antes de revertir.';
  end if;
end $$;
drop function if exists fn_stripe_datos_checkout(uuid, text, text);
drop function if exists fn_stripe_registrar_pago(text, text, text, text, text, text, bigint, text, timestamptz, timestamptz, text);
drop function if exists fn_stripe_sincronizar_suscripcion(text, text, uuid, text, text, text, text, timestamptz, boolean);
drop function if exists fn_stripe_vincular_cliente(uuid, text);
drop function if exists fn_stripe_plan_de_precio(text);
drop function if exists mi_cobro();
drop function if exists sa_configurar_stripe_plan(text, text, text);
drop table if exists pagos_suscripcion;
drop table if exists stripe_eventos;
drop index if exists idx_suscripciones_stripe;
alter table suscripciones drop column if exists stripe_subscription_id;
drop index if exists idx_clinicas_stripe_customer;
alter table clinicas drop column if exists stripe_customer_id;
drop index if exists idx_planes_stripe_price_mensual;
drop index if exists idx_planes_stripe_price_anual;
alter table planes_catalogo drop column if exists stripe_price_mensual, drop column if exists stripe_price_anual;
commit;
