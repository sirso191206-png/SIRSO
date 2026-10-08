-- Aislamiento de la AUDITORÍA entre clínicas (migración 081): confidencialidad, integridad y relleno.
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
  exception when others then reset role; return 'ERR|'||sqlstate; end;
end $$;
create function pg_temp.como(p_uid uuid, p_sql text) returns text language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin execute p_sql; get diagnostics n = row_count; reset role; return 'OK:'||n;
  exception when others then reset role; return 'ERR|'||sqlstate; end;
end $$;

insert into auth.users (id, email) select ('a5000000-0000-0000-0000-0000000000'||lpad(g::text,2,'0'))::uuid, 'u'||g||'@x.mx' from generate_series(1,7) g;
insert into clinicas (id, nombre) values ('c5000000-0000-0000-0000-00000000000a','A'),('c5000000-0000-0000-0000-00000000000b','B'),('c5000000-0000-0000-0000-00000000000c','Plataforma');
select fn_asignar_plan_interno(null, c, 'empresarial', 'mensual') from unnest(array['c5000000-0000-0000-0000-00000000000a','c5000000-0000-0000-0000-00000000000b','c5000000-0000-0000-0000-00000000000c']::uuid[]) c;
insert into usuarios (id, clinica_id, nombre, correo, rol, es_super_admin) values
 ('a5000000-0000-0000-0000-000000000001','c5000000-0000-0000-0000-00000000000a','Owner A','u1@x.mx','owner',false),
 ('a5000000-0000-0000-0000-000000000002','c5000000-0000-0000-0000-00000000000a','Dentista A','u2@x.mx','dentista',false),
 ('a5000000-0000-0000-0000-000000000003','c5000000-0000-0000-0000-00000000000a','Recepción A','u3@x.mx','recepcion',false),
 ('a5000000-0000-0000-0000-000000000004','c5000000-0000-0000-0000-00000000000a','Asistente A','u4@x.mx','asistente',false),
 ('a5000000-0000-0000-0000-000000000005','c5000000-0000-0000-0000-00000000000b','Owner B','u5@x.mx','owner',false),
 ('a5000000-0000-0000-0000-000000000006','c5000000-0000-0000-0000-00000000000c','Superadmin','u6@x.mx','owner',true);
select set_config('t.oa','a5000000-0000-0000-0000-000000000001',false), set_config('t.da','a5000000-0000-0000-0000-000000000002',false),
       set_config('t.ra','a5000000-0000-0000-0000-000000000003',false), set_config('t.aa','a5000000-0000-0000-0000-000000000004',false),
       set_config('t.ob','a5000000-0000-0000-0000-000000000005',false), set_config('t.sa','a5000000-0000-0000-0000-000000000006',false),
       set_config('t.ca','c5000000-0000-0000-0000-00000000000a',false), set_config('t.cb','c5000000-0000-0000-0000-00000000000b',false);

-- ===== El ataque original: el owner de B trabaja normalmente; el de A intenta leerlo
select pg_temp.como(current_setting('t.ob')::uuid, format('insert into pacientes (clinica_id, nombre_completo, telefono, curp) values (%L, ''Paciente Secreto de B'', ''5512345678'', ''AAAA010101HDFXXX01'')', current_setting('t.cb')));
select pg_temp.t('A1 el trabajo REAL de un usuario deja su auditoría LIGADA a su clínica (el trigger asigna clinica_id) y con los datos del cambio',
  exists (select 1 from auditoria where accion = 'crear_pacientes' and clinica_id = current_setting('t.cb')::uuid and detalle::text like '%Paciente Secreto de B%')
  and not exists (select 1 from auditoria where accion in ('crear_pacientes','crear_expedientes') and clinica_id is null));
select pg_temp.t('A2 EL EXPLOIT YA NO FUNCIONA: el owner de la clínica A lee 0 filas de auditoría de B, y ningún dato del paciente de B (nombre, teléfono, CURP)',
  pg_temp.val(current_setting('t.oa')::uuid, format('select count(*)::text from auditoria where clinica_id = %L', current_setting('t.cb'))) = '0'
  and pg_temp.val(current_setting('t.oa')::uuid, $q$select count(*)::text from auditoria where detalle::text like '%Paciente Secreto de B%' or detalle::text like '%5512345678%' or detalle::text like '%AAAA010101%'$q$) = '0'
  and pg_temp.val(current_setting('t.oa')::uuid, $q$select count(*)::text from auditoria where accion = 'crear_pacientes'$q$) = '0');
