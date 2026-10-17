-- Migración 101: el firmante de recetas, consentimientos y referencias médicas es quien está autenticado.
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


create function pg_temp.sub(p_uid text, p_sql text) returns text language plpgsql as $$
declare v text; h text; m text;
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
  begin execute 'with x as (' || p_sql || ' returning 1) select count(*)::text from x' into v; perform set_config('request.jwt.claims', '', true); return v;
  exception when others then get stacked diagnostics h = pg_exception_hint, m = message_text; perform set_config('request.jwt.claims', '', true); return 'ERR|'||coalesce(nullif(h, ''), sqlstate)||'|'||m; end;
end $$;

select set_config('t.s1', pg_temp.sub(current_setting('t.d'), format('insert into recetas (paciente_id, dentista_id) values (%L, %L)', 'b8000000-0000-0000-0000-000000000001', current_setting('t.d2'))), false), set_config('t.s2', pg_temp.sub(current_setting('t.d'), format('insert into consentimientos_informados (paciente_id, procedimiento, dentista_id) values (%L, ''Extracción'', %L)', 'b8000000-0000-0000-0000-000000000001', current_setting('t.d2'))), false), set_config('t.s3', pg_temp.sub(current_setting('t.d'), format('insert into referencias_medicas (paciente_id, direccion, medico_nombre, dentista_id) values (%L, ''enviada'', ''Dr. X'', %L)', 'b8000000-0000-0000-0000-000000000001', current_setting('t.d2'))), false);
select pg_temp.t('S1 un odontólogo NO puede firmar una receta, un consentimiento ni una referencia médica como OTRO odontólogo de su clínica (FIRMANTE_INCOHERENTE); no queda ninguna fila',
  pg_temp.hint(current_setting('t.s1')) = 'FIRMANTE_INCOHERENTE' and pg_temp.hint(current_setting('t.s2')) = 'FIRMANTE_INCOHERENTE' and pg_temp.hint(current_setting('t.s3')) = 'FIRMANTE_INCOHERENTE'
  and not exists (select 1 from recetas where dentista_id = current_setting('t.d2')::uuid) and not exists (select 1 from consentimientos_informados where dentista_id = current_setting('t.d2')::uuid));
select set_config('t.p1', pg_temp.sub(current_setting('t.d'), format('insert into recetas (paciente_id, dentista_id) values (%L, %L)', 'b8000000-0000-0000-0000-000000000001', current_setting('t.d'))), false), set_config('t.p2', pg_temp.sub(current_setting('t.d'), format('insert into consentimientos_informados (paciente_id, procedimiento, dentista_id) values (%L, ''Extracción'', %L)', 'b8000000-0000-0000-0000-000000000001', current_setting('t.d'))), false), set_config('t.p3', pg_temp.sub(current_setting('t.d'), format('insert into referencias_medicas (paciente_id, direccion, medico_nombre, dentista_id) values (%L, ''enviada'', ''Dr. X'', %L)', 'b8000000-0000-0000-0000-000000000001', current_setting('t.d'))), false),
       set_config('t.p4', pg_temp.sub(current_setting('t.d'), format('insert into recetas (paciente_id) values (%L)', 'b8000000-0000-0000-0000-000000000001')), false);
select pg_temp.t('S2 lo legítimo sigue: firmar a nombre propio, y sin indicar firmante (se conserva el comportamiento actual)', current_setting('t.p1') = '1' and current_setting('t.p2') = '1' and current_setting('t.p3') = '1' and current_setting('t.p4') = '1');
select set_config('t.o1', pg_temp.sub(current_setting('t.o'), format('insert into recetas (paciente_id, dentista_id) values (%L, %L)', 'b8000000-0000-0000-0000-000000000001', current_setting('t.d'))), false), set_config('t.o2', pg_temp.sub(current_setting('t.o'), format('insert into recetas (paciente_id, dentista_id) values (%L, %L)', 'b8000000-0000-0000-0000-000000000001', current_setting('t.re'))), false), set_config('t.o3', pg_temp.sub(current_setting('t.o'), format('insert into recetas (paciente_id, dentista_id) values (%L, %L)', 'b8000000-0000-0000-0000-000000000001', current_setting('t.as'))), false), set_config('t.o4', pg_temp.sub(current_setting('t.o'), format('insert into consentimientos_informados (paciente_id, procedimiento, dentista_id) values (%L, ''Extracción'', %L)', 'b8000000-0000-0000-0000-000000000001', current_setting('t.d2'))), false);
select pg_temp.t('S3 SOLO el propietario puede registrar un documento a nombre de otro, y ese otro debe SER un odontólogo de la clínica: a nombre de un odontólogo funciona; a nombre de recepción o de un asistente → FIRMANTE_INCOHERENTE',
  current_setting('t.o1') = '1' and current_setting('t.o4') = '1' and pg_temp.hint(current_setting('t.o2')) = 'FIRMANTE_INCOHERENTE' and pg_temp.hint(current_setting('t.o3')) = 'FIRMANTE_INCOHERENTE');
select set_config('t.x1', pg_temp.sub(current_setting('t.o'), format('insert into recetas (paciente_id, dentista_id) values (%L, %L)', 'b8000000-0000-0000-0000-000000000001', current_setting('t.db'))), false), set_config('t.x2', pg_temp.sub(current_setting('t.d'), format('insert into recetas (paciente_id, dentista_id) values (%L, %L)', 'b8000000-0000-0000-0000-000000000001', current_setting('t.db'))), false);
select pg_temp.t('S4 el cruce entre clínicas sigue bloqueado (por la 098 o por la 101): un firmante de OTRA clínica nunca se acepta, ni por el propietario ni por un odontólogo',
  pg_temp.hint(current_setting('t.x1')) in ('REFERENCIA_DENTISTA_INCOHERENTE', 'FIRMANTE_INCOHERENTE') and pg_temp.hint(current_setting('t.x2')) in ('REFERENCIA_DENTISTA_INCOHERENTE', 'FIRMANTE_INCOHERENTE')
  and not exists (select 1 from recetas where dentista_id = current_setting('t.db')::uuid));
select set_config('request.jwt.claims', '', true);
insert into recetas (paciente_id, dentista_id) values ('b8000000-0000-0000-0000-000000000001', current_setting('t.d2')::uuid);
select pg_temp.t('S5 la operación administrativa (sin sesión de usuario: importaciones, mantenimiento) conserva su libertad', exists (select 1 from recetas where dentista_id = current_setting('t.d2')::uuid));
select pg_temp.t('S6 estructura: la función no es invocable por usuarios y existen los tres disparadores',
  not has_function_privilege('authenticated', 'fn_validar_firmante()', 'EXECUTE') and not has_function_privilege('anon', 'fn_validar_firmante()', 'EXECUTE')
  and (select count(*) from pg_trigger where tgname = 'trg_firmante' and not tgisinternal) = 3);
do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO 101: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 100), ' | ') from _res where not ok); end if;
end $$;
rollback;
