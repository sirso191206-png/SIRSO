-- Políticas RLS de notas_clinicas: qué hacen DE VERDAD con una sesión autenticada (JWT), no con el SQL Editor.
\set ON_ERROR_STOP on
\set QUIET on
begin;
create temp table _res (ok boolean, nombre text);
create function pg_temp.t(p_nombre text, p_cond boolean) returns void language plpgsql as $$
begin insert into _res values (coalesce(p_cond,false), p_nombre); raise notice '% %', case when coalesce(p_cond,false) then 'PASS' else 'FAIL' end, p_nombre; end $$;
-- Ejecuta p_sql con ese rol de PostgreSQL y esas claims JWT. Devuelve el valor o 'ERR|sqlstate|mensaje'.
create function pg_temp.como(p_rol text, p_uid uuid, p_sql text, p_claims jsonb default '{}'::jsonb) returns text language plpgsql as $$
declare v text; m text; c text;
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '' else (jsonb_build_object('sub', p_uid, 'role', p_rol) || p_claims)::text end, true);
  execute format('set local role %I', p_rol);
  begin execute p_sql into v; reset role; return v;
  exception when others then get stacked diagnostics m = message_text, c = returned_sqlstate; reset role; return 'ERR|'||c||'|'||m; end;
end $$;
create function pg_temp.vistas(p_rol text, p_uid uuid) returns text language sql as $$ select pg_temp.como(p_rol, p_uid, 'select count(*)::text from notas_clinicas') $$;
-- OJO: el expediente_id va EXPLÍCITO (se resuelve aquí, como superusuario). Con un INSERT ... SELECT FROM expedientes el SELECT se
-- filtraría por el RLS del propio usuario: si no ve el expediente no inserta NADA y devuelve '0' — el caso "denegado" pasaría sin
-- haber probado la política notas_insert.
create function pg_temp.ins_exp(p_rol text, p_uid uuid, p_exp uuid, p_claims jsonb default '{}'::jsonb) returns text language sql as $$
  select pg_temp.como(p_rol, p_uid, format('with i as (insert into notas_clinicas (expediente_id, usuario_id, contenido, tipo) values (%L, %L, ''n'', ''consulta'') returning 1) select count(*)::text from i', p_exp, p_uid), p_claims)
$$;
create function pg_temp.insertar(p_rol text, p_uid uuid, p_paciente text) returns text language sql as $$
  select pg_temp.ins_exp(p_rol, p_uid, (select id from expedientes where paciente_id = p_paciente::uuid))
$$;

insert into auth.users (id, email) select ('a6000000-0000-0000-0000-0000000000'||lpad(g::text,2,'0'))::uuid, 'nr'||g||'@x.mx' from generate_series(1,8) g;
insert into clinicas (id, nombre) values ('c6000000-0000-0000-0000-00000000000a','A'),('c6000000-0000-0000-0000-00000000000b','B');
select fn_asignar_plan_interno(null, c, 'empresarial', 'mensual') from unnest(array['c6000000-0000-0000-0000-00000000000a','c6000000-0000-0000-0000-00000000000b']::uuid[]) c;
insert into usuarios (id, clinica_id, nombre, correo, rol) values
 ('a6000000-0000-0000-0000-000000000001','c6000000-0000-0000-0000-00000000000a','Owner A','nr1@x.mx','owner'),
 ('a6000000-0000-0000-0000-000000000002','c6000000-0000-0000-0000-00000000000a','Dentista D','nr2@x.mx','dentista'),
 ('a6000000-0000-0000-0000-000000000003','c6000000-0000-0000-0000-00000000000a','Dentista D2','nr3@x.mx','dentista'),
 ('a6000000-0000-0000-0000-000000000004','c6000000-0000-0000-0000-00000000000a','Asistente','nr4@x.mx','asistente'),
 ('a6000000-0000-0000-0000-000000000005','c6000000-0000-0000-0000-00000000000a','Recepción','nr5@x.mx','recepcion'),
 ('a6000000-0000-0000-0000-000000000006','c6000000-0000-0000-0000-00000000000b','Owner B','nr6@x.mx','owner');
