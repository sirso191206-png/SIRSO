-- Migración 112 (H26): la dentista da de alta pacientes con INSERT … RETURNING (como PostgREST con select=*) y solo ve los suyos.
-- Antes de la 112 la primera prueba falla con 42501 (la fila nueva no pasa pacientes_select dentro del RETURNING).
\set ON_ERROR_STOP on
\set QUIET on
begin;
create temp table _res (ok boolean, nombre text);
create function pg_temp.t(p_nombre text, p_cond boolean) returns void language plpgsql as $$
begin insert into _res values (coalesce(p_cond,false), p_nombre); raise notice '% %', case when coalesce(p_cond,false) then 'PASS' else 'FAIL' end, p_nombre; end $$;
-- Ejecuta p_sql como ese usuario y devuelve el primer valor, o 'ERR|sqlstate'
create function pg_temp.val(p_uid uuid, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin execute p_sql into v; reset role; return v;
  exception when others then reset role; return 'ERR|'||sqlstate; end;
end $$;

insert into auth.users (id, email) select ('a7000000-0000-0000-0000-0000000000'||lpad(g::text,2,'0'))::uuid, 'ad'||g||'@x.mx' from generate_series(1,7) g;
insert into clinicas (id, nombre) values ('c7000000-0000-0000-0000-00000000000a','A'),('c7000000-0000-0000-0000-00000000000b','B');
select fn_asignar_plan_interno(null, c, 'empresarial', 'mensual') from unnest(array['c7000000-0000-0000-0000-00000000000a','c7000000-0000-0000-0000-00000000000b']::uuid[]) c;
insert into usuarios (id, clinica_id, nombre, correo, rol) values
 ('a7000000-0000-0000-0000-000000000001','c7000000-0000-0000-0000-00000000000a','Owner A','ad1@x.mx','owner'),
 ('a7000000-0000-0000-0000-000000000002','c7000000-0000-0000-0000-00000000000a','Dentista A','ad2@x.mx','dentista'),
 ('a7000000-0000-0000-0000-000000000003','c7000000-0000-0000-0000-00000000000a','Dentista A2','ad3@x.mx','dentista'),
 ('a7000000-0000-0000-0000-000000000004','c7000000-0000-0000-0000-00000000000a','Recepción A','ad4@x.mx','recepcion'),
 ('a7000000-0000-0000-0000-000000000005','c7000000-0000-0000-0000-00000000000a','Asistente de Dentista A','ad5@x.mx','asistente'),
 ('a7000000-0000-0000-0000-000000000006','c7000000-0000-0000-0000-00000000000a','Asistente sin asignar','ad6@x.mx','asistente'),
 ('a7000000-0000-0000-0000-000000000007','c7000000-0000-0000-0000-00000000000b','Owner B','ad7@x.mx','owner');
insert into asistente_dentista_asignaciones (clinica_id, asistente_id, dentista_id) values ('c7000000-0000-0000-0000-00000000000a','a7000000-0000-0000-0000-000000000005','a7000000-0000-0000-0000-000000000002');
-- Un paciente PREVIO de la otra dentista (A2)
insert into pacientes (id, clinica_id, nombre_completo, dentista_responsable_id) values
 ('b7000000-0000-0000-0000-0000000000a2','c7000000-0000-0000-0000-00000000000a','Paciente de A2','a7000000-0000-0000-0000-000000000003');

-- 1. Alta como la aplicación (INSERT … RETURNING) por la dentista
select pg_temp.t('112-1 la dentista da de alta un paciente con RETURNING (antes: 42501)',
  pg_temp.val('a7000000-0000-0000-0000-000000000002',
    $q$with x as (insert into pacientes (id, nombre_completo, telefono) values ('b7000000-0000-0000-0000-0000000000d1','Alta por dentista','1') returning id) select count(*)::text from x$q$) = '1');
select pg_temp.t('112-2 queda como dentista responsable y en su clínica',
  (select dentista_responsable_id = 'a7000000-0000-0000-0000-000000000002' and clinica_id = 'c7000000-0000-0000-0000-00000000000a' from pacientes where id = 'b7000000-0000-0000-0000-0000000000d1'));
select pg_temp.t('112-3 la dentista ve su paciente nuevo',
  pg_temp.val('a7000000-0000-0000-0000-000000000002', $q$select count(*)::text from pacientes where id = 'b7000000-0000-0000-0000-0000000000d1'$q$) = '1');
-- 2. Alta por sincronización sin conexión (upsert … RETURNING)
select pg_temp.t('112-4 upsert de un paciente nuevo por la dentista (sincronización) con RETURNING',
  pg_temp.val('a7000000-0000-0000-0000-000000000002',
    $q$with x as (insert into pacientes (id, nombre_completo, telefono) values ('b7000000-0000-0000-0000-0000000000d2','Alta offline','2')
                  on conflict (id) do update set telefono = excluded.telefono returning id) select count(*)::text from x$q$) = '1');
-- 3. No amplía el acceso
select pg_temp.t('112-5 la dentista NO ve el paciente de otra dentista de su clínica',
  pg_temp.val('a7000000-0000-0000-0000-000000000002', $q$select count(*)::text from pacientes where id = 'b7000000-0000-0000-0000-0000000000a2'$q$) = '0');
select pg_temp.t('112-6 la otra dentista (A2) NO ve el paciente nuevo de Dentista A',
  pg_temp.val('a7000000-0000-0000-0000-000000000003', $q$select count(*)::text from pacientes where id in ('b7000000-0000-0000-0000-0000000000d1','b7000000-0000-0000-0000-0000000000d2')$q$) = '0');
select pg_temp.t('112-7 el owner de OTRA clínica no ve los pacientes nuevos',
  pg_temp.val('a7000000-0000-0000-0000-000000000007', $q$select count(*)::text from pacientes where clinica_id = 'c7000000-0000-0000-0000-00000000000a'$q$) = '0');
select pg_temp.t('112-8 la dentista NO puede crear un paciente en otra clínica (42501)',
  pg_temp.val('a7000000-0000-0000-0000-000000000002',
    $q$with x as (insert into pacientes (clinica_id, nombre_completo) values ('c7000000-0000-0000-0000-00000000000b','Intruso') returning id) select count(*)::text from x$q$) = 'ERR|42501');
select pg_temp.t('112-9 asistente sin asignación NO ve el paciente nuevo',
  pg_temp.val('a7000000-0000-0000-0000-000000000006', $q$select count(*)::text from pacientes where id = 'b7000000-0000-0000-0000-0000000000d1'$q$) = '0');
-- 4. Sin cambios para los demás roles
select pg_temp.t('112-10 la asistente asignada a Dentista A ve el paciente nuevo (como antes, vía auth_paciente_asignado)',
  pg_temp.val('a7000000-0000-0000-0000-000000000005', $q$select count(*)::text from pacientes where id = 'b7000000-0000-0000-0000-0000000000d1'$q$) = '1');
select pg_temp.t('112-11 recepción da de alta con RETURNING y ve todos los de su clínica',
  pg_temp.val('a7000000-0000-0000-0000-000000000004',
    $q$with x as (insert into pacientes (nombre_completo, telefono) values ('Alta por recepción','3') returning id) select count(*)::text from x$q$) = '1'
  and pg_temp.val('a7000000-0000-0000-0000-000000000004', $q$select count(*)::text from pacientes$q$) = '4');
select pg_temp.t('112-12 el owner ve todos los de su clínica',
  pg_temp.val('a7000000-0000-0000-0000-000000000001', $q$select count(*)::text from pacientes$q$) = '4');
select pg_temp.t('112-13 pacientes_select incluye la condición sobre la propia fila',
  (select qual like '%dentista_responsable_id = auth.uid()%' and qual like '%auth_paciente_asignado(id)%' from pg_policies where tablename = 'pacientes' and policyname = 'pacientes_select'));

do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO 112: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 150), ' | ') from _res where not ok); end if;
end $$;
rollback;
