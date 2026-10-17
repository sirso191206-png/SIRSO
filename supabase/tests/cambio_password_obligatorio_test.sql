-- Migración 103: cambio obligatorio de la contraseña temporal, validado en el servidor.
\set ON_ERROR_STOP on
\set QUIET on
begin;
create temp table _res (ok boolean, nombre text);
create function pg_temp.t(p_nombre text, p_cond boolean) returns void language plpgsql as $$
begin insert into _res values (coalesce(p_cond,false), p_nombre); raise notice '% %', case when coalesce(p_cond,false) then 'PASS' else 'FAIL' end, p_nombre; end $$;
-- Ejecuta p_sql (un SELECT que devuelve un valor) como ese usuario con JWT. Devuelve el valor o 'ERR|hint|mensaje'.
create function pg_temp.como(p_uid uuid, p_sql text, p_claims jsonb default '{}'::jsonb) returns text language plpgsql as $$
declare v text; h text; m text;
begin
  perform set_config('request.jwt.claims', (jsonb_build_object('sub', p_uid, 'role', 'authenticated') || p_claims)::text, true);
  set local role authenticated;
  begin execute p_sql into v; reset role; return v;
  exception when others then
    get stacked diagnostics h = pg_exception_hint, m = message_text; reset role; return 'ERR|'||coalesce(nullif(h, ''), sqlstate)||'|'||m; end;
end $$;
create function pg_temp.fin(p_uid text, p_cita text, p_motivo text default 'Dolor', p_nota text default null, p_seg text default null, p_esperado text default null) returns text language sql as $$
  select pg_temp.como(p_uid::uuid, format('select fn_finalizar_consulta(%L::uuid, %L, %L::jsonb, %L::jsonb, %L::timestamptz)::text', p_cita, p_motivo, p_nota, p_seg, p_esperado));
$$;
create function pg_temp.j(p text) returns jsonb language sql as $$ select case when p like 'ERR|%' then null else p::jsonb end $$;  -- un error de la función hace FALLAR la aserción (con nombre), no reventar la prueba
create function pg_temp.hint(p text) returns text language sql as $$ select case when p like 'ERR|%' then split_part(p, '|', 2) else 'OK' end $$;
create function pg_temp.msg(p text) returns text language sql as $$ select case when p like 'ERR|%' then split_part(p, '|', 3) else p end $$;

insert into auth.users (id, email) select ('a8000000-0000-0000-0000-0000000000'||lpad(g::text,2,'0'))::uuid, 'fc'||g||'@x.mx' from generate_series(1,12) g;
insert into clinicas (id, nombre) values ('c8000000-0000-0000-0000-00000000000a','A'),('c8000000-0000-0000-0000-00000000000b','B');
select fn_asignar_plan_interno(null, c, 'empresarial', 'mensual') from unnest(array['c8000000-0000-0000-0000-00000000000a','c8000000-0000-0000-0000-00000000000b']::uuid[]) c;
insert into usuarios (id, clinica_id, nombre, correo, rol) values
 ('a8000000-0000-0000-0000-000000000001','c8000000-0000-0000-0000-00000000000a','Owner A','fc1@x.mx','owner'),
 ('a8000000-0000-0000-0000-000000000002','c8000000-0000-0000-0000-00000000000a','Dentista D','fc2@x.mx','dentista'),
 ('a8000000-0000-0000-0000-000000000003','c8000000-0000-0000-0000-00000000000a','Dentista D2','fc3@x.mx','dentista'),
 ('a8000000-0000-0000-0000-000000000004','c8000000-0000-0000-0000-00000000000a','Asistente','fc4@x.mx','asistente'),
 ('a8000000-0000-0000-0000-000000000005','c8000000-0000-0000-0000-00000000000a','Recepción','fc5@x.mx','recepcion'),
 ('a8000000-0000-0000-0000-000000000006','c8000000-0000-0000-0000-00000000000b','Owner B','fc6@x.mx','owner'),
 ('a8000000-0000-0000-0000-000000000007','c8000000-0000-0000-0000-00000000000b','Dentista B','fc7@x.mx','dentista');
