-- ============================================================
-- SIRO — 114: cobro automático de suscripciones con Stripe.
-- ------------------------------------------------------------
-- Modelo (sin cambiar cómo se aplican planes y límites, migraciones 075/082):
--  * Cada plan tiene, opcionalmente, el `price` de Stripe de su modalidad mensual y anual (planes_catalogo.stripe_price_*).
--    Lo configura el superadmin (sa_configurar_stripe_plan). Un plan sin price simplemente no se puede pagar en línea.
--  * La clínica paga con Stripe Checkout (Edge Function stripe-checkout) y administra tarjeta, cambio de plan y cancelación en el
--    portal de Stripe (stripe-portal). Stripe avisa por webhook (stripe-webhook, firma verificada) y SOLO esa función, con
--    service_role, llama a las funciones de abajo.
--  * Pagar = mover `fecha_fin` al final del período pagado (lo que 082 dejó previsto). Si el pago falla o se cancela, NO se
--    bloquea ni se borra nada: la suscripción llega a su fecha_fin y pasa a gracia → vencida (082). `suspendida` sigue siendo
--    una decisión MANUAL del superadmin: Stripe nunca suspende ni reactiva.
--  * El plan y la modalidad se deducen del `price` (dato del servidor), nunca de lo que mande el navegador.
--  * Idempotencia: cada evento de Stripe se registra una vez (stripe_eventos); un reintento no vuelve a aplicar nada.
--  * pagos_suscripcion: historial de cobros (pagados y fallidos) que ve el owner. Son registros de SIRO: si se elimina la
--    clínica se conservan sin vínculo (clinica_id → null) con el nombre de la clínica.
-- Requiere 075, 078 y 082. Re-ejecutable. Rollback: supabase/rollback/siro_v3/rollback_114.sql.
-- ============================================================
begin;

do $$ begin
  if to_regclass('public.suscripciones') is null or to_regclass('public.plataforma_config') is null
     or to_regprocedure('public.fn_estado_efectivo(text,date,date)') is null then
    raise exception '114 requiere 075, 078 y 082.';
  end if;
end $$;

-- ---------- 1. Columnas ----------
alter table planes_catalogo add column if not exists stripe_price_mensual text, add column if not exists stripe_price_anual text;
create unique index if not exists idx_planes_stripe_price_mensual on planes_catalogo (stripe_price_mensual) where stripe_price_mensual is not null;
create unique index if not exists idx_planes_stripe_price_anual on planes_catalogo (stripe_price_anual) where stripe_price_anual is not null;

alter table clinicas add column if not exists stripe_customer_id text;
create unique index if not exists idx_clinicas_stripe_customer on clinicas (stripe_customer_id) where stripe_customer_id is not null;
-- El owner solo puede actualizar las columnas que 029/064 le concedieron una por una; esta no está entre ellas.

alter table suscripciones add column if not exists stripe_subscription_id text;
create index if not exists idx_suscripciones_stripe on suscripciones (stripe_subscription_id) where stripe_subscription_id is not null;

-- ---------- 2. Tablas ----------
create table if not exists stripe_eventos (
  id text primary key,
  tipo text not null,
  resultado text,
  recibido_en timestamptz not null default now()
);
alter table stripe_eventos enable row level security;   -- sin políticas: nadie por la API
revoke all on stripe_eventos from anon, authenticated;

