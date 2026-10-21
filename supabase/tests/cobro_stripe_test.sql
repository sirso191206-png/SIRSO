-- Migración 114: cobro de suscripciones con Stripe. Datos sintéticos; todo con ROLLBACK.
\set ON_ERROR_STOP on
\set QUIET on
begin;
create temp table _res (ok boolean, nombre text);
create function pg_temp.t(p_nombre text, p_cond boolean) returns void language plpgsql as $$
begin insert into _res values (coalesce(p_cond,false), p_nombre); raise notice '% %', case when coalesce(p_cond,false) then 'PASS' else 'FAIL' end, p_nombre; end $$;
-- Ejecuta p_sql como el usuario indicado (rol authenticated) y devuelve el valor o 'ERR|sqlstate|mensaje'
create function pg_temp.val(p_uid uuid, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin execute p_sql into v; reset role; return v;
  exception when others then reset role; return 'ERR|' || sqlstate || '|' || sqlerrm; end;
end $$;
-- Igual, como service_role (lo que usan las Edge Functions)
create function pg_temp.srv(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  set local role service_role;
  begin execute p_sql into v; reset role; return v;
  exception when others then reset role; return 'ERR|' || sqlstate || '|' || sqlerrm; end;
end $$;
create function pg_temp.vig(p_cl uuid) returns suscripciones language sql as $$
  select * from suscripciones where clinica_id = p_cl and estado <> 'reemplazada' $$;

-- SA = superadmin (clínica A, plataforma); OB = owner de B; RB = recepción de B; OC = owner de C
insert into auth.users (id, email) select ('a1140000-0000-0000-0000-0000000000'||lpad(g::text,2,'0'))::uuid, 'st_'||g||'@x.mx' from generate_series(1,4) g;
insert into clinicas (id, nombre) values ('c1140000-0000-0000-0000-00000000000a','Plataforma'),('c1140000-0000-0000-0000-00000000000b','Clínica B'),('c1140000-0000-0000-0000-00000000000c','Clínica C');
select fn_asignar_plan_interno(null, c, 'esencial', 'mensual', null, current_date, current_date + 3) from unnest(array['c1140000-0000-0000-0000-00000000000a','c1140000-0000-0000-0000-00000000000c']::uuid[]) c;
select fn_asignar_plan_interno(null, 'c1140000-0000-0000-0000-00000000000b', 'profesional', 'mensual', null, current_date, current_date + 3);
insert into usuarios (id, clinica_id, nombre, correo, rol, es_super_admin) values
 ('a1140000-0000-0000-0000-000000000001','c1140000-0000-0000-0000-00000000000a','Superadmin','st_1@x.mx','owner',true),
 ('a1140000-0000-0000-0000-000000000002','c1140000-0000-0000-0000-00000000000b','Owner B','st_2@x.mx','owner',false),
 ('a1140000-0000-0000-0000-000000000003','c1140000-0000-0000-0000-00000000000b','Recepción B','st_3@x.mx','recepcion',false),
 ('a1140000-0000-0000-0000-000000000004','c1140000-0000-0000-0000-00000000000c','Owner C','st_4@x.mx','owner',false);
\set SA '''a1140000-0000-0000-0000-000000000001'''
\set OB '''a1140000-0000-0000-0000-000000000002'''
\set RB '''a1140000-0000-0000-0000-000000000003'''
\set OC '''a1140000-0000-0000-0000-000000000004'''
\set B '''c1140000-0000-0000-0000-00000000000b'''
\set C '''c1140000-0000-0000-0000-00000000000c'''

-- 1. Configuración de precios (solo superadmin)
select pg_temp.t('superadmin configura los price de Esencial',
  pg_temp.val(:SA, $q$select sa_configurar_stripe_plan('esencial', 'price_EsenM', 'price_EsenA')::text$q$) not like 'ERR|%');
select pg_temp.t('superadmin configura Profesional (solo mensual)',
  pg_temp.val(:SA, $q$select sa_configurar_stripe_plan('profesional', 'price_ProM', null)::text$q$) not like 'ERR|%');
select pg_temp.t('un owner NO puede configurar precios (42501)',
  pg_temp.val(:OB, $q$select sa_configurar_stripe_plan('esencial', 'price_X', null)::text$q$) like 'ERR|42501|%');
select pg_temp.t('formato inválido rechazado',
  pg_temp.val(:SA, $q$select sa_configurar_stripe_plan('clinica', 'prod_123', null)::text$q$) like 'ERR|P0001|%price_%');
select pg_temp.t('un price ya usado por otro plan se rechaza',
  pg_temp.val(:SA, $q$select sa_configurar_stripe_plan('clinica', 'price_EsenM', null)::text$q$) like 'ERR|P0001|%otro plan%');

-- 2. Lo que ve el owner
create temp table _mc as select pg_temp.val(:OB, 'select mi_cobro()::text')::jsonb v;
select pg_temp.t('mi_cobro: disponible y sin pago automático todavía',
  (select (v->>'disponible')::boolean and not (v->>'pago_automatico')::boolean and not (v->>'tiene_cliente')::boolean from _mc));
select pg_temp.t('mi_cobro: Esencial pagable mensual y anual; Profesional solo mensual; Clínica no pagable',
  (select (select (p->>'pago_mensual')::boolean and (p->>'pago_anual')::boolean from jsonb_array_elements(v->'planes') p where p->>'codigo' = 'esencial')
      and (select (p->>'pago_mensual')::boolean and not (p->>'pago_anual')::boolean from jsonb_array_elements(v->'planes') p where p->>'codigo' = 'profesional')
      and (select not (p->>'pago_mensual')::boolean from jsonb_array_elements(v->'planes') p where p->>'codigo' = 'clinica') from _mc));
select pg_temp.t('mi_cobro: recepción NO lo ve (42501)', pg_temp.val(:RB, 'select mi_cobro()::text') like 'ERR|42501|%');

-- 3. Datos para Checkout (los pide la Edge Function con service_role)
select pg_temp.t('checkout: el owner obtiene el price del servidor',
  pg_temp.srv(format('select fn_stripe_datos_checkout(%L, %L, %L)::text', :OB, 'profesional', 'mensual'))::jsonb ->> 'price' = 'price_ProM');
select pg_temp.t('checkout: recepción no puede contratar',
  pg_temp.srv(format('select fn_stripe_datos_checkout(%L, %L, %L)::text', :RB, 'esencial', 'mensual')) like 'ERR|P0001|Solo el propietario%');
select pg_temp.t('checkout: modalidad sin price se rechaza',
  pg_temp.srv(format('select fn_stripe_datos_checkout(%L, %L, %L)::text', :OB, 'profesional', 'anual')) like 'ERR|P0001|%en línea%');
select pg_temp.t('un usuario autenticado NO puede llamar las funciones del webhook (42501)',
  pg_temp.val(:OB, format('select fn_stripe_sincronizar_suscripcion(%L,%L,%L,%L,%L,%L,%L,now(),false)::text', 'evt_x','t',:B,'cus_B','sub_B','price_EsenM','active')) like 'ERR|42501|%'
  and pg_temp.val(:OB, format('select fn_stripe_datos_checkout(%L,%L,%L)::text', :OB, 'esencial', 'mensual')) like 'ERR|42501|%');
select pg_temp.t('el owner NO puede escribir su stripe_customer_id directamente',
  pg_temp.val(:OB, format('update clinicas set stripe_customer_id = %L where id = %L returning 1', 'cus_falso', :B)) like 'ERR|42501|%');
select pg_temp.srv(format('select fn_stripe_vincular_cliente(%L, %L)::text', :B, 'cus_B'));
select pg_temp.t('vincular cliente guarda el customer', (select stripe_customer_id from clinicas where id = :B) = 'cus_B');
select pg_temp.t('vincular OTRO customer a la misma clínica se rechaza',
  pg_temp.srv(format('select fn_stripe_vincular_cliente(%L, %L)::text', :B, 'cus_Otro')) like 'ERR|P0001|%otro cliente%');

-- 4. Renovación (mismo plan): fecha_fin pasa al final del período pagado
create temp table _r1 as select pg_temp.srv(format('select fn_stripe_sincronizar_suscripcion(%L,%L,%L,%L,%L,%L,%L,%L,false)::text',
  'evt_1','customer.subscription.updated',:B,'cus_B','sub_B','price_ProM','active', (current_date + 33)::timestamptz + interval '12 hours'))::jsonb r;
select pg_temp.t('renovada: resultado', (select r->>'resultado' from _r1) = 'renovada');
select pg_temp.t('renovada: fecha_fin = fin del período, vínculo a Stripe y espejo en clinicas',
  (pg_temp.vig(:B)).fecha_fin = current_date + 33 and (pg_temp.vig(:B)).stripe_subscription_id = 'sub_B'
  and (select fecha_vencimiento from clinicas where id = :B) = current_date + 33);
select pg_temp.t('mismo evento otra vez: duplicado, sin aplicar de nuevo',
  pg_temp.srv(format('select fn_stripe_sincronizar_suscripcion(%L,%L,%L,%L,%L,%L,%L,%L,false)::text',
    'evt_1','customer.subscription.updated',:B,'cus_B','sub_B','price_ProM','active', (current_date + 99)::timestamptz))::jsonb->>'resultado' = 'duplicado'
  and (pg_temp.vig(:B)).fecha_fin = current_date + 33);
select pg_temp.t('mi_cobro: ahora pago automático activo y checkout se niega (YA_TIENE_PAGO)',
  (pg_temp.val(:OB, 'select mi_cobro()::text')::jsonb ->> 'pago_automatico')::boolean
  and pg_temp.srv(format('select fn_stripe_datos_checkout(%L, %L, %L)::text', :OB, 'esencial', 'mensual')) like 'ERR|P0001|%ya tiene el pago automático%');

-- 5. Pago vencido: no se extiende nada
select pg_temp.srv(format('select fn_stripe_sincronizar_suscripcion(%L,%L,%L,%L,%L,%L,%L,%L,false)::text',
  'evt_2','customer.subscription.updated',:B,'cus_B','sub_B','price_ProM','past_due', (current_date + 63)::timestamptz));
select pg_temp.t('past_due: fecha_fin NO cambia', (pg_temp.vig(:B)).fecha_fin = current_date + 33);

-- 6. Cambio de plan desde el portal (nuevo price) → snapshot del plan nuevo
select pg_temp.srv(format('select fn_stripe_sincronizar_suscripcion(%L,%L,%L,%L,%L,%L,%L,%L,false)::text',
  'evt_3','customer.subscription.updated',:B,'cus_B','sub_B','price_EsenM','active', (current_date + 40)::timestamptz + interval '12 hours'));
select pg_temp.t('cambio de plan: vigente = esencial mensual, con límites del plan y vinculada a Stripe',
  (pg_temp.vig(:B)).plan = 'esencial' and (pg_temp.vig(:B)).modalidad = 'mensual' and (pg_temp.vig(:B)).fecha_fin = current_date + 40
  and (pg_temp.vig(:B)).stripe_subscription_id = 'sub_B'
  and (select max_usuarios from suscripcion_limites where suscripcion_id = (pg_temp.vig(:B)).id) = (select max_usuarios from planes_catalogo where plan = 'esencial')
  and exists (select 1 from suscripciones where clinica_id = :B and estado = 'reemplazada' and plan = 'profesional'));

-- 7. Cancelación al final del período y cancelación definitiva
select pg_temp.srv(format('select fn_stripe_sincronizar_suscripcion(%L,%L,%L,%L,%L,%L,%L,%L,true)::text',
  'evt_4','customer.subscription.updated',:B,'cus_B','sub_B','price_EsenM','active', (current_date + 40)::timestamptz + interval '12 hours'));
select pg_temp.t('cancelar al final del período: deja de renovarse, lo pagado sigue', not (pg_temp.vig(:B)).auto_renovacion and (pg_temp.vig(:B)).fecha_fin = current_date + 40);
select pg_temp.srv(format('select fn_stripe_sincronizar_suscripcion(%L,%L,%L,%L,%L,%L,%L,%L,false)::text',
  'evt_5','customer.subscription.deleted',:B,'cus_B','sub_B','price_EsenM','canceled', (current_date + 40)::timestamptz + interval '12 hours'));
select pg_temp.t('cancelada: sin renovación, fecha_fin intacta, estado sin tocar (no se suspende)',
  not (pg_temp.vig(:B)).auto_renovacion and (pg_temp.vig(:B)).fecha_fin = current_date + 40 and (pg_temp.vig(:B)).estado = 'activa');

select pg_temp.t('sin clinica_id en la metadata: se encuentra la clínica por su customer',
  pg_temp.srv(format('select fn_stripe_sincronizar_suscripcion(%L,%L,%s,%L,%L,%L,%L,%L,false)::text',
    'evt_5b','customer.subscription.deleted','null','cus_B','sub_B','price_EsenM','canceled', (current_date + 40)::timestamptz))::jsonb->>'resultado' = 'cancelada');

-- 8. Casos que NO deben cambiar nada
select pg_temp.srv(format('select fn_stripe_vincular_cliente(%L, %L)::text', :C, 'cus_C'));
select pg_temp.t('customer que no es de la clínica: cliente_distinto, sin cambios',
  pg_temp.srv(format('select fn_stripe_sincronizar_suscripcion(%L,%L,%L,%L,%L,%L,%L,%L,false)::text',
    'evt_6','customer.subscription.updated',:C,'cus_B','sub_B','price_EsenM','active', (current_date + 90)::timestamptz))::jsonb->>'resultado' = 'cliente_distinto'
  and (pg_temp.vig(:C)).fecha_fin = current_date + 3);
select pg_temp.t('price desconocido: precio_desconocido, sin cambios',
  pg_temp.srv(format('select fn_stripe_sincronizar_suscripcion(%L,%L,%L,%L,%L,%L,%L,%L,false)::text',
    'evt_7','customer.subscription.updated',:C,'cus_C','sub_C','price_Nada','active', (current_date + 90)::timestamptz))::jsonb->>'resultado' = 'precio_desconocido'
  and (pg_temp.vig(:C)).fecha_fin = current_date + 3);
update suscripciones set estado = 'suspendida' where clinica_id = :C and estado <> 'reemplazada';
select pg_temp.srv(format('select fn_stripe_sincronizar_suscripcion(%L,%L,%L,%L,%L,%L,%L,%L,false)::text',
  'evt_8','customer.subscription.updated',:C,'cus_C','sub_C','price_EsenA','active', (current_date + 365)::timestamptz));
select pg_temp.t('clínica suspendida: el pago la deja suspendida (cambio a anual registrado)',
  (pg_temp.vig(:C)).estado = 'suspendida' and (pg_temp.vig(:C)).modalidad = 'anual');
select pg_temp.t('checkout de una clínica suspendida se rechaza',
  pg_temp.srv(format('select fn_stripe_datos_checkout(%L, %L, %L)::text', :OC, 'esencial', 'mensual')) like 'ERR|P0001|%suspendida%');

-- 9. Registro de cobros
select pg_temp.srv(format('select fn_stripe_registrar_pago(%L,%L,%L,%L,%L,%L,%s,%L,%L,%L,%L)::text',
  'evt_9','invoice.payment_failed','cus_B','sub_B','in_1','fallido', 99900, 'mxn', now(), now() + interval '30 days', null));
select pg_temp.srv(format('select fn_stripe_registrar_pago(%L,%L,%L,%L,%L,%L,%s,%L,%L,%L,%L)::text',
  'evt_10','invoice.paid','cus_B','sub_B','in_1','pagado', 99900, 'mxn', now(), now() + interval '30 days', 'https://pay.stripe.com/r/1'));
select pg_temp.srv(format('select fn_stripe_registrar_pago(%L,%L,%L,%L,%L,%L,%s,%L,%L,%L,%L)::text',
  'evt_11','invoice.payment_failed','cus_B','sub_B','in_1','fallido', 99900, 'mxn', now(), now() + interval '30 days', null));
select pg_temp.t('cobro: fallido → pagado; un pagado no vuelve a fallido; monto en pesos y MXN',
  (select count(*) = 1 and min(estado) = 'pagado' and min(monto) = 999.00 and min(moneda) = 'MXN' and min(url_comprobante) like 'https://%'
     from pagos_suscripcion where stripe_invoice_id = 'in_1'));
select pg_temp.t('cobro de un customer desconocido: no se registra',
  pg_temp.srv(format('select fn_stripe_registrar_pago(%L,%L,%L,%L,%L,%L,%s,%L,%L,%L,%L)::text',
    'evt_12','invoice.paid','cus_Nadie','sub_X','in_2','pagado', 100, 'mxn', now(), now(), null))::jsonb->>'resultado' = 'cliente_desconocido'
  and not exists (select 1 from pagos_suscripcion where stripe_invoice_id = 'in_2'));
select pg_temp.t('RLS: el owner de B ve su cobro; el owner de C y la recepción de B no',
  pg_temp.val(:OB, 'select count(*)::text from pagos_suscripcion') = '1'
  and pg_temp.val(:OC, 'select count(*)::text from pagos_suscripcion') = '0'
  and pg_temp.val(:RB, 'select count(*)::text from pagos_suscripcion') = '0');
select pg_temp.t('mi_cobro muestra el historial al owner', jsonb_array_length(pg_temp.val(:OB, 'select mi_cobro()::text')::jsonb -> 'pagos') = 1);
select pg_temp.t('stripe_eventos no es legible por usuarios', pg_temp.val(:OB, 'select count(*)::text from stripe_eventos') like 'ERR|42501|%');

do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO 114: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 150), ' | ') from _res where not ok); end if;
end $$;
rollback;