insert into asistente_dentista_asignaciones (clinica_id, asistente_id, dentista_id) values ('c8000000-0000-0000-0000-00000000000a','a8000000-0000-0000-0000-000000000004','a8000000-0000-0000-0000-000000000002');
insert into pacientes (id, clinica_id, nombre_completo, dentista_responsable_id) values
 ('b8000000-0000-0000-0000-000000000001','c8000000-0000-0000-0000-00000000000a','P1 (de D)','a8000000-0000-0000-0000-000000000002'),
 ('b8000000-0000-0000-0000-000000000002','c8000000-0000-0000-0000-00000000000a','P2 (sin responsable)',null),
 ('b8000000-0000-0000-0000-000000000003','c8000000-0000-0000-0000-00000000000a','P3 (de D2)','a8000000-0000-0000-0000-000000000003'),
 ('b8000000-0000-0000-0000-00000000000b','c8000000-0000-0000-0000-00000000000b','PB (de Dentista B)','a8000000-0000-0000-0000-000000000007');
insert into sucursales (id, clinica_id, nombre) values ('f8000000-0000-0000-0000-000000000001','c8000000-0000-0000-0000-00000000000a','Sucursal 1');
-- citas (todas en consulta salvo las indicadas). Horarios espaciados: el constraint impide traslapes del mismo dentista.
insert into citas (id, paciente_id, dentista_id, inicio, fin, estado, sucursal_id) values
 ('a9000000-0000-0000-0000-000000000001','b8000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000002','2031-03-01 09:00+00','2031-03-01 09:30+00','en_consulta',null),
 ('a9000000-0000-0000-0000-000000000002','b8000000-0000-0000-0000-000000000002','a8000000-0000-0000-0000-000000000002','2031-03-02 09:00+00','2031-03-02 09:30+00','en_consulta',null),
 ('a9000000-0000-0000-0000-000000000003','b8000000-0000-0000-0000-000000000003','a8000000-0000-0000-0000-000000000002','2031-03-03 09:00+00','2031-03-03 09:30+00','en_consulta',null),
 ('a9000000-0000-0000-0000-000000000004','b8000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000002','2031-03-04 09:00+00','2031-03-04 09:30+00','en_consulta','f8000000-0000-0000-0000-000000000001'),
 ('a9000000-0000-0000-0000-000000000005','b8000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000002','2031-03-05 09:00+00','2031-03-05 09:30+00','cancelada',null),
 ('a9000000-0000-0000-0000-000000000006','b8000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000002','2031-03-06 09:00+00','2031-03-06 09:30+00','no_asistio',null),
 ('a9000000-0000-0000-0000-000000000007','b8000000-0000-0000-0000-000000000003','a8000000-0000-0000-0000-000000000002','2031-03-07 09:00+00','2031-03-07 09:30+00','en_consulta',null),   -- paciente de D2 pero cita de D
 ('a9000000-0000-0000-0000-000000000008','b8000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000002','2031-03-08 09:00+00','2031-03-08 09:30+00','en_consulta',null),
 ('a9000000-0000-0000-0000-000000000009','b8000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000002','2031-03-09 09:00+00','2031-03-09 09:30+00','en_consulta',null),
 ('a9000000-0000-0000-0000-00000000000a','b8000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000002','2031-03-10 09:00+00','2031-03-10 09:30+00','en_consulta',null),
 ('a9000000-0000-0000-0000-00000000000b','b8000000-0000-0000-0000-00000000000b','a8000000-0000-0000-0000-000000000007','2031-03-01 09:00+00','2031-03-01 09:30+00','en_consulta',null),
 ('a9000000-0000-0000-0000-00000000000c','b8000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000002','2031-03-12 09:00+00','2031-03-12 09:30+00','en_consulta',null),
 ('a9000000-0000-0000-0000-00000000000d','b8000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000002','2031-03-13 09:00+00','2031-03-13 09:30+00','en_consulta',null),
 ('a9000000-0000-0000-0000-00000000000e','b8000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000002','2031-03-14 09:00+00','2031-03-14 09:30+00','en_consulta',null),
 ('a9000000-0000-0000-0000-00000000000f','b8000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000002','2031-03-15 09:00+00','2031-03-15 09:30+00','en_consulta',null);