insert into asistente_dentista_asignaciones (clinica_id, asistente_id, dentista_id) values ('c6000000-0000-0000-0000-00000000000a','a6000000-0000-0000-0000-000000000004','a6000000-0000-0000-0000-000000000002');
insert into pacientes (id, clinica_id, nombre_completo, dentista_responsable_id) values
 ('b6000000-0000-0000-0000-000000000001','c6000000-0000-0000-0000-00000000000a','P1 (de D)','a6000000-0000-0000-0000-000000000002'),
 ('b6000000-0000-0000-0000-000000000003','c6000000-0000-0000-0000-00000000000a','P3 (de D2)','a6000000-0000-0000-0000-000000000003'),
 ('b6000000-0000-0000-0000-00000000000b','c6000000-0000-0000-0000-00000000000b','PB','a6000000-0000-0000-0000-000000000006');
insert into notas_clinicas (id, expediente_id, usuario_id, contenido, tipo)
  select ('d6000000-0000-0000-0000-00000000000'||n)::uuid, e.id, 'a6000000-0000-0000-0000-000000000001', 'sembrada', 'consulta'
    from (values (1,'b6000000-0000-0000-0000-000000000001'),(3,'b6000000-0000-0000-0000-000000000003'),(4,'b6000000-0000-0000-0000-00000000000b')) v(n, p) join expedientes e on e.paciente_id = v.p::uuid;
select set_config('t.o','a6000000-0000-0000-0000-000000000001',false), set_config('t.d','a6000000-0000-0000-0000-000000000002',false), set_config('t.d2','a6000000-0000-0000-0000-000000000003',false),
       set_config('t.as','a6000000-0000-0000-0000-000000000004',false), set_config('t.re','a6000000-0000-0000-0000-000000000005',false), set_config('t.ob','a6000000-0000-0000-0000-000000000006',false);

-- ===== N1: las funciones auxiliares DENTRO de una sesión autenticada =====
select pg_temp.t('N1 que auth.uid()/auth_rol()/auth_clinica_id() den NULL en el SQL Editor NO es lo que pasa en la aplicación: con el JWT de un dentista devuelven su id, su rol y su clínica, y fn_sesion_activa() y el plan dan true',
  pg_temp.como('authenticated', current_setting('t.d')::uuid, 'select auth.uid()::text') = current_setting('t.d')
  and pg_temp.como('authenticated', current_setting('t.d')::uuid, 'select auth_rol()') = 'dentista'
  and pg_temp.como('authenticated', current_setting('t.d')::uuid, 'select auth_clinica_id()::text') = 'c6000000-0000-0000-0000-00000000000a'
  and pg_temp.como('authenticated', current_setting('t.d')::uuid, 'select fn_sesion_activa()::text') = 'true'
  and pg_temp.como('authenticated', current_setting('t.d')::uuid, $q$select fn_clinica_tiene_funcionalidad(auth_clinica_id(), 'notas_clinicas')::text$q$) = 'true');
select pg_temp.t('N1b …y SIN JWT (lo que ve el SQL Editor) esas funciones sí son NULL: por eso ahí NO se puede concluir nada sobre la sesión real; y un anónimo tampoco obtiene identidad ni clínica',
  pg_temp.como('authenticated', null, 'select coalesce(auth.uid()::text, ''NULL'')') = 'NULL' and pg_temp.como('authenticated', null, 'select coalesce(auth_rol(), ''NULL'')') = 'NULL'
  and pg_temp.como('anon', null, 'select coalesce(auth_clinica_id()::text, ''NULL'')') = 'NULL' and pg_temp.como('anon', null, 'select coalesce(auth_rol(), ''NULL'')') = 'NULL');
-- ===== N2: inventario de políticas (no se eliminó ni se debilitó ninguna) =====
select pg_temp.t('N2 las 4 políticas siguen exactamente como se describieron: notas_insert y notas_select (permisivas), plan_func_notas_clinicas y sesion_activa_notas_clinicas (RESTRICTIVAS, ALL, authenticated); RLS activo; ninguna para anon',
  (select count(*) from pg_policies where tablename = 'notas_clinicas') = 4
  and (select permissive || cmd from pg_policies where tablename = 'notas_clinicas' and policyname = 'notas_insert') = 'PERMISSIVEINSERT'
  and (select permissive || cmd from pg_policies where tablename = 'notas_clinicas' and policyname = 'notas_select') = 'PERMISSIVESELECT'
  and (select permissive || cmd || roles::text from pg_policies where tablename = 'notas_clinicas' and policyname = 'plan_func_notas_clinicas') = 'RESTRICTIVEALL{authenticated}'
  and (select permissive || cmd || roles::text from pg_policies where tablename = 'notas_clinicas' and policyname = 'sesion_activa_notas_clinicas') = 'RESTRICTIVEALL{authenticated}'
  and (select relrowsecurity from pg_class where oid = 'notas_clinicas'::regclass) and not exists (select 1 from pg_policies where tablename = 'notas_clinicas' and 'anon' = any (roles)));