select pg_temp.t('A3 ...y el owner de B SÍ ve su propia auditoría (el aislamiento no es "nadie ve nada")',
  pg_temp.val(current_setting('t.ob')::uuid, $q$select count(*)::text from auditoria where accion = 'crear_pacientes'$q$) = '1'
  and pg_temp.val(current_setting('t.ob')::uuid, $q$select count(*)::text from auditoria where detalle::text like '%Paciente Secreto de B%'$q$) = '1');
select pg_temp.t('A4 las acciones de PLATAFORMA de otra clínica (asignar plan a B) tampoco las ve A; B ve las suyas',
  pg_temp.val(current_setting('t.oa')::uuid, format('select count(*)::text from auditoria where clinica_id = %L and accion = ''asignar_plan''', current_setting('t.cb'))) = '0'
  and pg_temp.val(current_setting('t.ob')::uuid, format('select count(*)::text from auditoria where clinica_id = %L and accion = ''asignar_plan''', current_setting('t.cb'))) = '1');
select pg_temp.t('A5 el SUPERADMIN lee la auditoría de TODAS las clínicas (auditoría administrativa)',
  pg_temp.val(current_setting('t.sa')::uuid, format('select count(*)::text from auditoria where clinica_id = %L', current_setting('t.cb'))) <> '0'
  and pg_temp.val(current_setting('t.sa')::uuid, format('select count(*)::text from auditoria where clinica_id = %L', current_setting('t.ca'))) <> '0');
select pg_temp.t('A6 DENTISTA, RECEPCIÓN y ASISTENTE no leen la auditoría de ninguna clínica (ni de la suya): solo owner y superadmin',
  pg_temp.val(current_setting('t.da')::uuid, 'select count(*)::text from auditoria') = '0'
  and pg_temp.val(current_setting('t.ra')::uuid, 'select count(*)::text from auditoria') = '0'
  and pg_temp.val(current_setting('t.aa')::uuid, 'select count(*)::text from auditoria') = '0');

-- ===== Integridad: la bitácora no se falsifica ni se borra
select set_config('t.i1', pg_temp.como(current_setting('t.oa')::uuid, format('insert into auditoria (usuario_id, accion, entidad, clinica_id, detalle) values (%L, ''eliminar_pagos'', ''pagos'', %L, ''{"falso":true}'')', current_setting('t.oa'), current_setting('t.cb'))), false);
select pg_temp.t('I1 un usuario de A NO puede escribir un evento en la bitácora de B declarando clinica_id = B: se rechaza (42501) y B no recibe nada',
  current_setting('t.i1') like 'ERR|42501%' and not exists (select 1 from auditoria where detalle ->> 'falso' = 'true'));
select set_config('t.i1b', pg_temp.como(current_setting('t.oa')::uuid, format('insert into auditoria (usuario_id, accion, entidad, detalle) values (%L, ''exportar'', ''pacientes'', ''{"propio":true}'')', current_setting('t.oa'))), false);
select set_config('t.i1c', pg_temp.como(current_setting('t.oa')::uuid, format('insert into auditoria (usuario_id, accion, entidad, clinica_id, detalle) values (%L, ''exportar'', ''pacientes'', %L, ''{"propio2":true}'')', current_setting('t.oa'), current_setting('t.ca'))), false);
select pg_temp.t('I1b lo legítimo sigue funcionando: un evento sin clínica queda en SU clínica, y uno con SU clínica se acepta',
  current_setting('t.i1b') = 'OK:1' and current_setting('t.i1c') = 'OK:1'
  and exists (select 1 from auditoria where detalle ->> 'propio' = 'true' and clinica_id = current_setting('t.ca')::uuid)
  and exists (select 1 from auditoria where detalle ->> 'propio2' = 'true' and clinica_id = current_setting('t.ca')::uuid));
select pg_temp.t('I2 tampoco puede firmar un evento a nombre de OTRO usuario',
  pg_temp.como(current_setting('t.oa')::uuid, format('insert into auditoria (usuario_id, accion, entidad) values (%L, ''x'', ''y'')', current_setting('t.ob'))) like 'ERR|%');
select pg_temp.t('I3 ningún rol de clínica puede MODIFICAR ni BORRAR la auditoría (afecta 0 filas), ni siquiera la propia',
  pg_temp.como(current_setting('t.oa')::uuid, 'update auditoria set accion = ''x''') in ('OK:0') or pg_temp.como(current_setting('t.oa')::uuid, 'update auditoria set accion = ''x''') like 'ERR|%'
  and (pg_temp.como(current_setting('t.oa')::uuid, 'delete from auditoria') in ('OK:0') or pg_temp.como(current_setting('t.oa')::uuid, 'delete from auditoria') like 'ERR|%')
  and (pg_temp.como(current_setting('t.ob')::uuid, 'delete from auditoria') in ('OK:0') or pg_temp.como(current_setting('t.ob')::uuid, 'delete from auditoria') like 'ERR|%')
  and not exists (select 1 from auditoria where accion = 'x'));

