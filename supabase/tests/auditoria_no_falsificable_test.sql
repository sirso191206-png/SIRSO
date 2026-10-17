-- Migración 100: la auditoría deja de ser falsificable por los usuarios.
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
create function pg_temp.sub(p_uid text, p_sql text) returns text language plpgsql as $$
declare v text; h text; m text;
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
  begin execute 'with x as (' || p_sql || ' returning 1) select count(*)::text from x' into v; perform set_config('request.jwt.claims', '', true); return v;
  exception when others then get stacked diagnostics h = pg_exception_hint, m = message_text; perform set_config('request.jwt.claims', '', true); return 'ERR|'||coalesce(nullif(h, ''), sqlstate)||'|'||m; end;
end $$;
create function pg_temp.como_rol(p_rol text, p_uid uuid, p_sql text) returns text language plpgsql as $$
declare v text; h text; m text;
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', p_rol)::text end, true);
  execute format('set local role %I', p_rol);
  begin execute p_sql into v; reset role; return v;
  exception when others then get stacked diagnostics h = pg_exception_hint, m = message_text; reset role; return 'ERR|'||coalesce(nullif(h, ''), sqlstate)||'|'||m; end;
end $$;

create function pg_temp.audit(p_uid text, p_ejecuta text, p_accion text, p_clinica text default null, p_detalle text default null) returns text language sql as $$
  select pg_temp.dml(p_ejecuta, format('insert into auditoria (usuario_id, accion, entidad, clinica_id, detalle) values (%L, %L, ''x'', %L, %L::jsonb)', p_uid, p_accion, p_clinica, p_detalle)) $$;
select set_config('t.f1', pg_temp.audit(current_setting('t.o'), current_setting('t.o'), 'eliminar_clinica'), false), set_config('t.f2', pg_temp.audit(current_setting('t.o'), current_setting('t.o'), 'crear_usuarios'), false),
       set_config('t.f3', pg_temp.audit(current_setting('t.d'), current_setting('t.d'), 'corregir_estado_cita'), false), set_config('t.f4', pg_temp.audit(current_setting('t.o'), current_setting('t.o'), 'intento_eliminar_clinica_rechazado'), false),
       set_config('t.f5', pg_temp.audit(current_setting('t.o'), current_setting('t.o'), 'limpieza_eliminar_clinica'), false);
select pg_temp.t('U1 un usuario NO puede fabricar eventos administrativos a su nombre (eliminar_clinica, crear_usuarios, corregir_estado_cita, intento_eliminar_clinica_rechazado, limpieza_eliminar_clinica): violación de política 42501 y no queda ninguna fila',
  current_setting('t.f1') like 'ERR|42501|%' and current_setting('t.f2') like 'ERR|42501|%' and current_setting('t.f3') like 'ERR|42501|%' and current_setting('t.f4') like 'ERR|42501|%' and current_setting('t.f5') like 'ERR|42501|%'
  and not exists (select 1 from auditoria where accion in ('eliminar_clinica','crear_usuarios','corregir_estado_cita','intento_eliminar_clinica_rechazado','limpieza_eliminar_clinica')));
select set_config('t.g1', pg_temp.audit(current_setting('t.o'), current_setting('t.o'), 'exportar'), false), set_config('t.g2', pg_temp.audit(current_setting('t.d'), current_setting('t.d'), 'DATA_EXPORTED', 'c8000000-0000-0000-0000-00000000000a', '{"filas":3}'), false),
       set_config('t.g3', pg_temp.audit(current_setting('t.re'), current_setting('t.re'), 'cola_offline_descartada', null, '{"tipo":"nota"}'), false);