select set_config('t.o','a8000000-0000-0000-0000-000000000001',false), set_config('t.d','a8000000-0000-0000-0000-000000000002',false), set_config('t.d2','a8000000-0000-0000-0000-000000000003',false),
       set_config('t.as','a8000000-0000-0000-0000-000000000004',false), set_config('t.re','a8000000-0000-0000-0000-000000000005',false),
       set_config('t.ob','a8000000-0000-0000-0000-000000000006',false), set_config('t.db','a8000000-0000-0000-0000-000000000007',false);
create function pg_temp.estado(p text) returns text language sql as $$ select estado from citas where id = p::uuid $$;
create function pg_temp.notas(p text) returns bigint language sql as $$ select count(*) from notas_clinicas where cita_id = p::uuid $$;
create function pg_temp.citas_del_paciente(p text) returns bigint language sql as $$ select count(*) from citas where paciente_id = p::uuid $$;
create function pg_temp.nota(id text, contenido text default 'Se atendió') returns text language sql as $$ select jsonb_build_object('id', id, 'contenido', contenido, 'diagnostico', 'Caries', 'interrogatorio_sistemas', jsonb_build_object('a', 1))::text $$;


create function pg_temp.dml(p_uid text, p_sql text) returns text language sql as $$ select pg_temp.como(p_uid::uuid, 'with x as (' || p_sql || ' returning 1) select count(*)::text from x') $$;
create function pg_temp.cnt(p_uid text, p_tabla text) returns text language sql as $$ select pg_temp.como(p_uid::uuid, 'select count(*)::text from ' || p_tabla) $$;
create function pg_temp.marca(p_uid text, p_val boolean) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims', '', true); update usuarios set debe_cambiar_password = p_val where id = p_uid::uuid; end $$;

insert into storage.objects (bucket_id, name, metadata) values ('logos-clinicas', 'c8000000-0000-0000-0000-00000000000a/logo.png', '{"size":1}');
select set_config('t.base_pac', pg_temp.cnt(current_setting('t.d'), 'pacientes'), false), set_config('t.base_cit', pg_temp.cnt(current_setting('t.d'), 'citas'), false), set_config('t.base_usr', pg_temp.cnt(current_setting('t.d'), 'usuarios'), false), set_config('t.base_ow', pg_temp.cnt(current_setting('t.o'), 'pacientes'), false), set_config('t.base_logo', pg_temp.cnt(current_setting('t.d'), 'storage.objects'), false);
select pg_temp.t('W1 un usuario SIN el cambio pendiente (todos los existentes) conserva su acceso: ve pacientes, citas, compañeros de clínica y los logos de su clínica',
  current_setting('t.base_pac')::int > 0 and current_setting('t.base_cit')::int > 0 and current_setting('t.base_usr')::int > 1 and current_setting('t.base_logo')::int > 0
  and not exists (select 1 from usuarios where debe_cambiar_password));
select pg_temp.marca(current_setting('t.d'), true);
select set_config('t.pac', pg_temp.cnt(current_setting('t.d'), 'pacientes'), false), set_config('t.cit', pg_temp.cnt(current_setting('t.d'), 'citas'), false), set_config('t.not', pg_temp.cnt(current_setting('t.d'), 'notas_clinicas'), false), set_config('t.usr', pg_temp.cnt(current_setting('t.d'), 'usuarios'), false),
       set_config('t.logo', pg_temp.cnt(current_setting('t.d'), 'storage.objects'), false), set_config('t.pag', pg_temp.cnt(current_setting('t.d'), 'pagos'), false), set_config('t.suc', pg_temp.cnt(current_setting('t.d'), 'sucursales'), false),
       set_config('t.yo', pg_temp.como(current_setting('t.d')::uuid, 'select debe_cambiar_password::text from usuarios where id = auth.uid()'), false);
select pg_temp.t('W2 con el cambio PENDIENTE no se ve NINGÚN dato de la clínica (pacientes, citas, notas, pagos, sucursales, archivos): 0 filas; solo la propia fila de usuarios, donde se lee el indicador',
  current_setting('t.pac') = '0' and current_setting('t.cit') = '0' and current_setting('t.not') = '0' and current_setting('t.pag') = '0' and current_setting('t.suc') = '0' and current_setting('t.logo') = '0' and current_setting('t.usr') = '1' and current_setting('t.yo') = 'true');
