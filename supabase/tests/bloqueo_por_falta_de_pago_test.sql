-- Migración 115: bloqueo automático por falta de pago (suspensión total tras vencimiento + gracia) y prueba desde el alta.
-- Datos sintéticos; todo con ROLLBACK.
\set ON_ERROR_STOP on
\set QUIET on
begin;
create temp table _res (ok boolean, nombre text);
create function pg_temp.t(p_nombre text, p_cond boolean) returns void language plpgsql as $$
begin insert into _res values (coalesce(p_cond,false), p_nombre); raise notice '% %', case when coalesce(p_cond,false) then 'PASS' else 'FAIL' end, p_nombre; end $$;
create function pg_temp.val(p_uid uuid, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin execute p_sql into v; reset role; return v;
  exception when others then reset role; return 'ERR|' || sqlstate || '|' || sqlerrm; end;
end $$;
create function pg_temp.srv(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  set local role service_role;
  begin execute p_sql into v; reset role; return v;
  exception when others then reset role; return 'ERR|' || sqlstate || '|' || sqlerrm; end;
end $$;
create function pg_temp.fin(p_cl uuid, p_fin date) returns void language sql as $$
  update suscripciones set fecha_fin = p_fin where clinica_id = p_cl and estado <> 'reemplazada' $$;

-- SA = superadmin (clínica A); OB = owner de B; RB = recepción de B
insert into auth.users (id, email) select ('a1150000-0000-0000-0000-0000000000'||lpad(g::text,2,'0'))::uuid, 'bp_'||g||'@x.mx' from generate_series(1,3) g;
insert into clinicas (id, nombre) values ('c1150000-0000-0000-0000-00000000000a','Plataforma'),('c1150000-0000-0000-0000-00000000000b','Clínica B');
select fn_asignar_plan_interno(null, 'c1150000-0000-0000-0000-00000000000a', 'esencial', 'mensual');
select fn_asignar_plan_interno(null, 'c1150000-0000-0000-0000-00000000000b', 'profesional', 'mensual', null, current_date, current_date + 14);
insert into usuarios (id, clinica_id, nombre, correo, rol, es_super_admin) values
 ('a1150000-0000-0000-0000-000000000001','c1150000-0000-0000-0000-00000000000a','Superadmin','bp_1@x.mx','owner',true),
 ('a1150000-0000-0000-0000-000000000002','c1150000-0000-0000-0000-00000000000b','Owner B','bp_2@x.mx','owner',false),
 ('a1150000-0000-0000-0000-000000000003','c1150000-0000-0000-0000-00000000000b','Recepción B','bp_3@x.mx','recepcion',false);
insert into pacientes (clinica_id, nombre_completo) values ('c1150000-0000-0000-0000-00000000000b', 'Paciente Sintético');
update planes_catalogo set stripe_price_mensual = 'price_ProM115' where plan = 'profesional';
\set SA '''a1150000-0000-0000-0000-000000000001'''
\set OB '''a1150000-0000-0000-0000-000000000002'''
\set RB '''a1150000-0000-0000-0000-000000000003'''
\set B '''c1150000-0000-0000-0000-00000000000b'''

-- 1. En prueba (vence en 14 días): sin bloqueo; checkout ofrece la prueba hasta su fecha de fin
select pg_temp.t('en prueba: el owner y la recepción ven sus pacientes',
  pg_temp.val(:OB, 'select count(*)::text from pacientes') = '1' and pg_temp.val(:RB, 'select count(*)::text from pacientes') = '1');
select pg_temp.t('en prueba: mi_suscripcion no bloqueada y sin pago automático',
  not (pg_temp.val(:OB, 'select mi_suscripcion()::text')::jsonb ->> 'bloqueada_por_pago')::boolean
  and not (pg_temp.val(:OB, 'select mi_suscripcion()::text')::jsonb ->> 'pago_automatico')::boolean);
select pg_temp.t('checkout en prueba: fin_prueba = fecha de fin (el primer cobro es al terminar la prueba)',
  pg_temp.srv(format('select fn_stripe_datos_checkout(%L, %L, %L)::text', :OB, 'profesional', 'mensual'))::jsonb ->> 'fin_prueba' = (current_date + 14)::text);

-- 2. Vencida pero dentro de la gracia (7 días): sin bloqueo
select pg_temp.fin(:B, current_date - 3);
select pg_temp.t('en gracia (venció hace 3 días): sin bloqueo', pg_temp.val(:OB, 'select count(*)::text from pacientes') = '1');

-- 3. Vencida tras la gracia: SUSPENSIÓN TOTAL por falta de pago
select pg_temp.fin(:B, current_date - 10);
select pg_temp.t('vencida: el owner ya NO ve pacientes (RLS como la suspensión manual)', pg_temp.val(:OB, 'select count(*)::text from pacientes') = '0');
select pg_temp.t('vencida: la recepción tampoco', pg_temp.val(:RB, 'select count(*)::text from pacientes') = '0');
select pg_temp.t('vencida: no puede crear pacientes',
  pg_temp.val(:OB, format('insert into pacientes (clinica_id, nombre_completo) values (%L, %L) returning 1', :B, 'Otro')) like 'ERR|%');
select pg_temp.t('vencida: mi_suscripcion avisa bloqueada_por_pago (para la pantalla de pago)',
  (pg_temp.val(:OB, 'select mi_suscripcion()::text')::jsonb ->> 'bloqueada_por_pago')::boolean);
select pg_temp.t('vencida: el owner SÍ puede ver mi_cobro y pagar (checkout no la rechaza; ya sin prueba)',
  pg_temp.val(:OB, 'select mi_cobro()::text') not like 'ERR|%'
  and pg_temp.srv(format('select fn_stripe_datos_checkout(%L, %L, %L)::text', :OB, 'profesional', 'mensual'))::jsonb ? 'price'
  and pg_temp.srv(format('select fn_stripe_datos_checkout(%L, %L, %L)::text', :OB, 'profesional', 'mensual'))::jsonb -> 'fin_prueba' = 'null'::jsonb);

-- 4. El interruptor lo desactiva al instante
update plataforma_config set valor = 'off' where clave = 'bloqueo_por_falta_de_pago';
select pg_temp.t('interruptor off: sin bloqueo', pg_temp.val(:OB, 'select count(*)::text from pacientes') = '1');
update plataforma_config set valor = 'on' where clave = 'bloqueo_por_falta_de_pago';

-- 4b. Falla abierta: si la configuración no se puede leer, no se bloquea a nadie
alter table plataforma_config rename to plataforma_config_oculta;
select set_config('t.abierta', fn_bloqueada_por_pago(:B)::text, true);
alter table plataforma_config_oculta rename to plataforma_config;
select pg_temp.t('falla abierta: con la clínica vencida, si la configuración no se puede leer, fn_bloqueada_por_pago no bloquea',
  current_setting('t.abierta') = 'false' and fn_bloqueada_por_pago(:B));

-- 5. Pagar desbloquea en el acto (el webhook mueve fecha_fin)
select pg_temp.srv(format('select fn_stripe_vincular_cliente(%L, %L)::text', :B, 'cus_B115'));
select pg_temp.srv(format('select fn_stripe_sincronizar_suscripcion(%L,%L,%L,%L,%L,%L,%L,%L,false)::text',
  'evt_115a','invoice.paid',:B,'cus_B115','sub_B115','price_ProM115','active', (current_date + 30)::timestamptz + interval '12 hours'));
select pg_temp.t('al pagar: el owner vuelve a ver sus pacientes, sin intervención', pg_temp.val(:OB, 'select count(*)::text from pacientes') = '1');
select pg_temp.t('al pagar: mi_suscripcion con pago automático y sin bloqueo',
  (pg_temp.val(:OB, 'select mi_suscripcion()::text')::jsonb ->> 'pago_automatico')::boolean
  and not (pg_temp.val(:OB, 'select mi_suscripcion()::text')::jsonb ->> 'bloqueada_por_pago')::boolean);

-- 6. Sin fecha de fin nunca vence; el superadmin nunca se bloquea; la suspensión manual sigue igual
select pg_temp.fin(:B, null);
select pg_temp.t('sin fecha de fin: nunca se bloquea', pg_temp.val(:OB, 'select count(*)::text from pacientes') = '1');
select pg_temp.fin('c1150000-0000-0000-0000-00000000000a', current_date - 30);
select pg_temp.t('superadmin con su clínica vencida: no se bloquea',
  pg_temp.val(:SA, 'select (auth_clinica_id() is not null)::text') = 'true');
update suscripciones set estado = 'suspendida' where clinica_id = :B and estado <> 'reemplazada';
update clinicas set estado = 'suspendida' where id = :B;
select pg_temp.t('suspensión manual: bloqueada y checkout la rechaza (como antes)',
  pg_temp.val(:OB, 'select count(*)::text from pacientes') = '0'
  and pg_temp.srv(format('select fn_stripe_datos_checkout(%L, %L, %L)::text', :OB, 'profesional', 'mensual')) like 'ERR|P0001|%suspendida%');

do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO 115: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 150), ' | ') from _res where not ok); end if;
end $$;
rollback;