-- ===== N3: anónimos =====
select pg_temp.t('N3 un ANÓNIMO no lee ni escribe notas aunque las políticas permisivas sean para "public" (las funciones de identidad devuelven NULL → ninguna condición se cumple): 0 filas visibles y el INSERT se rechaza',
  (pg_temp.como('anon', null, 'select count(*)::text from notas_clinicas') = '0'
   or pg_temp.como('anon', null, 'select count(*)::text from notas_clinicas') like 'ERR|42501%') -- 120: sin SELECT para anon
  and pg_temp.ins_exp('anon', null, (select id from expedientes where paciente_id = 'b6000000-0000-0000-0000-000000000001')) like 'ERR|42501|%');
-- ===== N4-N6: quién puede insertar y quién puede leer =====
select pg_temp.t('N4 pueden INSERTAR (con JWT real): el dentista con SU paciente y el owner con cualquiera de su clínica',
  pg_temp.insertar('authenticated', current_setting('t.d')::uuid, 'b6000000-0000-0000-0000-000000000001') = '1'
  and pg_temp.insertar('authenticated', current_setting('t.o')::uuid, 'b6000000-0000-0000-0000-000000000003') = '1');
select pg_temp.t('N5 NO pueden insertar: asistente y recepción (rol), el dentista con un paciente que no es suyo, y NADIE entre clínicas (owner B → paciente de A, owner A → paciente de B, dentista A → paciente de B)',
  pg_temp.insertar('authenticated', current_setting('t.as')::uuid, 'b6000000-0000-0000-0000-000000000001') like 'ERR|42501|%'
  and pg_temp.insertar('authenticated', current_setting('t.re')::uuid, 'b6000000-0000-0000-0000-000000000001') like 'ERR|42501|%'
  and pg_temp.insertar('authenticated', current_setting('t.d')::uuid, 'b6000000-0000-0000-0000-000000000003') like 'ERR|42501|%'
  and pg_temp.insertar('authenticated', current_setting('t.ob')::uuid, 'b6000000-0000-0000-0000-000000000001') like 'ERR|42501|%'
  and pg_temp.insertar('authenticated', current_setting('t.o')::uuid, 'b6000000-0000-0000-0000-00000000000b') like 'ERR|42501|%'
  and pg_temp.insertar('authenticated', current_setting('t.d')::uuid, 'b6000000-0000-0000-0000-00000000000b') like 'ERR|42501|%');
select pg_temp.t('N6 LECTURA: el dentista ve solo las de SU paciente; el asistente las del paciente del dentista al que apoya; recepción ninguna; el owner todas las de su clínica; el owner de B ninguna de A y solo la suya',
  pg_temp.como('authenticated', current_setting('t.d')::uuid, $q$select count(*)::text from notas_clinicas where contenido = 'sembrada'$q$) = '1'
  and pg_temp.como('authenticated', current_setting('t.d2')::uuid, $q$select count(*)::text from notas_clinicas where contenido = 'sembrada'$q$) = '1'
  and pg_temp.como('authenticated', current_setting('t.as')::uuid, $q$select count(*)::text from notas_clinicas where contenido = 'sembrada'$q$) = '1'
  and pg_temp.como('authenticated', current_setting('t.re')::uuid, 'select count(*)::text from notas_clinicas') = '0'
  and pg_temp.como('authenticated', current_setting('t.o')::uuid, $q$select count(*)::text from notas_clinicas where contenido = 'sembrada'$q$) = '2'
  and pg_temp.como('authenticated', current_setting('t.ob')::uuid, 'select count(*)::text from notas_clinicas') = '1');
