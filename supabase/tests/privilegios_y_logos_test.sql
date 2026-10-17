-- Migraciones 095 y 096: privilegios mínimos y lectura de logos limitada a la propia clínica.
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

insert into storage.objects (bucket_id, name, metadata) values ('logos-clinicas', 'c8000000-0000-0000-0000-00000000000a/logo.png', '{"size":1}'), ('logos-clinicas', 'c8000000-0000-0000-0000-00000000000b/logo.png', '{"size":1}');

create function pg_temp.dml(p_uid text, p_sql text) returns text language sql as $$ select pg_temp.como(p_uid::uuid, 'with x as (' || p_sql || ' returning 1) select count(*)::text from x') $$;
create function pg_temp.como_rol(p_rol text, p_uid uuid, p_sql text) returns text language plpgsql as $$
declare v text; h text; m text;
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', p_rol)::text end, true);
  execute format('set local role %I', p_rol);
  begin execute p_sql into v; reset role; return v;
  exception when others then get stacked diagnostics h = pg_exception_hint, m = message_text; reset role; return 'ERR|'||coalesce(nullif(h, ''), sqlstate)||'|'||m; end;
end $$;

select pg_temp.t('P1 ninguna tabla ni vista de public tiene TRUNCATE, REFERENCES ni TRIGGER para anon o authenticated',
  (select count(*) from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')) = 0);
select pg_temp.t('P2 lo necesario SIGUE: authenticated conserva SELECT en pacientes y citas, INSERT en notas (y NO tiene UPDATE ni DELETE sobre notas, como antes); RLS sigue activa en todas las tablas con clinica_id/paciente_id',
  has_table_privilege('authenticated', 'pacientes', 'SELECT') and has_table_privilege('authenticated', 'citas', 'UPDATE') and has_table_privilege('authenticated', 'notas_clinicas', 'INSERT')
  and not has_table_privilege('authenticated', 'notas_clinicas', 'UPDATE') and not has_table_privilege('authenticated', 'notas_clinicas', 'DELETE')
  and (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname in ('clinica_id', 'paciente_id') and not a.attisdropped)) = 0);
select pg_temp.t('P3 el servicio y el propietario de la base conservan lo suyo (la eliminación de clínicas y el mantenimiento no se tocan)',
  has_table_privilege('service_role', 'notas_clinicas', 'TRUNCATE') and has_table_privilege('service_role', 'notas_clinicas', 'REFERENCES') and has_table_privilege('service_role', 'notas_clinicas', 'TRIGGER'));
select pg_temp.t('P3b la instantánea para el rollback exacto existe en plataforma_config (no en una tabla nueva), tiene contenido y NO es visible ni modificable por un usuario sin permiso',
  (select jsonb_array_length(valor::jsonb) > 100 from plataforma_config where clave = 'rollback_095_privilegios')
  and not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'migracion_095_privilegios_revocados'));
create table public.zz_tabla_futura (id int);
select pg_temp.t('P4 una tabla FUTURA creada por quien ejecuta las migraciones tampoco concede esos privilegios a anon ni a authenticated (privilegios por defecto)',
  not has_table_privilege('authenticated', 'public.zz_tabla_futura', 'TRUNCATE') and not has_table_privilege('anon', 'public.zz_tabla_futura', 'TRUNCATE') and not has_table_privilege('authenticated', 'public.zz_tabla_futura', 'TRIGGER')
  and not has_table_privilege('authenticated', 'public.zz_tabla_futura', 'REFERENCES'));
select set_config('t.l_anon', pg_temp.como_rol('anon', null, $q$select count(*)::text from storage.objects where bucket_id = 'logos-clinicas'$q$), false);
select set_config('t.l_o', pg_temp.como(current_setting('t.o')::uuid, $q$select coalesce(string_agg(name, ',' order by name), '') from storage.objects where bucket_id = 'logos-clinicas'$q$), false);
select set_config('t.l_ob', pg_temp.como(current_setting('t.ob')::uuid, $q$select coalesce(string_agg(name, ',' order by name), '') from storage.objects where bucket_id = 'logos-clinicas'$q$), false);
select pg_temp.t('L1 un ANÓNIMO ya no puede LISTAR los logos (ni los UUID de las clínicas); cada usuario autenticado ve SOLO el logo de su clínica',
  current_setting('t.l_anon') = '0' and current_setting('t.l_o') = 'c8000000-0000-0000-0000-00000000000a/logo.png' and current_setting('t.l_ob') = 'c8000000-0000-0000-0000-00000000000b/logo.png');
select set_config('t.l_up', pg_temp.como(current_setting('t.o')::uuid, $q$with i as (insert into storage.objects (bucket_id, name, metadata) values ('logos-clinicas', 'c8000000-0000-0000-0000-00000000000a/logo.webp', '{"size":1}') returning 1) select count(*)::text from i$q$), false);
select set_config('t.l_aj', pg_temp.como(current_setting('t.o')::uuid, $q$with i as (insert into storage.objects (bucket_id, name, metadata) values ('logos-clinicas', 'c8000000-0000-0000-0000-00000000000b/intruso.png', '{"size":1}') returning 1) select count(*)::text from i$q$), false);
select pg_temp.t('L2 el propietario sigue pudiendo subir (y reemplazar con upsert) el logo de SU clínica y verlo después; no puede subir el de otra',
  current_setting('t.l_up') = '1' and current_setting('t.l_aj') like 'ERR|42501|%' and pg_temp.como(current_setting('t.o')::uuid, $q$select count(*)::text from storage.objects where name = 'c8000000-0000-0000-0000-00000000000a/logo.webp'$q$) = '1');
select pg_temp.t('L3 el bucket sigue siendo PÚBLICO (la visibilidad no cambió: las URLs públicas no dependen de esta política) y fotos y documentos conservan su aislamiento (anónimo: 0)',
  (select public from storage.buckets where id = 'logos-clinicas') and pg_temp.como_rol('anon', null, $q$select count(*)::text from storage.objects where bucket_id in ('fotos-clinicas', 'documentos-clinicos')$q$) = '0');
do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO 095-096: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 120), ' | ') from _res where not ok); end if;
end $$;
rollback;