-- ===== Relleno de lo que ya existía (filas viejas con clinica_id NULL), con las reglas de respaldo
set local session_replication_role = replica;  -- simula filas históricas: sin trigger, sin clínica
insert into auditoria (id, usuario_id, accion, entidad, detalle, clinica_id) values
 ('d5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000005', 'crear_pagos', 'pagos', '{"monto":1}', null),                                         -- por el usuario
 ('d5000000-0000-0000-0000-000000000002', null, 'crear_usuarios', 'usuarios', jsonb_build_object('clinica_id', current_setting('t.ca')), null),                    -- por clinica_id del detalle
 ('d5000000-0000-0000-0000-000000000003', null, 'crear_citas', 'citas', jsonb_build_object('paciente_id', (select id from pacientes where nombre_completo = 'Paciente Secreto de B')), null),               -- por paciente_id del detalle
 ('d5000000-0000-0000-0000-000000000004', null, 'editar_planes', 'planes_catalogo', '{"nada":"que ligar"}', null),                                                  -- sin forma de ligarla
 ('d5000000-0000-0000-0000-000000000005', null, 'x', 'y', '{"clinica_id":"esto-no-es-un-uuid"}', null);                                                            -- basura en el detalle: no debe romper
set local session_replication_role = origin;
select set_config('t.rell1', fn_rellenar_clinica_auditoria()::text, false);
select pg_temp.t('R1 el relleno liga por usuario, por clinica_id del detalle y por paciente_id del detalle; no truena con basura; deja sin clínica solo lo imposible de ligar',
  (select clinica_id from auditoria where id = 'd5000000-0000-0000-0000-000000000001') = current_setting('t.cb')::uuid
  and (select clinica_id from auditoria where id = 'd5000000-0000-0000-0000-000000000002') = current_setting('t.ca')::uuid
  and (select clinica_id from auditoria where id = 'd5000000-0000-0000-0000-000000000003') = current_setting('t.cb')::uuid
  and (select clinica_id from auditoria where id = 'd5000000-0000-0000-0000-000000000004') is null
  and (select clinica_id from auditoria where id = 'd5000000-0000-0000-0000-000000000005') is null);
select pg_temp.t('R2 es idempotente: una segunda corrida no liga nada nuevo y no cambia lo ya ligado', fn_rellenar_clinica_auditoria() = 0
  and (select clinica_id from auditoria where id = 'd5000000-0000-0000-0000-000000000001') = current_setting('t.cb')::uuid);
select pg_temp.t('R3 el relleno no toca el contenido (detalle, acción, fecha) de ninguna fila',
  (select detalle from auditoria where id = 'd5000000-0000-0000-0000-000000000001') = '{"monto":1}'::jsonb
  and (select accion from auditoria where id = 'd5000000-0000-0000-0000-000000000001') = 'crear_pagos');
select pg_temp.t('R4 las filas imposibles de ligar son INVISIBLES para los owners (nunca "de nadie = de todos") y las ve el superadmin',
  pg_temp.val(current_setting('t.oa')::uuid, $q$select count(*)::text from auditoria where id in ('d5000000-0000-0000-0000-000000000004','d5000000-0000-0000-0000-000000000005')$q$) = '0'
  and pg_temp.val(current_setting('t.ob')::uuid, $q$select count(*)::text from auditoria where id in ('d5000000-0000-0000-0000-000000000004','d5000000-0000-0000-0000-000000000005')$q$) = '0'
  and pg_temp.val(current_setting('t.sa')::uuid, $q$select count(*)::text from auditoria where id in ('d5000000-0000-0000-0000-000000000004','d5000000-0000-0000-0000-000000000005')$q$) = '2');
select pg_temp.t('R5 las funciones internas no son ejecutables por la API (solo las usa el trigger y la migración)',
  not has_function_privilege('authenticated', 'fn_rellenar_clinica_auditoria()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'fn_clinica_de_auditoria(uuid,jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'fn_rellenar_clinica_auditoria()', 'EXECUTE'));
select pg_temp.t('R6 hay índice por (clínica, fecha) para consultar rápido',
  exists (select 1 from pg_indexes where tablename = 'auditoria' and indexname = 'idx_auditoria_clinica_fecha'));
select pg_temp.t('R7 las acciones de plan hechas por funciones internas (clinica_id explícito) conservan SU clínica: el trigger no las pisa',
  (select clinica_id from auditoria where accion = 'asignar_plan' and clinica_id = current_setting('t.ca')::uuid limit 1) = current_setting('t.ca')::uuid);

do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO AUDITORÍA-AISLAMIENTO: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 140), ' | ') from _res where not ok); end if;
end $$;
rollback;