create table if not exists pagos_suscripcion (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid references clinicas(id) on delete set null,
  clinica_nombre text not null,
  stripe_invoice_id text not null unique,
  stripe_subscription_id text,
  estado text not null check (estado in ('pagado', 'fallido')),
  monto numeric(12,2) not null check (monto >= 0),
  moneda text not null,
  periodo_inicio date,
  periodo_fin date,
  url_comprobante text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_pagos_suscripcion_clinica on pagos_suscripcion (clinica_id, creado_en desc);
alter table pagos_suscripcion enable row level security;
revoke all on pagos_suscripcion from anon, authenticated;
grant select on pagos_suscripcion to authenticated;
drop policy if exists pagos_suscripcion_select on pagos_suscripcion;
create policy pagos_suscripcion_select on pagos_suscripcion for select to authenticated using (
  fn_es_super_admin() or (clinica_id = auth_clinica_id_raw() and auth_rol() = 'owner')
);
-- Como toda tabla con RLS (078): una sesión cerrada o excedida no lee nada.
do $$ declare t text;
begin
  foreach t in array array['stripe_eventos', 'pagos_suscripcion'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'sesion_activa_' || t) then
      execute format('create policy %I on public.%I as restrictive for all to authenticated using ((select fn_sesion_activa())) with check ((select fn_sesion_activa()))', 'sesion_activa_' || t, t);
    end if;
  end loop;
end $$;

-- ---------- 3. Configuración por el superadmin ----------
create or replace function sa_configurar_stripe_plan(p_plan text, p_price_mensual text, p_price_anual text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_m text := nullif(btrim(p_price_mensual), ''); v_a text := nullif(btrim(p_price_anual), '');
begin
  if not fn_es_super_admin() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  if not exists (select 1 from planes_catalogo where plan = p_plan) then raise exception 'El plan "%" no existe.', p_plan; end if;
  if (v_m is not null and v_m !~ '^price_[A-Za-z0-9]+$') or (v_a is not null and v_a !~ '^price_[A-Za-z0-9]+$') then
    raise exception 'El identificador de precio de Stripe debe empezar con price_.';
  end if;
  if v_m is not null and v_m = v_a then raise exception 'El precio mensual y el anual no pueden ser el mismo.'; end if;
  if exists (select 1 from planes_catalogo where plan <> p_plan and (stripe_price_mensual in (v_m, v_a) or stripe_price_anual in (v_m, v_a))) then
    raise exception 'Ese precio de Stripe ya está asignado a otro plan.';
  end if;
  update planes_catalogo set stripe_price_mensual = v_m, stripe_price_anual = v_a where plan = p_plan;
  perform fn_auditar_plan(auth.uid(), 'configurar_stripe_plan', 'planes_catalogo', null, null,
    jsonb_build_object('plan', p_plan, 'stripe_price_mensual', v_m, 'stripe_price_anual', v_a));
  return jsonb_build_object('plan', p_plan, 'stripe_price_mensual', v_m, 'stripe_price_anual', v_a);
end $$;
revoke all on function sa_configurar_stripe_plan(text, text, text) from public, anon;
grant execute on function sa_configurar_stripe_plan(text, text, text) to authenticated;

-- ---------- 4. Lo que ve el owner ----------
create or replace function mi_cobro() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_cl uuid := auth_clinica_id_raw(); v_sus suscripciones%rowtype;
begin
  if v_cl is null then return null; end if;
  if not (auth_rol() = 'owner' or fn_es_super_admin()) then raise exception 'Solo el propietario de la clínica administra el pago.' using errcode = '42501'; end if;
  select * into v_sus from suscripciones where clinica_id = v_cl and estado <> 'reemplazada';
  return jsonb_build_object(
    'disponible', exists (select 1 from planes_catalogo where activo and visible and (stripe_price_mensual is not null or stripe_price_anual is not null)),
    'tiene_cliente', (select stripe_customer_id is not null from clinicas where id = v_cl),
    'pago_automatico', v_sus.stripe_subscription_id is not null and coalesce(v_sus.auto_renovacion, false),
    'suspendida', coalesce(v_sus.estado, (select estado from clinicas where id = v_cl)) = 'suspendida',
    'planes', (select coalesce(jsonb_agg(jsonb_build_object('codigo', p.plan, 'nombre', p.nombre, 'descripcion', p.descripcion,
                 'precio_mensual', p.precio_mensual, 'precio_anual', p.precio_anual, 'moneda', p.moneda,
                 'pago_mensual', p.stripe_price_mensual is not null and p.permite_mensual,
                 'pago_anual', p.stripe_price_anual is not null and p.permite_anual) order by p.orden, p.plan), '[]'::jsonb)
               from planes_catalogo p where p.activo and p.visible),
    'pagos', (select coalesce(jsonb_agg(jsonb_build_object('estado', g.estado, 'monto', g.monto, 'moneda', g.moneda,
                 'periodo_inicio', g.periodo_inicio, 'periodo_fin', g.periodo_fin, 'url_comprobante', g.url_comprobante,
                 'fecha', g.creado_en) order by g.creado_en desc), '[]'::jsonb)
               from (select * from pagos_suscripcion where clinica_id = v_cl order by creado_en desc limit 24) g));
end $$;
revoke all on function mi_cobro() from public, anon;
grant execute on function mi_cobro() to authenticated;

-- ---------- 5. Funciones del webhook (solo service_role) ----------
-- Precio de Stripe → (plan, modalidad). Null si el price no es de ningún plan.
create or replace function fn_stripe_plan_de_precio(p_price text) returns table (plan text, modalidad text)
language sql stable security definer set search_path = public as $$
  select plan, 'mensual' from planes_catalogo where stripe_price_mensual = p_price
  union all
  select plan, 'anual' from planes_catalogo where stripe_price_anual = p_price
$$;
revoke all on function fn_stripe_plan_de_precio(text) from public, anon, authenticated;

-- Vincula la clínica con su cliente de Stripe (lo llama stripe-checkout al crear el cliente).
create or replace function fn_stripe_vincular_cliente(p_clinica uuid, p_customer text) returns void
language plpgsql security definer set search_path = public as $$
declare v_actual text;
begin
  if p_customer is null or p_customer !~ '^cus_[A-Za-z0-9]+$' then raise exception 'Cliente de Stripe inválido.'; end if;
  select stripe_customer_id into v_actual from clinicas where id = p_clinica for update;
  if not found then raise exception 'La clínica no existe.'; end if;
  if v_actual is not null and v_actual <> p_customer then raise exception 'La clínica ya tiene otro cliente de Stripe.' using hint = 'STRIPE_CLIENTE_DISTINTO'; end if;
  update clinicas set stripe_customer_id = p_customer where id = p_clinica and stripe_customer_id is null;
end $$;
revoke all on function fn_stripe_vincular_cliente(uuid, text) from public, anon, authenticated;
grant execute on function fn_stripe_vincular_cliente(uuid, text) to service_role;

-- Aplica el estado ACTUAL de una suscripción de Stripe (la Edge Function la vuelve a leer de Stripe, así que el orden de los
-- eventos no importa). Devuelve { resultado }.
create or replace function fn_stripe_sincronizar_suscripcion(
  p_evento text, p_tipo text, p_clinica uuid, p_customer text, p_subscription text, p_price text,
  p_status text, p_periodo_fin timestamptz, p_cancela_al_final boolean
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cl clinicas%rowtype; v_sus suscripciones%rowtype; v_plan text; v_mod text; v_fin date; v_res text; v_nueva jsonb;
  v_pagada boolean := p_status in ('active', 'trialing');
begin
  insert into stripe_eventos (id, tipo) values (p_evento, p_tipo) on conflict (id) do nothing;
  if not found then return jsonb_build_object('resultado', 'duplicado'); end if;

  -- La clínica viene en la metadata que puso stripe-checkout; si falta, se busca por el cliente de Stripe ya vinculado.
  if p_clinica is null then select id into p_clinica from clinicas where stripe_customer_id = p_customer; end if;
  select * into v_cl from clinicas where id = p_clinica for update;
  if not found then v_res := 'clinica_inexistente';
  elsif v_cl.stripe_customer_id is not null and v_cl.stripe_customer_id <> p_customer then v_res := 'cliente_distinto';
  else
    if v_cl.stripe_customer_id is null then perform fn_stripe_vincular_cliente(p_clinica, p_customer); end if;
    select f.plan, f.modalidad into v_plan, v_mod from fn_stripe_plan_de_precio(p_price) f limit 1;
    select * into v_sus from suscripciones where clinica_id = p_clinica and estado <> 'reemplazada' for update;
    v_fin := (p_periodo_fin at time zone 'America/Mexico_City')::date;

    if v_plan is null then
      v_res := 'precio_desconocido';
    elsif p_status in ('canceled', 'incomplete_expired') then
      -- Cancelada: deja de renovarse; lo pagado sigue vigente hasta su fecha_fin.
      update suscripciones set auto_renovacion = false, updated_at = now()
       where id = v_sus.id and stripe_subscription_id is not distinct from p_subscription;
      v_res := 'cancelada';
    elsif not v_pagada then
      -- past_due, unpaid, incomplete, paused: no se extiende nada (082 se encarga de gracia → vencida).
      v_res := 'sin_cambios_' || p_status;
    elsif v_sus.id is null or v_sus.plan <> v_plan or v_sus.modalidad <> v_mod then
      v_nueva := fn_asignar_plan_interno(null, p_clinica, v_plan, v_mod, null, current_date, v_fin, not coalesce(p_cancela_al_final, false));
      update suscripciones set stripe_subscription_id = p_subscription where id = (v_nueva ->> 'suscripcion_id')::uuid;
      v_res := 'plan_aplicado';
    else
      update suscripciones set fecha_fin = greatest(coalesce(fecha_fin, v_fin), v_fin), stripe_subscription_id = p_subscription,
             auto_renovacion = not coalesce(p_cancela_al_final, false), updated_at = now()
       where id = v_sus.id returning * into v_sus;
      update clinicas set fecha_vencimiento = v_sus.fecha_fin where id = p_clinica;
      v_res := 'renovada';
    end if;
  end if;

  update stripe_eventos set resultado = v_res where id = p_evento;
  perform fn_auditar_plan(null, 'stripe_suscripcion', 'suscripciones', null, p_clinica,
    jsonb_build_object('evento', p_evento, 'tipo', p_tipo, 'resultado', v_res, 'status', p_status, 'plan', v_plan, 'modalidad', v_mod,
                       'fecha_fin', v_fin, 'cancela_al_final', p_cancela_al_final));
  return jsonb_build_object('resultado', v_res);
end $$;
revoke all on function fn_stripe_sincronizar_suscripcion(text, text, uuid, text, text, text, text, timestamptz, boolean) from public, anon, authenticated;
grant execute on function fn_stripe_sincronizar_suscripcion(text, text, uuid, text, text, text, text, timestamptz, boolean) to service_role;

-- Registra un cobro (factura de Stripe pagada o fallida). El monto llega en centavos.
create or replace function fn_stripe_registrar_pago(
  p_evento text, p_tipo text, p_customer text, p_subscription text, p_invoice text, p_estado text,
  p_monto_centavos bigint, p_moneda text, p_periodo_inicio timestamptz, p_periodo_fin timestamptz, p_url text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cl clinicas%rowtype; v_res text;
begin
  insert into stripe_eventos (id, tipo) values (p_evento, p_tipo) on conflict (id) do nothing;
  if not found then return jsonb_build_object('resultado', 'duplicado'); end if;
  if p_estado not in ('pagado', 'fallido') then raise exception 'Estado de pago inválido.'; end if;

  select * into v_cl from clinicas where stripe_customer_id = p_customer;
  if not found then
    v_res := 'cliente_desconocido';
  else
    insert into pagos_suscripcion (clinica_id, clinica_nombre, stripe_invoice_id, stripe_subscription_id, estado, monto, moneda,
                                   periodo_inicio, periodo_fin, url_comprobante)
    values (v_cl.id, v_cl.nombre, p_invoice, p_subscription, p_estado, greatest(coalesce(p_monto_centavos, 0), 0) / 100.0, upper(p_moneda),
            (p_periodo_inicio at time zone 'America/Mexico_City')::date, (p_periodo_fin at time zone 'America/Mexico_City')::date, p_url)
    on conflict (stripe_invoice_id) do update
      -- Un pago fallido que luego se cobra pasa a pagado; uno pagado nunca vuelve a fallido.
      set estado = case when pagos_suscripcion.estado = 'pagado' then 'pagado' else excluded.estado end,
          monto = excluded.monto, url_comprobante = coalesce(excluded.url_comprobante, pagos_suscripcion.url_comprobante),
          actualizado_en = now();
    v_res := 'registrado_' || p_estado;
  end if;
  update stripe_eventos set resultado = v_res where id = p_evento;
  return jsonb_build_object('resultado', v_res);
end $$;
revoke all on function fn_stripe_registrar_pago(text, text, text, text, text, text, bigint, text, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function fn_stripe_registrar_pago(text, text, text, text, text, text, bigint, text, timestamptz, timestamptz, text) to service_role;

-- Datos que necesita stripe-checkout, validados en la base (owner de la clínica, plan pagable).
create or replace function fn_stripe_datos_checkout(p_usuario uuid, p_plan text, p_modalidad text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_u usuarios%rowtype; v_p planes_catalogo%rowtype; v_cl clinicas%rowtype; v_sus suscripciones%rowtype; v_price text;
begin
  select * into v_u from usuarios where id = p_usuario;
  if not found or v_u.rol <> 'owner' then raise exception 'Solo el propietario de la clínica puede contratar o pagar el plan.' using hint = 'NO_AUTORIZADO'; end if;
  select * into v_cl from clinicas where id = v_u.clinica_id;
  select * into v_sus from suscripciones where clinica_id = v_cl.id and estado <> 'reemplazada';
  if coalesce(v_sus.estado, v_cl.estado) = 'suspendida' then
    raise exception 'La clínica está suspendida. Contacta al administrador de SIRO.' using hint = 'CLINICA_SUSPENDIDA';
  end if;
  if v_sus.stripe_subscription_id is not null and v_sus.auto_renovacion then
    raise exception 'Tu clínica ya tiene el pago automático activo. Cambia de plan o de tarjeta en «Administrar pago».' using hint = 'YA_TIENE_PAGO';
  end if;
  select * into v_p from planes_catalogo where plan = p_plan and activo and visible;
  if not found then raise exception 'Ese plan no está disponible.' using hint = 'PLAN_NO_DISPONIBLE'; end if;
  v_price := case p_modalidad when 'mensual' then case when v_p.permite_mensual then v_p.stripe_price_mensual end
                              when 'anual' then case when v_p.permite_anual then v_p.stripe_price_anual end end;
  if v_price is null then raise exception 'Ese plan no se puede pagar en línea en esa modalidad.' using hint = 'PLAN_SIN_PAGO_EN_LINEA'; end if;
  return jsonb_build_object('clinica_id', v_cl.id, 'clinica_nombre', v_cl.nombre, 'correo', v_u.correo,
                            'stripe_customer_id', v_cl.stripe_customer_id, 'price', v_price);
end $$;
revoke all on function fn_stripe_datos_checkout(uuid, text, text) from public, anon, authenticated;
grant execute on function fn_stripe_datos_checkout(uuid, text, text) to service_role;

commit;