-- ===== N7: inmutabilidad y por qué el upsert fallaba =====
select pg_temp.t('N7 las notas son INMUTABLES: ni owner ni dentista pueden UPDATE ni DELETE (permission denied); un upsert (ON CONFLICT DO UPDATE) también — causa de que crearNotaClinica fallara —; y un INSERT con un id ya usado da 23505 (base de la idempotencia)',
  pg_temp.como('authenticated', current_setting('t.o')::uuid, $q$with d as (update notas_clinicas set contenido = 'x' returning 1) select count(*)::text from d$q$) like 'ERR|42501|%'
  and pg_temp.como('authenticated', current_setting('t.d')::uuid, $q$with d as (delete from notas_clinicas returning 1) select count(*)::text from d$q$) like 'ERR|42501|%'
  and pg_temp.como('authenticated', current_setting('t.d')::uuid, $q$with d as (insert into notas_clinicas (id, expediente_id, contenido) select 'd6000000-0000-0000-0000-000000000001', id, 'x' from expedientes where paciente_id = 'b6000000-0000-0000-0000-000000000001' on conflict (id) do update set contenido = excluded.contenido returning 1) select count(*)::text from d$q$) like 'ERR|42501|permission denied%'
  and pg_temp.como('authenticated', current_setting('t.d')::uuid, $q$with d as (insert into notas_clinicas (id, expediente_id, contenido) select 'd6000000-0000-0000-0000-000000000001', id, 'x' from expedientes where paciente_id = 'b6000000-0000-0000-0000-000000000001' returning 1) select count(*)::text from d$q$) like 'ERR|23505|%');
-- ===== N8: la política RESTRICTIVA del plan sigue mandando =====
update suscripcion_funcionalidades set habilitada = false where funcionalidad = 'notas_clinicas' and suscripcion_id = (select id from suscripciones where clinica_id = 'c6000000-0000-0000-0000-00000000000a' and estado <> 'reemplazada');
select pg_temp.t('N8 sin la funcionalidad "notas_clinicas" en el plan, ni el owner lee (0 filas) ni escribe (RLS), aunque las políticas permisivas lo permitirían: la restrictiva plan_func_notas_clinicas funciona; y la clínica B no se ve afectada',
  pg_temp.vistas('authenticated', current_setting('t.o')::uuid) = '0'
  and pg_temp.insertar('authenticated', current_setting('t.o')::uuid, 'b6000000-0000-0000-0000-000000000001') like 'ERR|42501|%'
  and pg_temp.vistas('authenticated', current_setting('t.ob')::uuid) = '1');
update suscripcion_funcionalidades set habilitada = true where funcionalidad = 'notas_clinicas' and suscripcion_id = (select id from suscripciones where clinica_id = 'c6000000-0000-0000-0000-00000000000a' and estado <> 'reemplazada');
-- ===== N9: la política RESTRICTIVA de sesión =====
update plataforma_config set valor = 'on' where clave = 'control_sesiones_estricto';
select pg_temp.t('N9 con el control estricto de sesiones ENCENDIDO, una sesión revocada (session_id que no existe) no lee ni escribe: la restrictiva sesion_activa_notas_clinicas funciona; una sesión sin session_id (token antiguo) sigue funcionando',
  pg_temp.como('authenticated', current_setting('t.o')::uuid, 'select count(*)::text from notas_clinicas', jsonb_build_object('session_id', 'aaaaaaaa-0000-0000-0000-000000000001')) = '0'
  and pg_temp.ins_exp('authenticated', current_setting('t.d')::uuid, (select id from expedientes where paciente_id = 'b6000000-0000-0000-0000-000000000001'), jsonb_build_object('session_id', 'aaaaaaaa-0000-0000-0000-000000000001')) like 'ERR|42501|%'
  and pg_temp.vistas('authenticated', current_setting('t.o')::uuid) <> '0');
update plataforma_config set valor = 'off' where clave = 'control_sesiones_estricto';
-- ===== N10: clínica suspendida =====
update clinicas set estado = 'suspendida' where id = 'c6000000-0000-0000-0000-00000000000a';
select pg_temp.t('N10 con la clínica SUSPENDIDA nadie de esa clínica lee ni escribe notas (auth_clinica_id() es NULL), y la otra clínica sigue normal',
  pg_temp.vistas('authenticated', current_setting('t.o')::uuid) = '0' and pg_temp.vistas('authenticated', current_setting('t.d')::uuid) = '0'
  and pg_temp.insertar('authenticated', current_setting('t.d')::uuid, 'b6000000-0000-0000-0000-000000000001') like 'ERR|42501|%'
  and pg_temp.vistas('authenticated', current_setting('t.ob')::uuid) = '1');
update clinicas set estado = 'activa' where id = 'c6000000-0000-0000-0000-00000000000a';
select pg_temp.t('N11 al reactivarla todo vuelve (nada se perdió ni quedó bloqueado)', pg_temp.vistas('authenticated', current_setting('t.o')::uuid) = '5' or pg_temp.vistas('authenticated', current_setting('t.o')::uuid)::int >= 3);

do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO NOTAS-RLS: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 150), ' | ') from _res where not ok); end if;
end $$;
rollback;
