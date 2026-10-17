-- Políticas de Storage (storage.objects) con roles reales: aislamiento entre clínicas y entre odontólogos.
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


create function pg_temp.como_rol(p_rol text, p_uid uuid, p_sql text) returns text language plpgsql as $$
declare v text; h text; m text;
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', p_rol)::text end, true);
  execute format('set local role %I', p_rol);
  begin execute p_sql into v; reset role; return v;
  exception when others then get stacked diagnostics h = pg_exception_hint, m = message_text; reset role; return 'ERR|'||coalesce(nullif(h, ''), sqlstate)||'|'||m; end;
end $$;

insert into storage.objects (bucket_id, name, metadata) values
 ('fotos-clinicas', 'b8000000-0000-0000-0000-000000000001/f.jpg', '{"size":1}'), ('fotos-clinicas', 'b8000000-0000-0000-0000-000000000003/f.jpg', '{"size":1}'), ('fotos-clinicas', 'b8000000-0000-0000-0000-00000000000b/f.jpg', '{"size":1}'),
 ('documentos-clinicos', 'b8000000-0000-0000-0000-000000000001/d.pdf', '{"size":1}'), ('documentos-clinicos', 'b8000000-0000-0000-0000-00000000000b/d.pdf', '{"size":1}'),
 ('logos-clinicas', 'c8000000-0000-0000-0000-00000000000a/logo.png', '{"size":1}'), ('logos-clinicas', 'c8000000-0000-0000-0000-00000000000b/logo.png', '{"size":1}');