select set_config('t.w3a', pg_temp.dml(current_setting('t.d'), format('insert into pacientes (clinica_id, nombre_completo) values (%L, ''Intruso'')', 'c8000000-0000-0000-0000-00000000000a')), false),
       set_config('t.w3b', pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000001', 'Dolor', pg_temp.nota('d1000000-0000-0000-0000-0000000000a1')), false),
       set_config('t.w3c', pg_temp.dml(current_setting('t.d'), 'update citas set notas = ''x'' where true'), false);
select pg_temp.t('W3 con el cambio pendiente tampoco se puede ESCRIBIR ni invocar las funciones del servidor: crear paciente (RLS), finalizar una consulta (RPC) y modificar citas se rechazan',
  current_setting('t.w3a') like 'ERR|%' and ((pg_temp.j(current_setting('t.w3b')) ->> 'ok') is distinct from 'true' or current_setting('t.w3b') like 'ERR|%') and current_setting('t.w3c') in ('0') 
  and not exists (select 1 from pacientes where nombre_completo = 'Intruso') and not exists (select 1 from notas_clinicas where cita_id = 'a9000000-0000-0000-0000-000000000001'));
select set_config('t.p1', pg_temp.dml(current_setting('t.d'), format('update usuarios set debe_cambiar_password = false where id = %L', current_setting('t.d'))), false), set_config('t.p2', pg_temp.dml(current_setting('t.d'), format('update usuarios set nombre = ''Nuevo'' where id = %L', current_setting('t.d'))), false),
       set_config('t.p3', pg_temp.dml(current_setting('t.d'), format('update usuarios set ultimo_acceso = now() where id = %L', current_setting('t.d'))), false), set_config('t.p4', pg_temp.dml(current_setting('t.o'), format('update usuarios set debe_cambiar_password = true where id = %L', current_setting('t.re'))), false),
       set_config('t.p5', pg_temp.dml(current_setting('t.o'), format('update usuarios set debe_cambiar_password = false where id = %L', current_setting('t.d'))), false);
select pg_temp.t('W4 el INDICADOR solo lo escribe el servidor: el propio usuario no puede quitárselo (CAMBIO_PASSWORD_INDICADOR_PROTEGIDO), ni el propietario ponerlo o quitarlo a otro; con el cambio pendiente no se edita el perfil (CAMBIO_PASSWORD_PENDIENTE) salvo `ultimo_acceso`',
  pg_temp.hint(current_setting('t.p1')) = 'CAMBIO_PASSWORD_INDICADOR_PROTEGIDO' and pg_temp.hint(current_setting('t.p2')) = 'CAMBIO_PASSWORD_PENDIENTE' and current_setting('t.p3') = '1'
  and pg_temp.hint(current_setting('t.p4')) = 'CAMBIO_PASSWORD_INDICADOR_PROTEGIDO' and pg_temp.hint(current_setting('t.p5')) = 'CAMBIO_PASSWORD_INDICADOR_PROTEGIDO'
  and (select debe_cambiar_password from usuarios where id = current_setting('t.d')::uuid) and not (select debe_cambiar_password from usuarios where id = current_setting('t.re')::uuid));
select set_config('t.o_pac', pg_temp.cnt(current_setting('t.o'), 'pacientes'), false);
select pg_temp.t('W5 aislamiento: mientras UN usuario tiene el cambio pendiente, los demás de la misma clínica siguen trabajando con normalidad', current_setting('t.o_pac') = current_setting('t.base_ow') and current_setting('t.o_pac')::int > 0);
select pg_temp.marca(current_setting('t.o'), true);
update usuarios set es_super_admin = true where id = current_setting('t.o')::uuid;
select set_config('t.sa', pg_temp.como(current_setting('t.o')::uuid, 'select fn_es_super_admin()::text'), false), set_config('t.ow_ins', pg_temp.dml(current_setting('t.o'), format('insert into usuarios (id, clinica_id, nombre, correo, rol) values (gen_random_uuid(), %L, ''Nuevo'', ''n@x.mx'', ''recepcion'')', 'c8000000-0000-0000-0000-00000000000a')), false),
       set_config('t.ow_pac', pg_temp.cnt(current_setting('t.o'), 'pacientes'), false), set_config('t.ow_rol', pg_temp.como(current_setting('t.o')::uuid, 'select coalesce(auth_rol(), ''(nada)'')'), false);
select pg_temp.t('W6 un PROPIETARIO (incluso superadministrador) con el cambio pendiente deja de serlo mientras tanto: fn_es_super_admin() = false, auth_rol() vacío, no ve pacientes y no puede crear usuarios',
  current_setting('t.sa') = 'false' and current_setting('t.ow_rol') = '(nada)' and current_setting('t.ow_pac') = '0' and current_setting('t.ow_ins') like 'ERR|%');
select pg_temp.marca(current_setting('t.o'), false); select pg_temp.marca(current_setting('t.d'), false);
update usuarios set es_super_admin = false where id = current_setting('t.o')::uuid;
select set_config('t.f_pac', pg_temp.cnt(current_setting('t.d'), 'pacientes'), false), set_config('t.f_cit', pg_temp.cnt(current_setting('t.d'), 'citas'), false), set_config('t.f_logo', pg_temp.cnt(current_setting('t.d'), 'storage.objects'), false),
       set_config('t.f_up', pg_temp.dml(current_setting('t.d'), format('update usuarios set nombre = ''Dr. Actualizado'' where id = %L', current_setting('t.d'))), false),
       set_config('t.f_fin', pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000001', 'Dolor', pg_temp.nota('d1000000-0000-0000-0000-0000000000a1')), false);
select pg_temp.t('W7 cuando el SERVIDOR quita el indicador, el acceso se restablece por completo (mismos pacientes, citas y archivos que antes) y el perfil vuelve a poder editarse',
  current_setting('t.f_pac') = current_setting('t.base_pac') and current_setting('t.f_cit') = current_setting('t.base_cit') and current_setting('t.f_logo') = current_setting('t.base_logo') and current_setting('t.f_up') = '1'
  and (pg_temp.j(current_setting('t.f_fin')) ->> 'ok') = 'true' and exists (select 1 from notas_clinicas where cita_id = 'a9000000-0000-0000-0000-000000000001'));   -- CONTROL: la MISMA llamada que W3 rechazó funciona al quitar el indicador
insert into auth.users (id) values ('a8000000-0000-0000-0000-0000000000f1'), ('a8000000-0000-0000-0000-0000000000f2');
select set_config('t.i1', pg_temp.dml(current_setting('t.o'), format('insert into usuarios (id, clinica_id, nombre, correo, rol, debe_cambiar_password) values (''a8000000-0000-0000-0000-0000000000f1'', %L, ''Nuevo'', ''f1@x.mx'', ''recepcion'', true)', 'c8000000-0000-0000-0000-00000000000a')), false),
       set_config('t.i2', pg_temp.dml(current_setting('t.o'), format('insert into usuarios (id, clinica_id, nombre, correo, rol, debe_cambiar_password) values (''a8000000-0000-0000-0000-0000000000f2'', %L, ''Nuevo'', ''f2@x.mx'', ''recepcion'', false)', 'c8000000-0000-0000-0000-00000000000a')), false);
select pg_temp.t('W7b un usuario (aun siendo propietario) no puede CREAR una fila con el indicador en true (CAMBIO_PASSWORD_INDICADOR_PROTEGIDO); sin el indicador la crea con normalidad: solo el servidor lo escribe',
  pg_temp.hint(current_setting('t.i1')) = 'CAMBIO_PASSWORD_INDICADOR_PROTEGIDO' and current_setting('t.i2') = '1' and not exists (select 1 from usuarios where id = 'a8000000-0000-0000-0000-0000000000f1'));
select pg_temp.t('W8 estructura: la columna es booleana, NOT NULL y por omisión false; el disparador existe; la función del disparador no es invocable por usuarios; los cuatro ayudantes comprueban el indicador',
  (select data_type = 'boolean' and is_nullable = 'NO' and column_default = 'false' from information_schema.columns where table_name = 'usuarios' and column_name = 'debe_cambiar_password')
  and exists (select 1 from pg_trigger where tgname = 'trg_proteger_debe_cambiar_password' and not tgisinternal)
  and not has_function_privilege('authenticated', 'fn_proteger_debe_cambiar_password()', 'EXECUTE')
  and (select count(*) from pg_proc where proname in ('auth_clinica_id', 'auth_clinica_id_raw', 'auth_rol', 'fn_es_super_admin') and pronamespace = 'public'::regnamespace and prosrc like '%debe_cambiar_password%') = 4);
do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO 103: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 100), ' | ') from _res where not ok); end if;
end $$;
rollback;
