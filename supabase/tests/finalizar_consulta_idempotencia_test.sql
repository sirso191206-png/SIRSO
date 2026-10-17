-- Migración 088: idempotencia VERIFICADA de fn_finalizar_consulta (reintentos, conflictos, estados inconsistentes, rollback).
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


-- ayudantes propios
create function pg_temp.nx(p_id text, p_extra jsonb default '{}'::jsonb) returns text language sql as $$
  select (jsonb_build_object('id', p_id, 'contenido', 'Se atendió', 'diagnostico', 'Caries', 'diagnostico_cie10_codigo', 'K02', 'diagnostico_cie10_descripcion', 'Caries dental',
    'interrogatorio_sistemas', jsonb_build_object('a', 1), 'exploracion_fisica', jsonb_build_object('b', 2), 'accion_salud_bucal', jsonb_build_object('c', 3), 'hallazgos', 'Pieza 36') || p_extra)::text $$;
create function pg_temp.sg(p_id text, p_ini text, p_fin text, p_motivo text default 'Revisión') returns text language sql as $$
  select jsonb_build_object('id', p_id, 'inicio', p_ini, 'fin', p_fin, 'motivo', p_motivo)::text $$;
create function pg_temp.cita_nueva(p_id text, p_dia int, p_pac text default 'b8000000-0000-0000-0000-000000000001') returns void language plpgsql as $$
begin
  insert into citas (id, paciente_id, dentista_id, inicio, fin, estado)
  values (p_id::uuid, p_pac::uuid, 'a8000000-0000-0000-0000-000000000002', timestamptz '2032-01-01 09:00+00' + (p_dia || ' days')::interval, timestamptz '2032-01-01 09:30+00' + (p_dia || ' days')::interval, 'en_consulta');
end $$;
create function pg_temp.total_notas() returns bigint language sql as $$ select count(*) from notas_clinicas $$;
create function pg_temp.total_citas() returns bigint language sql as $$ select count(*) from citas $$;
insert into pacientes (id, clinica_id, nombre_completo, dentista_responsable_id) values ('b8000000-0000-0000-0000-000000000004','c8000000-0000-0000-0000-00000000000a','P4 (de D)','a8000000-0000-0000-0000-000000000002');
select pg_temp.cita_nueva('a9000000-0000-0000-0000-000000000110', 1);  select pg_temp.cita_nueva('a9000000-0000-0000-0000-000000000111', 2);
select pg_temp.cita_nueva('a9000000-0000-0000-0000-000000000112', 3);  select pg_temp.cita_nueva('a9000000-0000-0000-0000-000000000114', 5);
select pg_temp.cita_nueva('a9000000-0000-0000-0000-000000000115', 6);  select pg_temp.cita_nueva('a9000000-0000-0000-0000-000000000116', 7);
select pg_temp.cita_nueva('a9000000-0000-0000-0000-000000000117', 8);  select pg_temp.cita_nueva('a9000000-0000-0000-0000-000000000118', 9);
select pg_temp.cita_nueva('a9000000-0000-0000-0000-000000000119', 10); select pg_temp.cita_nueva('a9000000-0000-0000-0000-00000000011a', 11);
select pg_temp.cita_nueva('a9000000-0000-0000-0000-00000000011b', 12); select pg_temp.cita_nueva('a9000000-0000-0000-0000-00000000011c', 13);
select pg_temp.cita_nueva('a9000000-0000-0000-0000-00000000011d', 14); select pg_temp.cita_nueva('a9000000-0000-0000-0000-00000000011e', 15);
select pg_temp.cita_nueva('a9000000-0000-0000-0000-00000000011f', 16); select pg_temp.cita_nueva('a9000000-0000-0000-0000-000000000120', 17);
select pg_temp.cita_nueva('a9000000-0000-0000-0000-000000000121', 18);