create function pg_temp.ve(p_uid text, p_bucket text) returns text language sql as $$
  select pg_temp.como(p_uid::uuid, format('select coalesce(string_agg(split_part(name, ''/'', 2) || ''@'' || right(split_part(name, ''/'', 1), 2), '','' order by name), '''') from storage.objects where bucket_id = %L', p_bucket)) $$;
create function pg_temp.sube(p_uid text, p_bucket text, p_ruta text) returns text language sql as $$
  select pg_temp.como(p_uid::uuid, format('with i as (insert into storage.objects (bucket_id, name, metadata) values (%L, %L, ''{"size":1}'') returning 1) select count(*)::text from i', p_bucket, p_ruta)) $$;
create function pg_temp.borra(p_uid text, p_bucket text) returns text language sql as $$
  select pg_temp.como(p_uid::uuid, format('with d as (delete from storage.objects where bucket_id = %L returning 1) select count(*)::text from d', p_bucket)) $$;
select set_config('t.f_o', pg_temp.ve(current_setting('t.o'), 'fotos-clinicas'), false), set_config('t.f_d', pg_temp.ve(current_setting('t.d'), 'fotos-clinicas'), false),
       set_config('t.f_d2', pg_temp.ve(current_setting('t.d2'), 'fotos-clinicas'), false), set_config('t.f_ob', pg_temp.ve(current_setting('t.ob'), 'fotos-clinicas'), false);
select pg_temp.t('S1 FOTOS: el propietario ve las de SUS pacientes (P1 y P3) y no las de B; el dentista solo las de SU paciente asignado; el dentista D2 solo las suyas; el propietario de B solo las de B',
  current_setting('t.f_o') = 'f.jpg@01,f.jpg@03' and current_setting('t.f_d') = 'f.jpg@01' and current_setting('t.f_d2') = 'f.jpg@03' and current_setting('t.f_ob') = 'f.jpg@0b');
select pg_temp.t('S2 DOCUMENTOS: mismo aislamiento (A no ve los de B y viceversa); un anónimo no ve ninguna foto ni documento',
  pg_temp.ve(current_setting('t.o'), 'documentos-clinicos') = 'd.pdf@01' and pg_temp.ve(current_setting('t.ob'), 'documentos-clinicos') = 'd.pdf@0b'
  and pg_temp.como_rol('anon', null, $q$select count(*)::text from storage.objects where bucket_id in ('fotos-clinicas', 'documentos-clinicos')$q$) = '0');
select pg_temp.t('S3 SUBIR: se puede subir a la carpeta de un paciente PROPIO; NO a la de un paciente de otra clínica ni al de un paciente no asignado (violación de política 42501); un anónimo no sube',
  pg_temp.sube(current_setting('t.o'), 'fotos-clinicas', 'b8000000-0000-0000-0000-000000000001/nueva.jpg') = '1'
  and pg_temp.sube(current_setting('t.o'), 'fotos-clinicas', 'b8000000-0000-0000-0000-00000000000b/intruso.jpg') like 'ERR|42501|%'
  and pg_temp.sube(current_setting('t.ob'), 'fotos-clinicas', 'b8000000-0000-0000-0000-000000000001/intruso.jpg') like 'ERR|42501|%'
  and pg_temp.sube(current_setting('t.d'), 'fotos-clinicas', 'b8000000-0000-0000-0000-000000000003/intruso.jpg') like 'ERR|42501|%'
  and pg_temp.como_rol('anon', null, $q$with i as (insert into storage.objects (bucket_id, name, metadata) values ('fotos-clinicas', 'b8000000-0000-0000-0000-000000000001/anon.jpg', '{"size":1}') returning 1) select count(*)::text from i$q$) like 'ERR|42501|%');
select pg_temp.t('S4 BORRAR y MODIFICAR: ningún usuario autenticado puede borrar fotos ni documentos (no hay política DELETE: 0 filas, ni el propietario); solo el servicio (la eliminación de clínicas) los borra',
  pg_temp.borra(current_setting('t.o'), 'fotos-clinicas') = '0' and pg_temp.borra(current_setting('t.ob'), 'documentos-clinicos') = '0' and pg_temp.borra(current_setting('t.d'), 'fotos-clinicas') = '0'
  and (select count(*) from storage.objects where bucket_id = 'fotos-clinicas') >= 4
  and pg_temp.como(current_setting('t.o')::uuid, $q$with u as (update storage.objects set name = 'robado/x' where bucket_id = 'fotos-clinicas' returning 1) select count(*)::text from u$q$) = '0');
select pg_temp.t('S5 LOGOS: solo el PROPIETARIO sube/borra/modifica el logo de SU clínica; no el de otra; un dentista no',
  pg_temp.sube(current_setting('t.o'), 'logos-clinicas', 'c8000000-0000-0000-0000-00000000000a/otro.png') = '1'
  and pg_temp.sube(current_setting('t.o'), 'logos-clinicas', 'c8000000-0000-0000-0000-00000000000b/intruso.png') like 'ERR|42501|%'
  and pg_temp.sube(current_setting('t.d'), 'logos-clinicas', 'c8000000-0000-0000-0000-00000000000a/dentista.png') like 'ERR|42501|%'
  and pg_temp.borra(current_setting('t.d'), 'logos-clinicas') = '0'
  and pg_temp.como(current_setting('t.o')::uuid, $q$with d as (delete from storage.objects where bucket_id = 'logos-clinicas' and name like 'c8000000-0000-0000-0000-00000000000b/%' returning 1) select count(*)::text from d$q$) = '0'
  and (select count(*) from storage.objects where name = 'c8000000-0000-0000-0000-00000000000b/logo.png') = 1);
select pg_temp.t('S6 (cambió en la fase 7, migración 096) los LOGOS ya NO son enumerables por anónimos: el listado por la API queda limitado a la propia clínica (la URL pública no depende de esta política: el bucket sigue siendo público); fotos y documentos siguen sin ser visibles para anónimos',
  pg_temp.como_rol('anon', null, $q$select count(*)::text from storage.objects where bucket_id = 'logos-clinicas'$q$) = '0'
  and pg_temp.como_rol('anon', null, $q$select count(*)::text from storage.objects where bucket_id in ('fotos-clinicas', 'documentos-clinicos')$q$) = '0'
  and (select public from storage.buckets where id = 'logos-clinicas'));

do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO STORAGE: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 150), ' | ') from _res where not ok); end if;
end $$;
rollback;
