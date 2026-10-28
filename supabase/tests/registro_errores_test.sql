-- Migración 116: registro de errores. Datos sintéticos; todo con ROLLBACK.
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

insert into auth.users (id, email) select ('a1160000-0000-0000-0000-0000000000'||lpad(g::text,2,'0'))::uuid, 'er_'||g||'@x.mx' from generate_series(1,2) g;
insert into clinicas (id, nombre) values ('c1160000-0000-0000-0000-00000000000a','Plataforma'),('c1160000-0000-0000-0000-00000000000b','Clínica B');
select fn_asignar_plan_interno(null, c, 'esencial', 'mensual') from unnest(array['c1160000-0000-0000-0000-00000000000a','c1160000-0000-0000-0000-00000000000b']::uuid[]) c;
insert into usuarios (id, clinica_id, nombre, correo, rol, es_super_admin) values
 ('a1160000-0000-0000-0000-000000000001','c1160000-0000-0000-0000-00000000000a','Superadmin','er_1@x.mx','owner',true),
 ('a1160000-0000-0000-0000-000000000002','c1160000-0000-0000-0000-00000000000b','Owner B','er_2@x.mx','owner',false);
\set SA '''a1160000-0000-0000-0000-000000000001'''
\set OB '''a1160000-0000-0000-0000-000000000002'''

-- (la comprobación va en una sentencia APARTE: una sentencia no ve lo que escribe la función llamada dentro de ella)
select set_config('t.r1', coalesce(pg_temp.val(:OB, format('select fn_registrar_error_cliente(%L, %L, %L, %L)::text', '/agenda', repeat('x', 900), 'pila', 'abc123')), 'ok'), true);
select pg_temp.t('un usuario registra un error del navegador (con su clínica, recortado)',
  current_setting('t.r1') not like 'ERR|%'
  and (select length(mensaje) = 500 and clinica_id = 'c1160000-0000-0000-0000-00000000000b' and origen = 'frontend' from errores_app where usuario_id = :OB));
select pg_temp.t('el owner NO puede leer el registro de errores (ni el suyo)', pg_temp.val(:OB, 'select count(*)::text from errores_app') = '0');
select pg_temp.t('el owner NO puede escribir directo en la tabla', pg_temp.val(:OB, $q$insert into errores_app (origen, mensaje) values ('frontend', 'falso') returning 1$q$) like 'ERR|42501|%');
select pg_temp.t('el owner NO puede usar sa_errores_app (42501)', pg_temp.val(:OB, 'select sa_errores_app()::text') like 'ERR|42501|%');
select pg_temp.t('el superadmin lo ve, con el nombre de la clínica',
  pg_temp.val(:SA, 'select sa_errores_app()::text')::jsonb -> 0 ->> 'clinica_nombre' = 'Clínica B');
select pg_temp.val(:OB, format('select fn_registrar_error_cliente(%L, %L)::text', '/x', 'bucle')) from generate_series(1, 40);
select pg_temp.t('límite: como máximo 30 errores por usuario y hora', (select count(*) from errores_app where usuario_id = :OB) = 30);
select pg_temp.t('sin sesión no se registra nada', pg_temp.val(null, $q$select fn_registrar_error_cliente('/x', 'anon')::text$q$) is not null
  and not exists (select 1 from errores_app where mensaje = 'anon'));
-- Alertas de Edge Functions
insert into errores_app (origen, gravedad, ruta, mensaje) values ('edge', 'critico', 'stripe-webhook', 'fallo 1');
select pg_temp.t('primer crítico de una función: no hay alerta reciente (se manda el correo)', not (pg_temp.srv($q$select fn_alerta_reciente('stripe-webhook')::text$q$))::boolean);
insert into errores_app (origen, gravedad, ruta, mensaje) values ('edge', 'critico', 'stripe-webhook', 'fallo 2');
select pg_temp.t('segundo crítico en 30 min: ya hubo alerta (no se repite el correo)', (pg_temp.srv($q$select fn_alerta_reciente('stripe-webhook')::text$q$))::boolean);
select pg_temp.t('fn_alerta_reciente no es invocable por usuarios', pg_temp.val(:OB, $q$select fn_alerta_reciente('x')::text$q$) like 'ERR|42501|%');

do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO 116: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 150), ' | ') from _res where not ok); end if;
end $$;
rollback;