select pg_temp.t('U2 lo que el producto genera desde el navegador SÍ se registra: exportar, DATA_EXPORTED y cola_offline_descartada, a nombre propio (con o sin clínica propia)', current_setting('t.g1') = '1' and current_setting('t.g2') = '1' and current_setting('t.g3') = '1');
select set_config('t.h1', pg_temp.audit(current_setting('t.d'), current_setting('t.o'), 'exportar'), false), set_config('t.h2', pg_temp.audit(current_setting('t.o'), current_setting('t.o'), 'exportar', 'c8000000-0000-0000-0000-00000000000b'), false),
       set_config('t.h3', pg_temp.audit(current_setting('t.o'), current_setting('t.o'), 'exportar', null, (select jsonb_build_object('x', repeat('z', 21000))::text)), false);
select pg_temp.t('U3 incluso una acción permitida se rechaza si es a nombre de OTRA persona, en OTRA clínica o con un detalle de más de 20,000 bytes',
  current_setting('t.h1') like 'ERR|42501|%' and current_setting('t.h2') like 'ERR|42501|%' and current_setting('t.h3') like 'ERR|42501|%');
select set_config('t.f', pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000001', 'x', jsonb_build_object('id','d1000000-0000-0000-0000-0000000000f1','contenido','ok')::text), false);
select pg_temp.t('U4 la auditoría que generan los DISPARADORES y las funciones del servidor sigue funcionando: finalizar una consulta deja el evento de la cita a nombre del odontólogo',
  (pg_temp.j(current_setting('t.f')) ->> 'ok') = 'true' and exists (select 1 from auditoria a where a.entidad = 'citas' and a.entidad_id = 'a9000000-0000-0000-0000-000000000001' and a.usuario_id = current_setting('t.d')::uuid));
select set_config('t.u1', pg_temp.como(current_setting('t.o')::uuid, 'update auditoria set accion = ''x'' where true'), false), set_config('t.u2', pg_temp.como(current_setting('t.o')::uuid, 'delete from auditoria where true'), false),
       set_config('t.u3', pg_temp.como_rol('anon', null, $q$with x as (insert into auditoria (usuario_id, accion, entidad) values (gen_random_uuid(), 'exportar', 'x') returning 1) select count(*)::text from x$q$), false),
       set_config('t.u4', pg_temp.como_rol('anon', null, 'select count(*)::text from auditoria'), false);
select pg_temp.t('U5 el rastro es de solo-añadir para los usuarios: UPDATE y DELETE se rechazan por PRIVILEGIO (42501), y un anónimo no puede insertar ni leer',
  current_setting('t.u1') like 'ERR|42501|%' and current_setting('t.u2') like 'ERR|42501|%' and current_setting('t.u3') like 'ERR|42501|%' and current_setting('t.u4') like 'ERR|42501|%');
select set_config('request.jwt.claims', '', true);
insert into auditoria (usuario_id, accion, entidad, clinica_id) values (current_setting('t.ob')::uuid, 'eliminar_clinica', 'clinicas', 'c8000000-0000-0000-0000-00000000000b');
select pg_temp.t('U6 la lectura no cambió: el propietario de A no ve los eventos de la clínica B; y la operación administrativa (sin sesión de usuario) conserva su libertad de registrar cualquier acción',
  pg_temp.como(current_setting('t.o')::uuid, $q$select count(*)::text from auditoria where clinica_id = 'c8000000-0000-0000-0000-00000000000b'$q$) = '0' and exists (select 1 from auditoria where accion = 'eliminar_clinica'));
select pg_temp.t('U7 estructura: la política de inserción existe solo para authenticated con la lista de acciones; authenticated no tiene UPDATE/DELETE ni anon ningún privilegio sobre auditoria',
  exists (select 1 from pg_policies where tablename = 'auditoria' and policyname = 'auditoria_insert_eventos' and cmd = 'INSERT' and roles::text = '{authenticated}' and with_check like '%DATA_EXPORTED%')
  and not has_table_privilege('authenticated', 'auditoria', 'UPDATE') and not has_table_privilege('authenticated', 'auditoria', 'DELETE') and not has_table_privilege('anon', 'auditoria', 'SELECT') and not has_table_privilege('anon', 'auditoria', 'INSERT'));
do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO 100: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 100), ' | ') from _res where not ok); end if;
end $$;
rollback;