-- ===== G1: primera finalización con nota y seguimiento, TODO verificado =====
select set_config('t.g1', pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000110', 'Control', pg_temp.nx('d1000000-0000-0000-0000-000000000110'), pg_temp.sg('e1000000-0000-0000-0000-000000000110', '2032-03-01T10:00:00Z', '2032-03-01T10:30:00Z')), false);
select pg_temp.t('G1 la primera finalización crea la nota y el seguimiento y responde `verificado` en ambos (releídos y comparados con lo esperado)',
  (pg_temp.j(current_setting('t.g1')) ->> 'ya_finalizada') = 'false' and (pg_temp.j(current_setting('t.g1')) -> 'verificado' ->> 'nota') = 'true' and (pg_temp.j(current_setting('t.g1')) -> 'verificado' ->> 'seguimiento') = 'true'
  and pg_temp.estado('a9000000-0000-0000-0000-000000000110') = 'completada' and pg_temp.notas('a9000000-0000-0000-0000-000000000110') = 1 and exists (select 1 from citas where id = 'e1000000-0000-0000-0000-000000000110'));
-- ===== G2: respuesta perdida → reintento idéntico (también con un candado de concurrencia YA obsoleto, como hace la cola offline) =====
select set_config('t.n0', pg_temp.total_notas()::text, false), set_config('t.c0', pg_temp.total_citas()::text, false);
select set_config('t.g2', pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000110', 'Control', pg_temp.nx('d1000000-0000-0000-0000-000000000110'), pg_temp.sg('e1000000-0000-0000-0000-000000000110', '2032-03-01T10:00:00Z', '2032-03-01T10:30:00Z'), '2020-01-01 00:00:00+00'), false);
select pg_temp.t('G2 el navegador perdió la respuesta y reintenta idéntico (con el candado de concurrencia ya obsoleto, como la cola offline): "ya_finalizada", VERIFICADO, sin crear NADA (ni notas ni citas)',
  (pg_temp.j(current_setting('t.g2')) ->> 'ya_finalizada') = 'true' and (pg_temp.j(current_setting('t.g2')) -> 'verificado' ->> 'nota') = 'true' and (pg_temp.j(current_setting('t.g2')) -> 'verificado' ->> 'seguimiento') = 'true'
  and pg_temp.total_notas()::text = current_setting('t.n0') and pg_temp.total_citas()::text = current_setting('t.c0'));
select pg_temp.t('G2b el reintento con un `creado_en` distinto (la hora de captura offline varía) sigue siendo el MISMO reintento',
  pg_temp.hint(pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000110', 'Control', pg_temp.nx('d1000000-0000-0000-0000-000000000110', '{"creado_en":"2020-05-05T00:00:00Z"}'), pg_temp.sg('e1000000-0000-0000-0000-000000000110', '2032-03-01T10:00:00Z', '2032-03-01T10:30:00Z'))) = 'OK');
-- ===== G4: mismo id, contenido clínico distinto → NOTA_CONFLICTO, CAMPO POR CAMPO =====
do $$ declare c text; v record; mal text := ''; r text; begin
  for v in select * from (values
    ('contenido','{"contenido":"otro"}'),('diagnostico','{"diagnostico":"Pulpitis"}'),('cie10 código','{"diagnostico_cie10_codigo":"K04"}'),('cie10 descripción','{"diagnostico_cie10_descripcion":"otra"}'),
    ('interrogatorio','{"interrogatorio_sistemas":{"a":9}}'),('exploración','{"exploracion_fisica":{"b":9}}'),('acción salud bucal','{"accion_salud_bucal":{"c":9}}'),('hallazgos','{"hallazgos":"Pieza 11"}'),
    ('diagnóstico vaciado','{"diagnostico":null}')) x(campo, extra) loop
    r := pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000110', 'Control', pg_temp.nx('d1000000-0000-0000-0000-000000000110', v.extra::jsonb), pg_temp.sg('e1000000-0000-0000-0000-000000000110', '2032-03-01T10:00:00Z', '2032-03-01T10:30:00Z'));
    if pg_temp.hint(r) <> 'NOTA_CONFLICTO' then mal := mal || '[' || v.campo || ' → ' || pg_temp.hint(r) || ']'; end if;
  end loop;
  perform set_config('t.g4mal', mal, false);
end $$;
select pg_temp.t('G4 una diferencia en CUALQUIER campo clínico (contenido, diagnóstico, CIE-10, interrogatorio, exploración, acción de salud bucal, hallazgos, diagnóstico vaciado) con el mismo id → NOTA_CONFLICTO; ninguna se acepta como reintento', current_setting('t.g4mal') = '');
select pg_temp.t('G4b …y la nota original permanece intacta, sin permisos UPDATE ni escritura alguna',
  (select (contenido, diagnostico, diagnostico_cie10_codigo, hallazgos) = ('Se atendió', 'Caries', 'K02', 'Pieza 36') from notas_clinicas where id = 'd1000000-0000-0000-0000-000000000110')
  and pg_temp.total_notas()::text = current_setting('t.n0') and not has_table_privilege('authenticated', 'notas_clinicas', 'UPDATE'));
-- ===== G5: la nota existente es de otro autor / otra clínica / tiene datos que esta operación no escribe =====
select set_config('request.jwt.claims', '', true);   -- preparación como ADMINISTRADOR (sin sub): como() deja las claims fijadas
insert into notas_clinicas (id, expediente_id, cita_id, usuario_id, contenido, tipo, diagnostico, diagnostico_cie10_codigo, diagnostico_cie10_descripcion, interrogatorio_sistemas, exploracion_fisica, accion_salud_bucal, hallazgos)
  select 'd1000000-0000-0000-0000-000000000112', e.id, 'a9000000-0000-0000-0000-000000000112', current_setting('t.o')::uuid, 'Se atendió', 'consulta', 'Caries', 'K02', 'Caries dental', '{"a":1}', '{"b":2}', '{"c":3}', 'Pieza 36' from expedientes e where e.paciente_id = 'b8000000-0000-0000-0000-000000000001';
select set_config('t.g5', pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000112', 'x', pg_temp.nx('d1000000-0000-0000-0000-000000000112')), false);
select pg_temp.t('G5 el id existe con idéntico contenido pero escrito por OTRO usuario → NOTA_CONFLICTO (el autor cuenta), y la cita sigue en consulta',
  pg_temp.hint(current_setting('t.g5')) = 'NOTA_CONFLICTO' and pg_temp.estado('a9000000-0000-0000-0000-000000000112') = 'en_consulta');
select set_config('request.jwt.claims', '', true);   -- preparación como ADMINISTRADOR (sin sub): como() deja las claims fijadas
insert into notas_clinicas (id, expediente_id, usuario_id, contenido, tipo) select 'd1000000-0000-0000-0000-000000000b0b', e.id, 'a8000000-0000-0000-0000-000000000007', 'nota SECRETA de B', 'consulta' from expedientes e where e.paciente_id = 'b8000000-0000-0000-0000-00000000000b';
select set_config('t.g5c', pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000114', 'x', pg_temp.nx('d1000000-0000-0000-0000-000000000b0b')), false);
select pg_temp.t('G5b el id de una nota de OTRA clínica → NOTA_CONFLICTO; el mensaje NO revela nada de esa nota; nada se escribe',
  pg_temp.hint(current_setting('t.g5c')) = 'NOTA_CONFLICTO' and pg_temp.msg(current_setting('t.g5c')) not like '%SECRETA%' and pg_temp.msg(current_setting('t.g5c')) = pg_temp.msg(current_setting('t.g5'))
  and pg_temp.estado('a9000000-0000-0000-0000-000000000114') = 'en_consulta');
-- ===== G5c-g: la nota existente es IDÉNTICA salvo en UN solo campo que esta operación no escribe o que no es el contenido =====
select set_config('request.jwt.claims', '', true);   -- preparación como ADMINISTRADOR (sin sub): como() deja las claims fijadas
insert into notas_clinicas (id, expediente_id, usuario_id, contenido, tipo) select 'd1000000-0000-0000-0000-0000000000f0', e.id, current_setting('t.d')::uuid, 'base de versiones', 'consulta' from expedientes e where e.paciente_id = 'b8000000-0000-0000-0000-000000000001';
do $$ declare v record; mal text := ''; r text; e1 uuid; e4 uuid; d uuid := current_setting('t.d')::uuid; begin
  select id into e1 from expedientes where paciente_id = 'b8000000-0000-0000-0000-000000000001';
  select id into e4 from expedientes where paciente_id = 'b8000000-0000-0000-0000-000000000004';
  for v in select * from (values
    ('expediente distinto', 'a9000000-0000-0000-0000-00000000011d', 'd1000000-0000-0000-0000-00000000011d', 'e4', 'consulta', null, null, null),
    ('tipo distinto',       'a9000000-0000-0000-0000-00000000011e', 'd1000000-0000-0000-0000-00000000011e', 'e1', 'observacion', null, null, null),
    ('con pronóstico',      'a9000000-0000-0000-0000-00000000011f', 'd1000000-0000-0000-0000-00000000011f', 'e1', 'consulta', 'reservado', null, null),
    ('con plan de tratamiento', 'a9000000-0000-0000-0000-000000000120', 'd1000000-0000-0000-0000-000000000120', 'e1', 'consulta', null, 'extracción', null),
    ('con versión anterior', 'a9000000-0000-0000-0000-000000000121', 'd1000000-0000-0000-0000-000000000121', 'e1', 'consulta', null, null, 'd1000000-0000-0000-0000-0000000000f0')) x(campo, cita, nota, exped, tipo, pron, plan, ver) loop
    -- La migración 091 ya IMPIDE crear por la API una nota ligada a la cita de otro paciente (caso 'expediente distinto'). Ese estado solo puede existir
    -- en datos PREEXISTENTES: se prepara saltando el trigger SOLO durante el INSERT (nunca durante la llamada que se prueba) para seguir
    -- comprobando que la comparación de la 088 defiende en profundidad.
    perform set_config('request.jwt.claims', '', true);   -- preparación como ADMINISTRADOR (sin sub): como() deja las claims fijadas
    set local session_replication_role = replica;
    insert into notas_clinicas (id, expediente_id, cita_id, usuario_id, contenido, tipo, diagnostico, diagnostico_cie10_codigo, diagnostico_cie10_descripcion, interrogatorio_sistemas, exploracion_fisica, accion_salud_bucal, hallazgos, pronostico, plan_tratamiento, version_anterior_id)
    values (v.nota::uuid, case v.exped when 'e4' then e4 else e1 end, v.cita::uuid, d, 'Se atendió', v.tipo, 'Caries', 'K02', 'Caries dental', '{"a":1}', '{"b":2}', '{"c":3}', 'Pieza 36', v.pron, v.plan, v.ver::uuid);
    set local session_replication_role = origin;
    r := pg_temp.fin(d::text, v.cita, 'x', pg_temp.nx(v.nota));
    if pg_temp.hint(r) <> 'NOTA_CONFLICTO' or pg_temp.estado(v.cita) <> 'en_consulta' then mal := mal || '[' || v.campo || ' → ' || pg_temp.hint(r) || ']'; end if;
  end loop;
  perform set_config('t.g5mal', mal, false);
end $$;
select pg_temp.t('G5c una nota con el mismo id, cita, autor y contenido pero que difiere SOLO en el expediente, el tipo, un pronóstico, un plan de tratamiento o una versión anterior NO es un reintento: NOTA_CONFLICTO (cada campo se compara)', current_setting('t.g5mal') = '');

-- ===== G7: seguimiento cuyo id pertenece a OTRA cita =====
insert into citas (id, paciente_id, dentista_id, inicio, fin, estado, motivo_consulta) values ('e1000000-0000-0000-0000-000000000115', 'b8000000-0000-0000-0000-000000000004', 'a8000000-0000-0000-0000-000000000002', '2033-01-01 10:00+00', '2033-01-01 10:30+00', 'agendada', 'de otro paciente');
select set_config('t.n1', pg_temp.total_notas()::text, false), set_config('t.c1', pg_temp.total_citas()::text, false);
select set_config('t.g7', pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000115', 'x', pg_temp.nx('d1000000-0000-0000-0000-000000000115'), pg_temp.sg('e1000000-0000-0000-0000-000000000115', '2033-01-01T10:00:00Z', '2033-01-01T10:30:00Z', 'de otro paciente')), false);
select pg_temp.t('G7 un seguimiento cuyo id es de OTRA cita (otro paciente, aunque horario y motivo coincidan) → SEGUIMIENTO_CONFLICTO; se deshace TODO (cita en consulta, sin nota) y la cita ajena NO se toca',
  pg_temp.hint(current_setting('t.g7')) = 'SEGUIMIENTO_CONFLICTO' and pg_temp.estado('a9000000-0000-0000-0000-000000000115') = 'en_consulta' and pg_temp.notas('a9000000-0000-0000-0000-000000000115') = 0
  and pg_temp.total_notas()::text = current_setting('t.n1') and pg_temp.total_citas()::text = current_setting('t.c1')
  and (select (paciente_id, motivo_consulta, estado) = ('b8000000-0000-0000-0000-000000000004'::uuid, 'de otro paciente', 'agendada') from citas where id = 'e1000000-0000-0000-0000-000000000115'));
select pg_temp.t('G7b un seguimiento con el id de la PROPIA cita (aun con SU MISMO horario y motivo, que la comparación por sí sola daría por buenos) → SEGUIMIENTO_CONFLICTO sin tocar nada',
  pg_temp.hint(pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000116', 'x', null, pg_temp.sg('a9000000-0000-0000-0000-000000000116', '2032-01-08T09:00:00Z', '2032-01-08T09:30:00Z', 'x'))) = 'SEGUIMIENTO_CONFLICTO'
  and pg_temp.estado('a9000000-0000-0000-0000-000000000116') = 'en_consulta');
select pg_temp.t('G7c un seguimiento con el id de una cita de OTRA CLÍNICA → SEGUIMIENTO_CONFLICTO, mensaje sin datos de esa cita, nada cambia',
  pg_temp.hint(pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000116', 'x', null, pg_temp.sg('a9000000-0000-0000-0000-00000000000b', '2031-03-01T09:00:00Z', '2031-03-01T09:30:00Z'))) = 'SEGUIMIENTO_CONFLICTO'
  and pg_temp.estado('a9000000-0000-0000-0000-00000000000b') = 'en_consulta' and pg_temp.estado('a9000000-0000-0000-0000-000000000116') = 'en_consulta');
-- ===== G8: seguimiento existente con datos INCOMPATIBLES (se detecta en el reintento sobre la cita ya completada) =====
select set_config('t.g8', pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000117', 'Control', null, pg_temp.sg('e1000000-0000-0000-0000-000000000117', '2032-04-01T10:00:00Z', '2032-04-01T10:30:00Z', 'Revisión')), false);
do $$ declare v record; mal text := ''; r text; begin
  for v in select * from (values
    ('paciente',   $q$update citas set paciente_id = 'b8000000-0000-0000-0000-000000000004' where id = 'e1000000-0000-0000-0000-000000000117'$q$),
    ('odontólogo', $q$update citas set dentista_id = 'a8000000-0000-0000-0000-000000000003' where id = 'e1000000-0000-0000-0000-000000000117'$q$),
    ('sucursal',   $q$update citas set sucursal_id = 'f8000000-0000-0000-0000-000000000001' where id = 'e1000000-0000-0000-0000-000000000117'$q$),
    ('inicio',     $q$update citas set inicio = inicio - interval '5 minutes' where id = 'e1000000-0000-0000-0000-000000000117'$q$),
    ('fin',        $q$update citas set fin = fin + interval '5 minutes' where id = 'e1000000-0000-0000-0000-000000000117'$q$),
    ('motivo',     $q$update citas set motivo_consulta = 'otro motivo' where id = 'e1000000-0000-0000-0000-000000000117'$q$)) x(campo, sentencia) loop
    execute 'set local session_replication_role = replica'; execute v.sentencia; execute 'set local session_replication_role = origin';
    r := pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000117', 'Control', null, pg_temp.sg('e1000000-0000-0000-0000-000000000117', '2032-04-01T10:00:00Z', '2032-04-01T10:30:00Z', 'Revisión'));
    if pg_temp.hint(r) <> 'SEGUIMIENTO_CONFLICTO' then mal := mal || '[' || v.campo || ' → ' || pg_temp.hint(r) || ']'; end if;
    execute 'set local session_replication_role = replica';
    update citas set paciente_id = 'b8000000-0000-0000-0000-000000000001', dentista_id = 'a8000000-0000-0000-0000-000000000002', sucursal_id = null, inicio = '2032-04-01 10:00+00', fin = '2032-04-01 10:30+00', motivo_consulta = 'Revisión' where id = 'e1000000-0000-0000-0000-000000000117';
    execute 'set local session_replication_role = origin';
  end loop;
  perform set_config('t.g8mal', mal, false);
end $$;
select pg_temp.t('G8 un seguimiento existente que difiere en paciente, odontólogo, sucursal, inicio, fin o motivo NO se acepta (SEGUIMIENTO_CONFLICTO, uno por uno)', current_setting('t.g8mal') = '');
select pg_temp.t('G8b restaurado el seguimiento, el reintento vuelve a ser válido', pg_temp.hint(pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000117', 'Control', null, pg_temp.sg('e1000000-0000-0000-0000-000000000117', '2032-04-01T10:00:00Z', '2032-04-01T10:30:00Z', 'Revisión'))) = 'OK');
-- ===== G9-G12: cita COMPLETADA pero sin los efectos de esta operación =====
update citas set estado = 'completada', motivo_consulta = 'Dolor' where id = 'a9000000-0000-0000-0000-000000000118';
select set_config('t.n2', pg_temp.total_notas()::text, false), set_config('t.c2', pg_temp.total_citas()::text, false);
select set_config('t.g9', pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000118', 'Dolor', pg_temp.nx('d1000000-0000-0000-0000-000000000118')), false);
select pg_temp.t('G9 cita completada SIN la nota pedida → FINALIZACION_INCOMPLETA (dice que falta la nota) y NO se escribe nada (no se repara en silencio)',
  pg_temp.hint(current_setting('t.g9')) = 'FINALIZACION_INCOMPLETA' and pg_temp.msg(current_setting('t.g9')) like '%la nota clínica%' and pg_temp.msg(current_setting('t.g9')) like '%No se escribió nada%'
  and pg_temp.total_notas()::text = current_setting('t.n2') and pg_temp.estado('a9000000-0000-0000-0000-000000000118') = 'completada');
select set_config('t.g10', pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000118', 'Dolor', null, pg_temp.sg('e1000000-0000-0000-0000-000000000118', '2032-05-01T10:00:00Z', '2032-05-01T10:30:00Z')), false);
select pg_temp.t('G10 cita completada SIN el seguimiento pedido → FINALIZACION_INCOMPLETA (falta el seguimiento) y NO se crea ninguna cita',
  pg_temp.hint(current_setting('t.g10')) = 'FINALIZACION_INCOMPLETA' and pg_temp.msg(current_setting('t.g10')) like '%el seguimiento%' and pg_temp.total_citas()::text = current_setting('t.c2'));
select set_config('t.g10b', pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000118', 'Dolor', pg_temp.nx('d1000000-0000-0000-0000-000000000118'), pg_temp.sg('e1000000-0000-0000-0000-000000000118', '2032-05-01T10:00:00Z', '2032-05-01T10:30:00Z')), false);
select pg_temp.t('G10b si faltan LAS DOS cosas, el mensaje las nombra a ambas, y sigue sin escribir nada',
  pg_temp.hint(current_setting('t.g10b')) = 'FINALIZACION_INCOMPLETA' and pg_temp.msg(current_setting('t.g10b')) like '%la nota clínica ni el seguimiento%' and pg_temp.total_notas()::text = current_setting('t.n2') and pg_temp.total_citas()::text = current_setting('t.c2'));
select pg_temp.t('G11 cita completada y NADA que verificar (plan sin notas, sin seguimiento) con el mismo motivo → "ya_finalizada"; con OTRO motivo → CONSULTA_CON_DATOS_DISTINTOS',
  (pg_temp.j(pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000118', 'Dolor')) ->> 'ya_finalizada') = 'true'
  and pg_temp.hint(pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000118', 'Otro')) = 'CONSULTA_CON_DATOS_DISTINTOS');
select pg_temp.t('G12 reintentar sobre una cita completada SIN id de nota o de seguimiento → ID_REQUERIDO_PARA_REINTENTO (no hay nada que verificar), sin escribir',
  pg_temp.hint(pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000118', 'Dolor', '{"contenido":"x"}')) = 'ID_REQUERIDO_PARA_REINTENTO'
  and pg_temp.hint(pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000118', 'Dolor', null, '{"inicio":"2032-05-01T10:00:00Z","fin":"2032-05-01T10:30:00Z"}')) = 'ID_REQUERIDO_PARA_REINTENTO'
  and pg_temp.total_notas()::text = current_setting('t.n2'));
-- ===== G13: conflicto de horario (rollback completo) y reintento con los mismos ids =====
insert into citas (id, paciente_id, dentista_id, inicio, fin, estado) values ('a9000000-0000-0000-0000-0000000001ff', 'b8000000-0000-0000-0000-000000000004', 'a8000000-0000-0000-0000-000000000002', '2032-06-01 10:00+00', '2032-06-01 10:30+00', 'agendada');
select set_config('t.n3', pg_temp.total_notas()::text, false), set_config('t.c3', pg_temp.total_citas()::text, false);
select set_config('t.g13', pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000119', 'x', pg_temp.nx('d1000000-0000-0000-0000-000000000119'), pg_temp.sg('e1000000-0000-0000-0000-000000000119', '2032-06-01T10:10:00Z', '2032-06-01T10:40:00Z')), false);
select pg_temp.t('G13 conflicto de horario del seguimiento → HORARIO_OCUPADO y se revierte TODO (cita en consulta, ni nota ni seguimiento)',
  pg_temp.hint(current_setting('t.g13')) = 'HORARIO_OCUPADO' and pg_temp.estado('a9000000-0000-0000-0000-000000000119') = 'en_consulta' and pg_temp.total_notas()::text = current_setting('t.n3') and pg_temp.total_citas()::text = current_setting('t.c3'));
select set_config('t.g13b', pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000119', 'x', pg_temp.nx('d1000000-0000-0000-0000-000000000119'), pg_temp.sg('e1000000-0000-0000-0000-000000000119', '2032-06-02T10:00:00Z', '2032-06-02T10:30:00Z')), false);
select pg_temp.t('G13b el reintento con los MISMOS ids y un horario libre funciona y deja exactamente UNA nota y UN seguimiento verificados',
  (pg_temp.j(current_setting('t.g13b')) -> 'verificado' ->> 'seguimiento') = 'true' and pg_temp.total_notas() = current_setting('t.n3')::bigint + 1 and pg_temp.total_citas() = current_setting('t.c3')::bigint + 1);
-- ===== G14: fallo de integridad INTERMEDIO (inyectado) → rollback completo =====
create function pg_temp.fallo_inyectado() returns trigger language plpgsql as $$ begin
  if new.motivo_consulta = 'FALLO_INYECTADO' then raise exception 'violación de integridad inyectada' using errcode = '23503'; end if; return new; end $$;
create trigger zz_fallo_inyectado before insert on citas for each row execute function pg_temp.fallo_inyectado();
select set_config('t.n4', pg_temp.total_notas()::text, false), set_config('t.c4', pg_temp.total_citas()::text, false);
select set_config('t.g14', pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-00000000011a', 'x', pg_temp.nx('d1000000-0000-0000-0000-00000000011a'), pg_temp.sg('e1000000-0000-0000-0000-00000000011a', '2032-07-01T10:00:00Z', '2032-07-01T10:30:00Z', 'FALLO_INYECTADO')), false);
select pg_temp.t('G14 un error de integridad (23503) DESPUÉS de crear la nota y completar la cita se propaga (no se oculta) y revierte TODAS las escrituras de la llamada',
  current_setting('t.g14') like 'ERR|23503|%' and pg_temp.estado('a9000000-0000-0000-0000-00000000011a') = 'en_consulta' and pg_temp.total_notas()::text = current_setting('t.n4') and pg_temp.total_citas()::text = current_setting('t.c4'));
drop trigger zz_fallo_inyectado on citas;
-- ===== G15-G16: autorización y sesión en un REINTENTO =====
select pg_temp.t('G15 un asistente que reintenta sobre una cita ya completada recibe ROL_NO_PERMITIDO (la idempotencia no esquiva la autorización)',
  pg_temp.hint(pg_temp.fin(current_setting('t.as'), 'a9000000-0000-0000-0000-000000000110', 'Control', pg_temp.nx('d1000000-0000-0000-0000-000000000110'))) = 'ROL_NO_PERMITIDO'
  and pg_temp.hint(pg_temp.fin(current_setting('t.db'), 'a9000000-0000-0000-0000-000000000110', 'Control', pg_temp.nx('d1000000-0000-0000-0000-000000000110'))) = 'CITA_NO_ENCONTRADA');
update plataforma_config set valor = 'on' where clave = 'control_sesiones_estricto';
select set_config('t.g16', pg_temp.como(current_setting('t.d')::uuid, format('select fn_finalizar_consulta(%L::uuid, ''x'', %L::jsonb)::text', 'a9000000-0000-0000-0000-00000000011b', pg_temp.nx('d1000000-0000-0000-0000-00000000011b')), jsonb_build_object('session_id', 'aaaaaaaa-0000-0000-0000-000000000001')), false);
update plataforma_config set valor = 'off' where clave = 'control_sesiones_estricto';
select pg_temp.t('G16 con la sesión revocada (expiró) no se escribe nada: SESION_CERRADA; la operación es atómica, así que una sesión que expira a mitad no deja efectos parciales',
  pg_temp.hint(current_setting('t.g16')) = 'SESION_CERRADA' and pg_temp.estado('a9000000-0000-0000-0000-00000000011b') = 'en_consulta' and pg_temp.notas('a9000000-0000-0000-0000-00000000011b') = 0);
-- ===== G17: formato de la cola offline (con campos extra) y su reintento =====
select set_config('t.g17', pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-00000000011c', 'Dolor',
   jsonb_build_object('id','d1000000-0000-0000-0000-00000000011c','contenido','Offline','tipo','consulta','expediente_id',(select id from expedientes where paciente_id='b8000000-0000-0000-0000-000000000001'),'cita_id','a9000000-0000-0000-0000-00000000011c','usuario_id',current_setting('t.d'),'creado_en','2031-01-01T00:00:00Z')::text,
   jsonb_build_object('id','e1000000-0000-0000-0000-00000000011c','paciente_id','b8000000-0000-0000-0000-000000000001','dentista_id',current_setting('t.d'),'inicio','2032-08-01T10:00:00Z','fin','2032-08-01T10:30:00Z','motivo_consulta','Seguimiento','estado','agendada')::text, (select actualizado_en::text from citas where id = 'a9000000-0000-0000-0000-00000000011c')), false);
select set_config('t.g17b', pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-00000000011c', 'Dolor',
   jsonb_build_object('id','d1000000-0000-0000-0000-00000000011c','contenido','Offline','tipo','consulta','expediente_id',(select id from expedientes where paciente_id='b8000000-0000-0000-0000-000000000001'),'cita_id','a9000000-0000-0000-0000-00000000011c','usuario_id',current_setting('t.d'),'creado_en','2031-01-01T00:00:00Z')::text,
   jsonb_build_object('id','e1000000-0000-0000-0000-00000000011c','paciente_id','b8000000-0000-0000-0000-000000000001','dentista_id',current_setting('t.d'),'inicio','2032-08-01T10:00:00Z','fin','2032-08-01T10:30:00Z','motivo_consulta','Seguimiento','estado','agendada')::text, '2031-12-31 00:00:00+00'), false);
select pg_temp.t('G17 con el payload que encola el procesador offline (campos extra incluidos): la primera subida funciona y su REINTENTO (con el candado ya obsoleto) responde ya_finalizada verificado',
  (pg_temp.j(current_setting('t.g17')) ->> 'ya_finalizada') = 'false' and (pg_temp.j(current_setting('t.g17b')) ->> 'ya_finalizada') = 'true' and (pg_temp.j(current_setting('t.g17b')) -> 'verificado' ->> 'seguimiento') = 'true' and pg_temp.notas('a9000000-0000-0000-0000-00000000011c') = 1);
-- ===== G18: plan en un reintento + permisos =====
update suscripcion_funcionalidades set habilitada = false where funcionalidad = 'notas_clinicas' and suscripcion_id = (select id from suscripciones where clinica_id = 'c8000000-0000-0000-0000-00000000000a' and estado <> 'reemplazada');
select pg_temp.t('G18 el plan se sigue exigiendo en un reintento (sin notas clínicas en el plan: FUNCIONALIDAD_NO_INCLUIDA, no un éxito por "ya estaba hecho")',
  pg_temp.hint(pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000110', 'Control', pg_temp.nx('d1000000-0000-0000-0000-000000000110'))) = 'FUNCIONALIDAD_NO_INCLUIDA');
update suscripcion_funcionalidades set habilitada = true where funcionalidad = 'notas_clinicas' and suscripcion_id = (select id from suscripciones where clinica_id = 'c8000000-0000-0000-0000-00000000000a' and estado <> 'reemplazada');
select pg_temp.t('G19 la función NO contiene ninguna sentencia que modifique notas (ni UPDATE ni DELETE ni ON CONFLICT DO UPDATE) y authenticated sigue sin UPDATE/DELETE sobre notas_clinicas',
  pg_get_functiondef('fn_finalizar_consulta(uuid,text,jsonb,jsonb,timestamptz)'::regprocedure) !~* 'update\s+notas_clinicas|delete\s+from\s+notas_clinicas|do\s+update'
  and not has_table_privilege('authenticated', 'notas_clinicas', 'UPDATE') and not has_table_privilege('authenticated', 'notas_clinicas', 'DELETE')
  and (select count(*) from pg_policies where tablename = 'notas_clinicas') = 4 and (select count(*) from pg_policies where tablename = 'citas') = 5);

do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO 088: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 150), ' | ') from _res where not ok); end if;
end $$;
rollback;
