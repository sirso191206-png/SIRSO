-- ============================================================
-- Pruebas SQL del sistema de planes y suscripciones (migraciones 074 + 075)
-- ------------------------------------------------------------
-- CÓMO CORRERLAS (necesitan un PostgreSQL local, NO tocan Supabase):
--   1. createdb siro_test
--   2. psql -d siro_test -f supabase/tests/supabase_stub.sql   (imita auth.uid(), roles, storage)
--   3. aplicar supabase/migrations/*.sql en orden
--        (la 007 da UN error conocido de vista: la 070 la recrea bien)
--   4. psql -d siro_test -f supabase/tests/planes_suscripciones_test.sql
--
-- Todo corre dentro de UNA transacción que termina en ROLLBACK: no deja datos.
-- Las pruebas actúan como cada tipo de usuario con SET ROLE + claims JWT, así
-- que RLS y GRANTs se aplican de verdad (a diferencia de correr como postgres).
-- HONESTIDAD: esto es PostgreSQL real con una capa que IMITA a Supabase; no es
-- un proyecto Supabase. Conviene repetir lo esencial en un proyecto de staging.
-- ============================================================
\set ON_ERROR_STOP on
\set QUIET on
begin;

create temp table _res (ok boolean, nombre text);
create function pg_temp.t(p_nombre text, p_cond boolean) returns void language plpgsql as $$
begin
  insert into _res values (coalesce(p_cond, false), p_nombre);
  raise notice '% %', case when coalesce(p_cond, false) then 'PASS' else 'FAIL' end, p_nombre;
end $$;

-- Ejecuta SQL como un usuario autenticado. 'OK' o 'ERR|sqlstate|detail|hint|mensaje'.
create function pg_temp.como(p_uid uuid, p_sql text) returns text language plpgsql as $$
declare v_d text; v_h text; v_m text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  set local role authenticated;
  begin
    execute p_sql;
    reset role;
    return 'OK';
  exception when others then
    get stacked diagnostics v_d = pg_exception_detail, v_h = pg_exception_hint, v_m = message_text;
    reset role;
    return 'ERR|' || sqlstate || '|' || coalesce(v_d, '') || '|' || coalesce(v_h, '') || '|' || coalesce(v_m, '');
  end;
end $$;

-- Igual, pero devuelve un escalar (texto) de la consulta.
create function pg_temp.val(p_uid uuid, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  set local role authenticated;
  begin
    execute p_sql into v;
    reset role;
    return v;
  exception when others then
    reset role;
    return 'ERR|' || sqlstate || '|' || sqlerrm;
  end;
end $$;

-- ---------- Datos de prueba (como postgres) ----------
insert into clinicas (id, nombre) values
  ('c0000000-0000-0000-0000-0000000000ff', 'Plataforma'),
  ('c0000000-0000-0000-0000-00000000000a', 'Clínica A'),
  ('c0000000-0000-0000-0000-00000000000b', 'Clínica B');
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'sa@x.mx'), ('a0000000-0000-0000-0000-0000000000a1', 'oa@x.mx'),
  ('a0000000-0000-0000-0000-0000000000a2', 'da@x.mx'), ('a0000000-0000-0000-0000-0000000000b1', 'ob@x.mx');
insert into usuarios (id, clinica_id, nombre, correo, rol, es_super_admin) values
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-0000000000ff', 'Super', 'sa@x.mx', 'owner', true),
  ('a0000000-0000-0000-0000-0000000000a1', 'c0000000-0000-0000-0000-00000000000a', 'Dueño A', 'oa@x.mx', 'owner', false),
  ('a0000000-0000-0000-0000-0000000000a2', 'c0000000-0000-0000-0000-00000000000a', 'Dentista A', 'da@x.mx', 'dentista', false),
  ('a0000000-0000-0000-0000-0000000000b1', 'c0000000-0000-0000-0000-00000000000b', 'Dueño B', 'ob@x.mx', 'owner', false);

select set_config('t.sa', 'a0000000-0000-0000-0000-000000000001', false);
select set_config('t.oa', 'a0000000-0000-0000-0000-0000000000a1', false);
select set_config('t.da', 'a0000000-0000-0000-0000-0000000000a2', false);
select set_config('t.ob', 'a0000000-0000-0000-0000-0000000000b1', false);
select set_config('t.ca', 'c0000000-0000-0000-0000-00000000000a', false);
select set_config('t.cb', 'c0000000-0000-0000-0000-00000000000b', false);

select fn_asignar_plan_interno(current_setting('t.sa')::uuid, current_setting('t.ca')::uuid, 'profesional', 'mensual');
select fn_asignar_plan_interno(current_setting('t.sa')::uuid, current_setting('t.cb')::uuid, 'clinica', 'anual');

-- ============================================================
-- A. Valores iniciales y catálogo
-- ============================================================
select pg_temp.t('A1 plan Esencial: $599 / $5,990, 500 pac, 1 usr, 1 suc, 1 sesión',
  exists (select 1 from planes_catalogo where plan='esencial' and precio_mensual=599 and precio_anual=5990 and max_pacientes=500 and max_usuarios=1 and limite_sucursales=1 and limite_sesiones_simultaneas=1));
select pg_temp.t('A2 plan Profesional: $999 / $9,990, 2,000 pac, 3 usr, 1 suc, 3 sesiones',
  exists (select 1 from planes_catalogo where plan='profesional' and precio_mensual=999 and precio_anual=9990 and max_pacientes=2000 and max_usuarios=3 and limite_sucursales=1 and limite_sesiones_simultaneas=3));
select pg_temp.t('A3 plan Clínica: $1,799 / $17,990, 7,500 pac, 10 usr, 3 suc, 10 sesiones',
  exists (select 1 from planes_catalogo where plan='clinica' and precio_mensual=1799 and precio_anual=17990 and max_pacientes=7500 and max_usuarios=10 and limite_sucursales=3 and limite_sesiones_simultaneas=10));
select pg_temp.t('A4 plan Empresarial: $3,999 / $39,990 y todo ilimitado (NULL)',
  exists (select 1 from planes_catalogo where plan='empresarial' and precio_mensual=3999 and precio_anual=39990 and max_pacientes is null and max_usuarios is null and limite_sucursales is null and limite_sesiones_simultaneas is null));
select pg_temp.t('A5 NO existe WhatsApp como funcionalidad (no hay integración real)',
  not exists (select 1 from funcionalidades where codigo ilike '%whatsapp%' or nombre ilike '%whatsapp%'));
select pg_temp.t('A6 Esencial NO incluye periodontograma; Profesional sí; Empresarial incluye todo lo activo',
  not exists (select 1 from plan_funcionalidades where plan='esencial' and funcionalidad='periodontograma' and habilitada)
  and exists (select 1 from plan_funcionalidades where plan='profesional' and funcionalidad='periodontograma' and habilitada)
  and (select count(*) from plan_funcionalidades pf join funcionalidades f on f.codigo = pf.funcionalidad where pf.plan='empresarial' and pf.habilitada and f.activo) = (select count(*) from funcionalidades where activo));
select pg_temp.t('A7 el código legado "basico" ya no existe (migrado a esencial)',
  not exists (select 1 from planes_catalogo where plan='basico'));
select pg_temp.t('A8 el trigger viejo de sesiones (números fijos) fue eliminado',
  not exists (select 1 from pg_trigger where tgname='trg_aplicar_limite_sesiones')
  and not exists (select 1 from pg_proc where proname in ('fn_limite_sesiones_por_plan','fn_aplicar_limite_sesiones')));

-- ============================================================
-- B. Seguridad: un usuario normal NO puede modificar planes
-- ============================================================
select pg_temp.t('B1 dueño NO puede UPDATE planes_catalogo directo',
  pg_temp.como(current_setting('t.oa')::uuid, $q$update planes_catalogo set precio_mensual = 1$q$) like 'ERR|42501%');
select pg_temp.t('B2 dueño NO puede INSERT/DELETE en planes_catalogo',
  pg_temp.como(current_setting('t.oa')::uuid, $q$insert into planes_catalogo (plan, nombre) values ('hack','Hack')$q$) like 'ERR|42501%'
  and pg_temp.como(current_setting('t.oa')::uuid, $q$delete from planes_catalogo$q$) like 'ERR|42501%');
select pg_temp.t('B3 dueño NO puede escribir en plan_funcionalidades, funcionalidades, suscripciones ni sus snapshots',
  pg_temp.como(current_setting('t.oa')::uuid, $q$update plan_funcionalidades set habilitada = true$q$) like 'ERR|42501%'
  and pg_temp.como(current_setting('t.oa')::uuid, $q$delete from funcionalidades$q$) like 'ERR|42501%'
  and pg_temp.como(current_setting('t.oa')::uuid, $q$update suscripciones set plan = 'empresarial'$q$) like 'ERR|42501%'
  and pg_temp.como(current_setting('t.oa')::uuid, $q$update suscripcion_limites set max_pacientes = null$q$) like 'ERR|42501%'
  and pg_temp.como(current_setting('t.oa')::uuid, $q$insert into suscripcion_funcionalidades values (gen_random_uuid(),'pagos',true)$q$) like 'ERR|42501%');
select pg_temp.t('B4 dueño NO puede cambiarse el plan editando su propia clínica (clinicas.plan / límites)',
  pg_temp.como(current_setting('t.oa')::uuid, format($q$update clinicas set plan = 'empresarial', limite_pacientes = null where id = %L$q$, current_setting('t.ca'))) like 'ERR|42501%');
select pg_temp.t('B5 dueño NO puede ejecutar ninguna función sa_* (todas se autoverifican)',
  pg_temp.como(current_setting('t.oa')::uuid, $q$select sa_listar_planes()$q$) like 'ERR|42501%'
  and pg_temp.como(current_setting('t.oa')::uuid, $q$select sa_guardar_plan('{"codigo":"zz","nombre":"Z","precio_mensual":1,"precio_anual":1}')$q$) like 'ERR|42501%'
  and pg_temp.como(current_setting('t.oa')::uuid, format($q$select sa_asignar_plan_clinica(%L,'empresarial','mensual')$q$, current_setting('t.ca'))) like 'ERR|42501%'
  and pg_temp.como(current_setting('t.oa')::uuid, $q$select sa_set_plan_funcionalidades('esencial','{"pagos":false}')$q$) like 'ERR|42501%'
  and pg_temp.como(current_setting('t.oa')::uuid, $q$select sa_activar_plan('esencial', false)$q$) like 'ERR|42501%'
  and pg_temp.como(current_setting('t.oa')::uuid, $q$select sa_duplicar_plan('esencial','copia','Copia')$q$) like 'ERR|42501%'
  and pg_temp.como(current_setting('t.oa')::uuid, format($q$select sa_suspender_suscripcion(%L)$q$, current_setting('t.ca'))) like 'ERR|42501%'
  and pg_temp.como(current_setting('t.oa')::uuid, format($q$select sa_ajustar_condiciones_clinica(%L,'{"max_pacientes":null}')$q$, current_setting('t.ca'))) like 'ERR|42501%'
  and pg_temp.como(current_setting('t.oa')::uuid, $q$select sa_historial_planes()$q$) like 'ERR|42501%'
  and pg_temp.como(current_setting('t.oa')::uuid, $q$select sa_guardar_funcionalidad('{"codigo":"zz","nombre":"Z"}')$q$) like 'ERR|42501%');
select pg_temp.t('B6 dueño NO puede ejecutar las funciones internas (asignar plan interno / auditar)',
  pg_temp.como(current_setting('t.oa')::uuid, format($q$select fn_asignar_plan_interno(null,%L,'empresarial','mensual')$q$, current_setting('t.ca'))) like 'ERR|42501%'
  and pg_temp.como(current_setting('t.oa')::uuid, $q$select fn_auditar_plan(null,'x','y',null,null,'{}')$q$) like 'ERR|42501%');
select pg_temp.t('B7 usuario anónimo no lee planes ni suscripciones',
  (select count(*) from (select 1) x where pg_temp.como(null, $q$set local role anon; select * from planes_catalogo$q$) like 'ERR|42501%') = 1);
select pg_temp.t('B8 el dueño de A solo ve SU suscripción; el de B solo la suya; el dentista ninguna (precios)',
  pg_temp.val(current_setting('t.oa')::uuid, $q$select count(*)::text from suscripciones$q$) = '1'
  and pg_temp.val(current_setting('t.oa')::uuid, format($q$select count(*)::text from suscripciones where clinica_id = %L$q$, current_setting('t.cb'))) = '0'
  and pg_temp.val(current_setting('t.ob')::uuid, $q$select count(*)::text from suscripciones$q$) = '1'
  and pg_temp.val(current_setting('t.da')::uuid, $q$select count(*)::text from suscripciones$q$) = '0');
select set_config('request.jwt.claim.sub', current_setting('t.sa'), true);
set local role authenticated;
select sa_guardar_plan('{"codigo":"t_oculto","nombre":"Plan a la medida","precio_mensual":5,"precio_anual":5,"visible":false}'::jsonb);
reset role;
insert into clinicas (id, nombre) values ('c0000000-0000-0000-0000-0000000000b9', 'Clínica con plan oculto');
insert into auth.users (id, email) values ('a0000000-0000-0000-0000-0000000000b9', 'ob9@x.mx');
insert into usuarios (id, clinica_id, nombre, correo, rol) values ('a0000000-0000-0000-0000-0000000000b9', 'c0000000-0000-0000-0000-0000000000b9', 'Dueño oculto', 'ob9@x.mx', 'owner');
select fn_asignar_plan_interno(current_setting('t.sa')::uuid, 'c0000000-0000-0000-0000-0000000000b9', 't_oculto', 'mensual');
select pg_temp.t('B9 un plan OCULTO no lo ve otra clínica, pero SÍ la clínica que lo tiene contratado',
  pg_temp.val(current_setting('t.oa')::uuid, $q$select count(*)::text from planes_catalogo where plan = 't_oculto'$q$) = '0'
  and pg_temp.val('a0000000-0000-0000-0000-0000000000b9'::uuid, $q$select count(*)::text from planes_catalogo where plan = 't_oculto'$q$) = '1'
  and pg_temp.val(current_setting('t.oa')::uuid, $q$select count(*)::text from planes_catalogo where plan = 'profesional'$q$) = '1');

-- ============================================================
-- C. Superadmin SÍ puede; y los cambios NO tocan a clínicas existentes (snapshot)
-- ============================================================
select set_config('t.c1', pg_temp.como(current_setting('t.sa')::uuid, $q$select sa_guardar_plan('{"codigo":"profesional","precio_mensual":1099,"max_pacientes":3000}')$q$), false);
select pg_temp.t('C1 superadmin cambia Profesional $999 → $1,099 y 2,000 → 3,000 pacientes',
  current_setting('t.c1') = 'OK'
  and (select precio_mensual from planes_catalogo where plan='profesional') = 1099
  and (select max_pacientes from planes_catalogo where plan='profesional') = 3000);
select set_config('t.c2', pg_temp.como(current_setting('t.sa')::uuid, $q$select sa_set_plan_funcionalidades('profesional','{"periodontograma":false}')$q$), false);
select pg_temp.t('C2 superadmin desactiva periodontograma en Profesional',
  current_setting('t.c2') = 'OK'
  and not exists (select 1 from plan_funcionalidades where plan='profesional' and funcionalidad='periodontograma' and habilitada));
select pg_temp.t('C3 la clínica A (contrató Profesional ANTES) conserva 2,000 pacientes, $999 y periodontograma',
  fn_limite_efectivo(current_setting('t.ca')::uuid, 'pacientes') = 2000
  and (select precio_contratado from suscripciones where clinica_id = current_setting('t.ca')::uuid and estado <> 'reemplazada') = 999
  and fn_funcionalidad_contratada(current_setting('t.ca')::uuid, 'periodontograma'));
insert into clinicas (id, nombre) values ('c0000000-0000-0000-0000-0000000000cc', 'Clínica nueva');
select fn_asignar_plan_interno(current_setting('t.sa')::uuid, 'c0000000-0000-0000-0000-0000000000cc', 'profesional', 'mensual');
select pg_temp.t('C4 una clínica NUEVA con Profesional recibe 3,000 pacientes, $1,099 y SIN periodontograma',
  fn_limite_efectivo('c0000000-0000-0000-0000-0000000000cc', 'pacientes') = 3000
  and (select precio_contratado from suscripciones where clinica_id = 'c0000000-0000-0000-0000-0000000000cc' and estado <> 'reemplazada') = 1099
  and not fn_funcionalidad_contratada('c0000000-0000-0000-0000-0000000000cc', 'periodontograma'));
select pg_temp.t('C5 sa_clinicas_de_plan marca a A como "difiere del plan" y a la nueva como igual',
  (select (e ->> 'difiere_del_plan')::boolean from jsonb_array_elements(sa_clinicas_de_plan('profesional')) e where e ->> 'clinica_id' = current_setting('t.ca')) is true
  and (select (e ->> 'difiere_del_plan')::boolean from jsonb_array_elements(sa_clinicas_de_plan('profesional')) e where e ->> 'clinica_id' = 'c0000000-0000-0000-0000-0000000000cc') is false);
select set_config('request.jwt.claim.sub', current_setting('t.sa'), true);
set local role authenticated;
select set_config('t.c6', sa_asignar_plan_clinica(current_setting('t.ca')::uuid, 'profesional', 'mensual')::text, false);
reset role;
select pg_temp.t('C6 "aplicar condiciones" (decisión explícita) actualiza a A y conserva el historial',
  (current_setting('t.c6')::jsonb ->> 'origen') = 'aplicar_condiciones'
  and fn_limite_efectivo(current_setting('t.ca')::uuid, 'pacientes') = 3000
  and not fn_funcionalidad_contratada(current_setting('t.ca')::uuid, 'periodontograma')
  and (select count(*) from suscripciones where clinica_id = current_setting('t.ca')::uuid) = 2
  and (select count(*) from suscripciones where clinica_id = current_setting('t.ca')::uuid and estado <> 'reemplazada') = 1);
select pg_temp.t('C7 el cambio de A quedó reflejado también en el espejo clinicas.limite_pacientes',
  (select limite_pacientes from clinicas where id = current_setting('t.ca')::uuid) = 3000);

-- ============================================================
-- D. Límites aplicados por la base de datos
-- ============================================================
select set_config('request.jwt.claim.sub', current_setting('t.sa'), true);
set local role authenticated;
select sa_guardar_plan('{"codigo":"t_lim","nombre":"Prueba límites","precio_mensual":1,"precio_anual":1,"max_pacientes":2,"max_usuarios":2,"limite_sucursales":1,"limite_sesiones_simultaneas":2}'::jsonb);
select sa_set_plan_funcionalidades('t_lim', (select jsonb_object_agg(codigo, true) from funcionalidades where activo and codigo <> 'multisucursal' and not nucleo));
reset role;
insert into clinicas (id, nombre) values ('c0000000-0000-0000-0000-0000000000d1', 'Clínica límites');
insert into auth.users (id, email) values ('a0000000-0000-0000-0000-0000000000d1', 'od@x.mx'), ('a0000000-0000-0000-0000-0000000000d2', 'dd@x.mx'), ('a0000000-0000-0000-0000-0000000000d3', 'xd@x.mx');
select fn_asignar_plan_interno(current_setting('t.sa')::uuid, 'c0000000-0000-0000-0000-0000000000d1', 't_lim', 'mensual');
insert into usuarios (id, clinica_id, nombre, correo, rol) values ('a0000000-0000-0000-0000-0000000000d1', 'c0000000-0000-0000-0000-0000000000d1', 'Dueño D', 'od@x.mx', 'owner');
select set_config('t.od', 'a0000000-0000-0000-0000-0000000000d1', false);

-- D1 pacientes
select pg_temp.t('D1a los 2 primeros pacientes (límite 2) se crean',
  pg_temp.como(current_setting('t.od')::uuid, $q$insert into pacientes (nombre_completo) values ('P1')$q$) = 'OK'
  and pg_temp.como(current_setting('t.od')::uuid, $q$insert into pacientes (nombre_completo) values ('P2')$q$) = 'OK');
select set_config('t.r1', pg_temp.como(current_setting('t.od')::uuid, $q$insert into pacientes (nombre_completo) values ('P3')$q$), false);
select pg_temp.t('D1b el paciente 3 se RECHAZA con PT402 / PLAN_LIMIT_REACHED / pacientes',
  current_setting('t.r1') like 'ERR|PT402|PLAN_LIMIT_REACHED|pacientes|%');
select pg_temp.t('D1c el mensaje es claro ("límite de pacientes de tu plan")',
  current_setting('t.r1') like '%límite de pacientes de tu plan%');
select pg_temp.t('D1d solo hay 2 pacientes (el rechazado no quedó a medias)',
  (select count(*) from pacientes where clinica_id = 'c0000000-0000-0000-0000-0000000000d1') = 2);
select set_config('t.pid', (select id::text from pacientes where clinica_id = 'c0000000-0000-0000-0000-0000000000d1' limit 1), false);
select set_config('t.d1e', pg_temp.como(current_setting('t.od')::uuid, format($q$insert into pacientes (id, nombre_completo) values (%L, 'P1 editado') on conflict (id) do update set nombre_completo = excluded.nombre_completo$q$, current_setting('t.pid'))), false);
select pg_temp.t('D1e CLAVE: reintentar (upsert) un paciente que YA existe en el cupo exacto NO falla (idempotencia de la cola offline)',
  current_setting('t.d1e') = 'OK'
  and (select nombre_completo from pacientes where id = current_setting('t.pid')::uuid) = 'P1 editado');
select pg_temp.t('D1f ...pero un id NUEVO sigue rechazado en el cupo',
  pg_temp.como(current_setting('t.od')::uuid, format($q$insert into pacientes (id, nombre_completo) values (gen_random_uuid(), 'P3b') on conflict (id) do update set nombre_completo = excluded.nombre_completo$q$)) like 'ERR|PT402%');
select pg_temp.t('D1g el límite de una clínica no afecta a otra (B crea sin problema)',
  pg_temp.como(current_setting('t.ob')::uuid, $q$insert into pacientes (nombre_completo) values ('B1')$q$) = 'OK');

-- D2 usuarios
insert into usuarios (id, clinica_id, nombre, correo, rol) values ('a0000000-0000-0000-0000-0000000000d2', 'c0000000-0000-0000-0000-0000000000d1', 'Dentista D', 'dd@x.mx', 'dentista');
select pg_temp.t('D2a el 2º usuario (límite 2) se creó',
  (select count(*) from usuarios where clinica_id = 'c0000000-0000-0000-0000-0000000000d1') = 2);
do $$ declare v text; begin
  begin insert into usuarios (id, clinica_id, nombre, correo, rol) values ('a0000000-0000-0000-0000-0000000000d3', 'c0000000-0000-0000-0000-0000000000d1', 'Tercero', 'xd@x.mx', 'recepcion'); v := 'OK';
  exception when others then get stacked diagnostics v = pg_exception_detail; v := sqlstate || '|' || v; end;
  perform set_config('t.ru', v, false);
end $$;
select pg_temp.t('D2b el 3er usuario se RECHAZA con PT402 / PLAN_LIMIT_REACHED (aplicado en la BD, no solo en la Edge Function)',
  current_setting('t.ru') = 'PT402|PLAN_LIMIT_REACHED');
insert into auth.users (id, email) values ('a0000000-0000-0000-0000-0000000000e5', 'sa2@x.mx');
insert into usuarios (id, clinica_id, nombre, correo, rol, es_super_admin) values ('a0000000-0000-0000-0000-0000000000e5', 'c0000000-0000-0000-0000-0000000000d1', 'SA2', 'sa2@x.mx', 'owner', true);
select pg_temp.t('D2c un SUPERADMIN no consume cupo ni es bloqueado por él (la clínica ya estaba llena y entró igual)',
  (select count(*) from usuarios where clinica_id = 'c0000000-0000-0000-0000-0000000000d1' and not es_super_admin) = 2
  and exists (select 1 from usuarios where id = 'a0000000-0000-0000-0000-0000000000e5'));

-- D3 sucursales
-- Regla (migración 079): sin la funcionalidad "multisucursal" NO se crea ninguna sucursal, ni la primera.
do $$ declare v text; begin
  begin insert into sucursales (clinica_id, nombre) values ('c0000000-0000-0000-0000-0000000000d1', 'Matriz'); v := 'OK';
  exception when others then get stacked diagnostics v = pg_exception_detail; v := sqlstate || '|' || v; end;
  perform set_config('t.rs0', v, false);
end $$;
select pg_temp.t('D3a sin "multisucursal" NO se puede crear ninguna sucursal, ni la primera: PT403 / FEATURE_NOT_AVAILABLE',
  current_setting('t.rs0') = 'PT403|FEATURE_NOT_AVAILABLE'
  and (select count(*) from sucursales where clinica_id = 'c0000000-0000-0000-0000-0000000000d1') = 0);
select set_config('request.jwt.claim.sub', current_setting('t.sa'), true);
set local role authenticated;
select sa_ajustar_condiciones_clinica('c0000000-0000-0000-0000-0000000000d1', '{"max_sucursales":2}', '{"multisucursal":true}');
reset role;
insert into sucursales (clinica_id, nombre) values ('c0000000-0000-0000-0000-0000000000d1', 'Matriz');
insert into sucursales (clinica_id, nombre) values ('c0000000-0000-0000-0000-0000000000d1', 'Segunda');
do $$ declare v text; begin
  begin insert into sucursales (clinica_id, nombre) values ('c0000000-0000-0000-0000-0000000000d1', 'Tercera'); v := 'OK';
  exception when others then get stacked diagnostics v = pg_exception_detail; v := sqlstate || '|' || v; end;
  perform set_config('t.rs2', v, false);
end $$;
select pg_temp.t('D3c con multisucursal activada y límite 2: la 1ª y la 2ª entran y la 3ª se rechaza (PT402)',
  (select count(*) from sucursales where clinica_id = 'c0000000-0000-0000-0000-0000000000d1') = 2 and current_setting('t.rs2') = 'PT402|PLAN_LIMIT_REACHED');
update sucursales set activa = false where clinica_id = 'c0000000-0000-0000-0000-0000000000d1' and nombre = 'Segunda';
insert into sucursales (clinica_id, nombre) values ('c0000000-0000-0000-0000-0000000000d1', 'Tercera');
do $$ declare v text; begin
  begin update sucursales set activa = true where clinica_id = 'c0000000-0000-0000-0000-0000000000d1' and nombre = 'Segunda'; v := 'OK';
  exception when others then get stacked diagnostics v = pg_exception_detail; v := sqlstate || '|' || v; end;
  perform set_config('t.rs3', v, false);
end $$;
select pg_temp.t('D3d desactivar una sucursal libera cupo, pero REACTIVARLA por encima del límite también se rechaza',
  current_setting('t.rs3') = 'PT402|PLAN_LIMIT_REACHED');

-- D4 sesiones simultáneas
insert into auth.users (id, email) values ('a0000000-0000-0000-0000-0000000000f1', 'ses@x.mx');
insert into usuarios (id, clinica_id, nombre, correo, rol, es_super_admin) values ('a0000000-0000-0000-0000-0000000000f1', 'c0000000-0000-0000-0000-00000000000a', 'Sesiones A', 'ses@x.mx', 'recepcion', false);
select set_config('t.us', 'a0000000-0000-0000-0000-0000000000f1', false);
insert into sesiones_usuario (usuario_id, iniciada_en) values
  (current_setting('t.us')::uuid, now() - interval '30 min'), (current_setting('t.us')::uuid, now() - interval '20 min'),
  (current_setting('t.us')::uuid, now() - interval '10 min'), (current_setting('t.us')::uuid, now() - interval '5 min');
select pg_temp.t('D4a clínica A (Profesional = 3 sesiones): tras 4 inicios solo quedan 3 activas y se cerró la MÁS ANTIGUA',
  (select count(*) from sesiones_usuario where usuario_id = current_setting('t.us')::uuid and finalizada_en is null) = 3
  and (select finalizada_en is not null from sesiones_usuario where usuario_id = current_setting('t.us')::uuid order by iniciada_en asc limit 1));
select pg_temp.t('D4b mi_limite_sesiones() devuelve el límite del plan (3) al usuario',
  pg_temp.val(current_setting('t.us')::uuid, $q$select mi_limite_sesiones()::text$q$) = '3');
insert into clinicas (id, nombre) values ('c0000000-0000-0000-0000-0000000000e1', 'Empresa');
insert into auth.users (id, email) values ('a0000000-0000-0000-0000-0000000000e1', 'emp@x.mx');
select fn_asignar_plan_interno(current_setting('t.sa')::uuid, 'c0000000-0000-0000-0000-0000000000e1', 'empresarial', 'anual');
insert into usuarios (id, clinica_id, nombre, correo, rol) values ('a0000000-0000-0000-0000-0000000000e1', 'c0000000-0000-0000-0000-0000000000e1', 'Emp', 'emp@x.mx', 'owner');
insert into sesiones_usuario (usuario_id, iniciada_en) select 'a0000000-0000-0000-0000-0000000000e1', now() - (g || ' min')::interval from generate_series(1, 30) g;
select pg_temp.t('D4c REGRESIÓN: Empresarial (sesiones NULL = ilimitado) conserva sus 30 sesiones; el trigger viejo lo habría dejado en 1',
  (select count(*) from sesiones_usuario where usuario_id = 'a0000000-0000-0000-0000-0000000000e1' and finalizada_en is null) = 30
  and pg_temp.val('a0000000-0000-0000-0000-0000000000e1'::uuid, $q$select coalesce(mi_limite_sesiones()::text, 'ilimitado')$q$) = 'ilimitado');
insert into sesiones_usuario (usuario_id, iniciada_en) select current_setting('t.sa')::uuid, now() - (g || ' min')::interval from generate_series(1, 12) g;
select pg_temp.t('D4d el superadmin siempre queda exento del límite de sesiones',
  (select count(*) from sesiones_usuario where usuario_id = current_setting('t.sa')::uuid and finalizada_en is null) = 12);

-- ============================================================
-- E. Funcionalidades aplicadas por la base de datos (RLS restrictiva)
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('t.sa'), true);
select sa_guardar_plan('{"codigo":"t_nucleo","nombre":"Solo núcleo","precio_mensual":1,"precio_anual":1,"max_pacientes":50,"max_usuarios":5,"limite_sucursales":1,"limite_sesiones_simultaneas":2}'::jsonb);
reset role;
insert into clinicas (id, nombre) values ('c0000000-0000-0000-0000-0000000000e2', 'Clínica sin extras');
insert into auth.users (id, email) values ('a0000000-0000-0000-0000-0000000000e2', 'ne@x.mx');
select fn_asignar_plan_interno(current_setting('t.sa')::uuid, 'c0000000-0000-0000-0000-0000000000e2', 't_nucleo', 'mensual');
insert into usuarios (id, clinica_id, nombre, correo, rol) values ('a0000000-0000-0000-0000-0000000000e2', 'c0000000-0000-0000-0000-0000000000e2', 'Dueño E', 'ne@x.mx', 'owner');
select set_config('t.oe', 'a0000000-0000-0000-0000-0000000000e2', false);

select pg_temp.t('E1 REGRESIÓN: se puede CREAR un paciente aunque el plan no incluya expediente/odontograma/periodontograma (los crean triggers DEFINER)',
  pg_temp.como(current_setting('t.oe')::uuid, $q$insert into pacientes (nombre_completo) values ('Sin extras')$q$) = 'OK');
select set_config('t.pe', (select id::text from pacientes where clinica_id = 'c0000000-0000-0000-0000-0000000000e2' limit 1), false);
select pg_temp.t('E2 las filas de periodontograma EXISTEN (las creó el trigger) pero el plan sin la funcionalidad no las puede LEER',
  (select count(*) from periodontograma_piezas where paciente_id = current_setting('t.pe')::uuid) > 0
  and pg_temp.val(current_setting('t.oe')::uuid, format($q$select count(*)::text from periodontograma_piezas where paciente_id = %L$q$, current_setting('t.pe'))) = '0');
select pg_temp.t('E3 ...ni MODIFICAR (UPDATE no afecta ninguna fila)',
  pg_temp.val(current_setting('t.oe')::uuid, format($q$with u as (update periodontograma_piezas set actualizado_en = actualizado_en where paciente_id = %L returning 1) select count(*)::text from u$q$, current_setting('t.pe'))) = '0');
select pg_temp.t('E4 ...ni cargar pagos (INSERT en pagos → violación de RLS 42501)',
  pg_temp.como(current_setting('t.oe')::uuid, format($q$insert into pagos (paciente_id, monto) values (%L, 100)$q$, current_setting('t.pe'))) like 'ERR|42501%');
select pg_temp.t('E5 ...ni recetas, consentimientos, fotografías, tratamientos, citas',
  pg_temp.val(current_setting('t.oe')::uuid, $q$select count(*)::text from recetas$q$) = '0'
  and pg_temp.como(current_setting('t.oe')::uuid, format($q$insert into tratamientos (paciente_id, descripcion, costo) values (%L, 'x', 1)$q$, current_setting('t.pe'))) like 'ERR|42501%'
  and pg_temp.como(current_setting('t.oe')::uuid, format($q$insert into citas (paciente_id, inicio, fin) values (%L, now(), now() + interval '1 hour')$q$, current_setting('t.pe'))) like 'ERR|42501%');
select pg_temp.t('E6b (sesión del superadmin) fn_clinica_tiene_funcionalidad → true; (sesión del dueño) → false',
  pg_temp.val(current_setting('t.sa')::uuid, $q$select fn_clinica_tiene_funcionalidad('c0000000-0000-0000-0000-0000000000e2','periodontograma')::text$q$) = 'true'
  and pg_temp.val(current_setting('t.oe')::uuid, $q$select fn_clinica_tiene_funcionalidad('c0000000-0000-0000-0000-0000000000e2','periodontograma')::text$q$) = 'false');
select set_config('request.jwt.claim.sub', current_setting('t.sa'), true);
set local role authenticated;
select sa_ajustar_condiciones_clinica('c0000000-0000-0000-0000-0000000000e2', null, '{"periodontograma":true,"pagos":true}');
reset role;
select pg_temp.t('E7 al activar periodontograma y pagos para ESA clínica, ya los puede leer y usar',
  pg_temp.val(current_setting('t.oe')::uuid, format($q$select count(*)::text from periodontograma_piezas where paciente_id = %L$q$, current_setting('t.pe'))) <> '0'
  and pg_temp.como(current_setting('t.oe')::uuid, format($q$insert into pagos (paciente_id, monto) values (%L, 100)$q$, current_setting('t.pe'))) = 'OK');
select pg_temp.t('E8 otras clínicas no se afectan (la clínica A sigue con sus funcionalidades)',
  fn_funcionalidad_contratada(current_setting('t.cb')::uuid, 'pagos'));
select set_config('request.jwt.claim.sub', current_setting('t.sa'), true);
set local role authenticated;
select set_config('t.e9', sa_guardar_funcionalidad('{"codigo":"nueva_func","nombre":"Nueva"}'::jsonb)::text, false);
reset role;
select pg_temp.t('E9 el superadmin crea una funcionalidad nueva sin tocar código ni clínicas',
  (current_setting('t.e9')::jsonb ->> 'codigo') = 'nueva_func'
  and exists (select 1 from funcionalidades where codigo = 'nueva_func' and activo));
select pg_temp.t('E9b ...queda como "interfaz" (aplicar en BD exige una migración) y NO contratada por nadie',
  (select aplicacion from funcionalidades where codigo = 'nueva_func') = 'interfaz'
  and not fn_funcionalidad_contratada(current_setting('t.ca')::uuid, 'nueva_func'));
select set_config('request.jwt.claim.sub', current_setting('t.sa'), true);
set local role authenticated;
select sa_guardar_funcionalidad('{"codigo":"nueva_func","nombre":"Nueva"}'::jsonb, '["profesional"]'::jsonb, true);
reset role;
select pg_temp.t('E9c con orden explícita (plan + aplicar a suscripciones) solo las clínicas de ESE plan la reciben',
  fn_funcionalidad_contratada(current_setting('t.ca')::uuid, 'nueva_func')
  and not fn_funcionalidad_contratada(current_setting('t.cb')::uuid, 'nueva_func'));
select pg_temp.t('E10 una funcionalidad del núcleo NO se puede desactivar (y el error lo dice)',
  pg_temp.como(current_setting('t.sa')::uuid, $q$select sa_set_plan_funcionalidades('profesional','{"pacientes":false}')$q$) like 'ERR|%núcleo%'
  and exists (select 1 from plan_funcionalidades where plan='profesional' and funcionalidad='pacientes' and habilitada));

-- ============================================================
-- F. Bajar de plan: NO se borra nada, se bloquean ALTAS nuevas, se avisa
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('t.sa'), true);
select sa_guardar_plan('{"codigo":"t_grande","nombre":"Grande","precio_mensual":9,"precio_anual":9,"max_pacientes":5,"max_usuarios":5,"limite_sucursales":1,"limite_sesiones_simultaneas":2}'::jsonb);
select sa_guardar_plan('{"codigo":"t_chico","nombre":"Chico","precio_mensual":1,"precio_anual":1,"max_pacientes":3,"max_usuarios":5,"limite_sucursales":1,"limite_sesiones_simultaneas":2}'::jsonb);
select sa_set_plan_funcionalidades('t_grande', '{"pacientes":true,"pagos":true}');
select sa_set_plan_funcionalidades('t_chico', '{"pacientes":true,"pagos":true}');
reset role;
insert into clinicas (id, nombre) values ('c0000000-0000-0000-0000-0000000000f1', 'Clínica bajará de plan');
insert into auth.users (id, email) values ('a0000000-0000-0000-0000-0000000000f5', 'down@x.mx');
select fn_asignar_plan_interno(current_setting('t.sa')::uuid, 'c0000000-0000-0000-0000-0000000000f1', 't_grande', 'mensual');
insert into usuarios (id, clinica_id, nombre, correo, rol) values ('a0000000-0000-0000-0000-0000000000f5', 'c0000000-0000-0000-0000-0000000000f1', 'Dueño F', 'down@x.mx', 'owner');
insert into pacientes (clinica_id, nombre_completo) select 'c0000000-0000-0000-0000-0000000000f1', 'Pac ' || g from generate_series(1, 5) g;
select set_config('t.of', 'a0000000-0000-0000-0000-0000000000f5', false);
select set_config('request.jwt.claim.sub', current_setting('t.sa'), true);
set local role authenticated;
select set_config('t.down', sa_asignar_plan_clinica('c0000000-0000-0000-0000-0000000000f1', 't_chico', 'mensual')::text, false);
reset role;
select pg_temp.t('F1 al bajar de 5 a 3 pacientes NO se borra ningún paciente',
  (select count(*) from pacientes where clinica_id = 'c0000000-0000-0000-0000-0000000000f1') = 5);
select pg_temp.t('F2 la respuesta del cambio de plan avisa del exceso (5 usados / 3 permitidos)',
  (current_setting('t.down')::jsonb -> 'excesos' -> 0 ->> 'tipo') = 'pacientes'
  and (current_setting('t.down')::jsonb -> 'excesos' -> 0 ->> 'usado') = '5'
  and (current_setting('t.down')::jsonb -> 'excesos' -> 0 ->> 'limite') = '3');
select pg_temp.t('F3 puede seguir CONSULTANDO sus 5 pacientes',
  pg_temp.val(current_setting('t.of')::uuid, $q$select count(*)::text from pacientes$q$) = '5');
select pg_temp.t('F4 pero NO puede registrar uno nuevo (PT402)',
  pg_temp.como(current_setting('t.of')::uuid, $q$insert into pacientes (nombre_completo) values ('Nuevo')$q$) like 'ERR|PT402|PLAN_LIMIT_REACHED|pacientes|%');
select pg_temp.t('F5 mi_suscripcion() muestra el exceso para que la pantalla lo avise',
  (pg_temp.val(current_setting('t.of')::uuid, $q$select (mi_suscripcion() -> 'excesos' -> 0 ->> 'usado')$q$)) = '5');
select pg_temp.t('F6 historial: la suscripción anterior quedó "reemplazada" con fecha_fin, y solo hay UNA vigente',
  (select count(*) from suscripciones where clinica_id = 'c0000000-0000-0000-0000-0000000000f1' and estado = 'reemplazada' and fecha_fin is not null and plan = 't_grande') = 1
  and (select count(*) from suscripciones where clinica_id = 'c0000000-0000-0000-0000-0000000000f1' and estado <> 'reemplazada') = 1);

-- ============================================================
-- G. Suspender / reactivar
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('t.sa'), true);
select sa_suspender_suscripcion('c0000000-0000-0000-0000-0000000000f1', 'impago');
reset role;
select pg_temp.t('G1 suspender marca la suscripción Y la clínica',
  (select estado from suscripciones where clinica_id = 'c0000000-0000-0000-0000-0000000000f1' and estado <> 'reemplazada') = 'suspendida'
  and (select estado from clinicas where id = 'c0000000-0000-0000-0000-0000000000f1') = 'suspendida');
select pg_temp.t('G2 una clínica suspendida no puede registrar pacientes ni ver los existentes',
  pg_temp.val(current_setting('t.of')::uuid, $q$select count(*)::text from pacientes$q$) = '0');
select set_config('request.jwt.claim.sub', current_setting('t.sa'), true);
set local role authenticated;
select sa_asignar_plan_clinica('c0000000-0000-0000-0000-0000000000f1', 't_grande', 'anual');
reset role;
select pg_temp.t('G3 cambiar de plan a una clínica suspendida NO la reactiva en silencio',
  (select estado from suscripciones where clinica_id = 'c0000000-0000-0000-0000-0000000000f1' and estado <> 'reemplazada') = 'suspendida'
  and (select estado from clinicas where id = 'c0000000-0000-0000-0000-0000000000f1') = 'suspendida');
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('t.sa'), true);
select sa_reactivar_suscripcion('c0000000-0000-0000-0000-0000000000f1');
reset role;
select pg_temp.t('G4 reactivar devuelve el acceso (vuelve a ver sus 5 pacientes)',
  pg_temp.val(current_setting('t.of')::uuid, $q$select count(*)::text from pacientes$q$) = '5');

-- ============================================================
-- H. Validaciones del panel de planes
-- ============================================================
select pg_temp.t('H1 código de plan inválido se rechaza',
  pg_temp.como(current_setting('t.sa')::uuid, $q$select sa_guardar_plan('{"codigo":"Plan Raro!","nombre":"X","precio_mensual":1,"precio_anual":1}')$q$) like 'ERR|%');
select pg_temp.t('H2 un plan debe permitir al menos una modalidad',
  pg_temp.como(current_setting('t.sa')::uuid, $q$select sa_guardar_plan('{"codigo":"sin_mod","nombre":"X","permite_mensual":false,"permite_anual":false}')$q$) like 'ERR|%');
select pg_temp.t('H3 precio negativo se rechaza',
  pg_temp.como(current_setting('t.sa')::uuid, $q$select sa_guardar_plan('{"codigo":"neg","nombre":"X","precio_mensual":-5,"precio_anual":1}')$q$) like 'ERR|%');
select set_config('t.h4', pg_temp.como(current_setting('t.sa')::uuid, $q$select sa_activar_plan('t_chico', false)$q$), false);
select pg_temp.t('H4 un plan DESACTIVADO no se puede asignar a una clínica',
  current_setting('t.h4') = 'OK'
  and pg_temp.como(current_setting('t.sa')::uuid, format($q$select sa_asignar_plan_clinica(%L,'t_chico','mensual')$q$, current_setting('t.cb'))) like 'ERR|%desactivado%');
select set_config('t.h5', pg_temp.como(current_setting('t.sa')::uuid, $q$select sa_guardar_plan('{"codigo":"solo_mes","nombre":"Solo mensual","precio_mensual":10,"permite_anual":false}')$q$), false);
select pg_temp.t('H5 modalidad no permitida por el plan se rechaza',
  current_setting('t.h5') = 'OK'
  and pg_temp.como(current_setting('t.sa')::uuid, format($q$select sa_asignar_plan_clinica(%L,'solo_mes','anual')$q$, current_setting('t.cb'))) like 'ERR|%no permite la modalidad%');
select set_config('t.h6', pg_temp.como(current_setting('t.sa')::uuid, $q$select sa_duplicar_plan('profesional','profesional_copia','Profesional (copia)')$q$), false);
select pg_temp.t('H6 duplicar un plan copia valores y funcionalidades y nace DESACTIVADO',
  current_setting('t.h6') = 'OK'
  and (select activo from planes_catalogo where plan='profesional_copia') is false
  and (select max_pacientes from planes_catalogo where plan='profesional_copia') = (select max_pacientes from planes_catalogo where plan='profesional')
  and (select count(*) from plan_funcionalidades where plan='profesional_copia') = (select count(*) from plan_funcionalidades where plan='profesional'));
select pg_temp.t('H7 el listado de planes cuenta clínicas usando cada plan',
  (select (e ->> 'clinicas_usando')::int from jsonb_array_elements(pg_temp.val(current_setting('t.sa')::uuid, $q$select sa_listar_planes()::text$q$)::jsonb) e where e ->> 'plan' = 'profesional')
    = (select count(*) from suscripciones where plan='profesional' and estado <> 'reemplazada'));
select pg_temp.t('H8 sa_clinicas_de_plan lista las clínicas de un plan',
  jsonb_array_length(pg_temp.val(current_setting('t.sa')::uuid, $q$select sa_clinicas_de_plan('profesional')::text$q$)::jsonb) >= 1);

-- ============================================================
-- I. Auditoría
-- ============================================================
select pg_temp.t('I1 el cambio de precio quedó auditado: quién, valor anterior y nuevo',
  exists (select 1 from auditoria where accion = 'editar_plan' and usuario_id = current_setting('t.sa')::uuid
          and detalle ->> 'plan' = 'profesional'
          and (detalle -> 'cambios' -> 'precio_mensual' ->> 'antes')::numeric = 999
          and (detalle -> 'cambios' -> 'precio_mensual' ->> 'despues')::numeric = 1099
          and creado_en is not null));
select pg_temp.t('I2 el cambio de funcionalidad del plan quedó auditado (antes true → después false)',
  exists (select 1 from auditoria where accion = 'editar_funcionalidades_plan' and detalle ->> 'plan' = 'profesional'
          and (detalle -> 'cambios' -> 'periodontograma' ->> 'antes')::boolean is true
          and (detalle -> 'cambios' -> 'periodontograma' ->> 'despues')::boolean is false));
select pg_temp.t('I3 el cambio de plan de una clínica queda auditado con la clínica afectada',
  exists (select 1 from auditoria where accion = 'cambiar_plan' and clinica_id = 'c0000000-0000-0000-0000-0000000000f1'
          and detalle ->> 'plan_anterior' = 't_grande' and detalle ->> 'plan_nuevo' = 't_chico'));
select pg_temp.t('I4 suspender/reactivar quedan auditados',
  exists (select 1 from auditoria where accion = 'suspender_suscripcion' and clinica_id = 'c0000000-0000-0000-0000-0000000000f1')
  and exists (select 1 from auditoria where accion = 'reactivar_suscripcion' and clinica_id = 'c0000000-0000-0000-0000-0000000000f1'));
select pg_temp.t('I5 sa_historial_planes devuelve el historial al superadmin',
  jsonb_array_length(pg_temp.val(current_setting('t.sa')::uuid, $q$select sa_historial_planes(50)::text$q$)::jsonb) >= 5);

-- ============================================================
-- J. Lo que ve la clínica (mi_suscripcion)
-- ============================================================
select pg_temp.t('J1 el DUEÑO ve plan, precio contratado, límites, uso y funcionalidades',
  (pg_temp.val(current_setting('t.oa')::uuid, $q$select mi_suscripcion() -> 'plan' ->> 'nombre'$q$)) = 'Profesional'
  and (pg_temp.val(current_setting('t.oa')::uuid, $q$select mi_suscripcion() ->> 'precio_contratado'$q$)) is not null
  and (pg_temp.val(current_setting('t.oa')::uuid, $q$select mi_suscripcion() -> 'limites' ->> 'pacientes'$q$)) = '3000'
  and jsonb_array_length(pg_temp.val(current_setting('t.oa')::uuid, $q$select (mi_suscripcion() -> 'funcionalidades')::text$q$)::jsonb) > 10);
select pg_temp.t('J2 un DENTISTA recibe límites y funcionalidades pero NO el precio contratado',
  (pg_temp.val(current_setting('t.da')::uuid, $q$select mi_suscripcion() -> 'limites' ->> 'pacientes'$q$)) = '3000'
  and pg_temp.val(current_setting('t.da')::uuid, $q$select coalesce(mi_suscripcion() ->> 'precio_contratado', 'oculto')$q$) = 'oculto');
select pg_temp.t('J3 el panel refleja lo CONTRATADO por la clínica, no lo que diga el plan hoy',
  (pg_temp.val(current_setting('t.ob')::uuid, $q$select mi_suscripcion() -> 'limites' ->> 'pacientes'$q$)) = '7500'
  and (pg_temp.val(current_setting('t.ob')::uuid, $q$select mi_suscripcion() ->> 'modalidad'$q$)) = 'anual');
insert into clinicas (id, nombre) values ('c0000000-0000-0000-0000-0000000000a9', 'Legado sin suscripción');
insert into auth.users (id, email) values ('a0000000-0000-0000-0000-0000000000a9', 'leg@x.mx');
insert into usuarios (id, clinica_id, nombre, correo, rol) values ('a0000000-0000-0000-0000-0000000000a9', 'c0000000-0000-0000-0000-0000000000a9', 'Legado', 'leg@x.mx', 'owner');
select pg_temp.t('J4 clínica SIN suscripción (legado): sin restricciones de funcionalidad y se marca "sin_suscripcion"',
  (pg_temp.val('a0000000-0000-0000-0000-0000000000a9'::uuid, $q$select mi_suscripcion() ->> 'sin_suscripcion'$q$)) = 'true'
  and fn_funcionalidad_contratada('c0000000-0000-0000-0000-0000000000a9', 'periodontograma')
  and pg_temp.como('a0000000-0000-0000-0000-0000000000a9'::uuid, $q$insert into pacientes (nombre_completo) values ('Legado 1')$q$) = 'OK');

-- ============================================================
-- K. Integridad
-- ============================================================
select pg_temp.t('K1 solo puede haber UNA suscripción vigente por clínica (índice único parcial)',
  (select count(*) from (select clinica_id from suscripciones where estado <> 'reemplazada' group by 1 having count(*) > 1) z) = 0);
set local role service_role;
select fn_asignar_plan_interno(null, 'c0000000-0000-0000-0000-0000000000a9', 'esencial', 'mensual');
reset role;
select pg_temp.t('K2 el service_role SÍ puede asignar plan (así lo hace la Edge Function al crear una clínica) y creó la suscripción',
  exists (select 1 from suscripciones where clinica_id = 'c0000000-0000-0000-0000-0000000000a9' and plan = 'esencial' and estado <> 'reemplazada' and creado_por is null));
select pg_temp.t('K3 fn_limite_efectivo rechaza tipos desconocidos',
  pg_temp.como(current_setting('t.oa')::uuid, $q$select fn_limite_efectivo(gen_random_uuid(), 'inventado')$q$) like 'ERR|%');

-- ============================================================
-- Resultado
-- ============================================================
do $$
declare v_ok int; v_fail int;
begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_ok, v_fail from _res;
  raise notice '------------------------------------------';
  raise notice 'RESULTADO: % pasaron, % fallaron (de %)', v_ok, v_fail, v_ok + v_fail;
  if v_fail > 0 then
    raise exception 'FALLARON % pruebas: %', v_fail, (select string_agg(nombre, ' | ') from _res where not ok);
  end if;
end $$;
rollback;
