-- Migración 085: fn_finalizar_consulta — atómica, idempotente, autorizada y aislada por clínica.
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

-- ===== F1: camino feliz del dentista =====
select set_config('t.r1', pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000001', 'Dolor molar', pg_temp.nota('d1000000-0000-0000-0000-000000000001')), false);
select pg_temp.t('F1 el dentista finaliza SU consulta: la cita queda completada con su motivo y se crea UNA nota con su usuario, la cita y el expediente del paciente',
  pg_temp.j(current_setting('t.r1')) ->> 'ok' = 'true' and (pg_temp.j(current_setting('t.r1')) ->> 'ya_finalizada') = 'false'
  and pg_temp.estado('a9000000-0000-0000-0000-000000000001') = 'completada'
  and (select motivo_consulta from citas where id = 'a9000000-0000-0000-0000-000000000001') = 'Dolor molar'
  and pg_temp.notas('a9000000-0000-0000-0000-000000000001') = 1
  and (select usuario_id from notas_clinicas where cita_id = 'a9000000-0000-0000-0000-000000000001') = current_setting('t.d')::uuid
  and (select expediente_id from notas_clinicas where cita_id = 'a9000000-0000-0000-0000-000000000001') = (select id from expedientes where paciente_id = 'b8000000-0000-0000-0000-000000000001')
  and (select diagnostico from notas_clinicas where cita_id = 'a9000000-0000-0000-0000-000000000001') = 'Caries'
  and (select interrogatorio_sistemas ->> 'a' from notas_clinicas where cita_id = 'a9000000-0000-0000-0000-000000000001') = '1');
-- ===== F2: idempotencia (doble clic / reintento tras perder la respuesta) =====
select set_config('t.r2', pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000001', 'Dolor molar', pg_temp.nota('d1000000-0000-0000-0000-000000000001')), false);
select pg_temp.t('F2 repetir la MISMA finalización (mismos ids, motivo y contenido) NO duplica nada: responde "ya_finalizada", la nota sigue siendo UNA y se VERIFICÓ contra lo guardado',
  (current_setting('t.r2')::jsonb ->> 'ya_finalizada') = 'true' and (current_setting('t.r2')::jsonb -> 'verificado' ->> 'nota') = 'true' and pg_temp.notas('a9000000-0000-0000-0000-000000000001') = 1
  and (select motivo_consulta from citas where id = 'a9000000-0000-0000-0000-000000000001') = 'Dolor molar'
  and (select contenido from notas_clinicas where cita_id = 'a9000000-0000-0000-0000-000000000001') = 'Se atendió');
select set_config('t.r2b', pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000001', 'Dolor molar', pg_temp.nota('d1000000-0000-0000-0000-000000000001', 'contenido distinto')), false);
select set_config('t.r2c', pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000001', 'OTRO motivo', pg_temp.nota('d1000000-0000-0000-0000-000000000001')), false);
select pg_temp.t('F2b el MISMO id con OTRO contenido NO es un reintento: NOTA_CONFLICTO, y la nota original queda intacta',
  pg_temp.hint(current_setting('t.r2b')) = 'NOTA_CONFLICTO' and (select contenido from notas_clinicas where id = 'd1000000-0000-0000-0000-000000000001') = 'Se atendió' and pg_temp.notas('a9000000-0000-0000-0000-000000000001') = 1);
select pg_temp.t('F2c un reintento con OTRO motivo sobre una consulta ya finalizada → CONSULTA_CON_DATOS_DISTINTOS, y el motivo guardado no se reescribe',
  pg_temp.hint(current_setting('t.r2c')) = 'CONSULTA_CON_DATOS_DISTINTOS' and (select motivo_consulta from citas where id = 'a9000000-0000-0000-0000-000000000001') = 'Dolor molar');
-- ===== F3: seguimiento creado por un DENTISTA (que no tiene INSERT en citas) =====
select set_config('t.r3', pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-00000000000c', 'Control', pg_temp.nota('d1000000-0000-0000-0000-000000000003'),
  '{"id":"e1000000-0000-0000-0000-000000000003","inicio":"2031-04-01T10:00:00Z","fin":"2031-04-01T10:30:00Z","motivo":"Revisión"}'), false);
select pg_temp.t('F3 con seguimiento: se crea la cita agendada del MISMO paciente, odontólogo y sucursal — aunque el dentista NO tenga permiso de INSERT en citas',
  (pg_temp.j(current_setting('t.r3')) ->> 'ok') = 'true'
  and (select (estado, paciente_id, dentista_id, motivo_consulta) = ('agendada', 'b8000000-0000-0000-0000-000000000001'::uuid, current_setting('t.d')::uuid, 'Revisión') from citas where id = 'e1000000-0000-0000-0000-000000000003')
  and pg_temp.como(current_setting('t.d')::uuid, $q$with d as (insert into citas (paciente_id, dentista_id, inicio, fin, estado) values ('b8000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000002', '2031-05-01 10:00+00', '2031-05-01 10:30+00', 'agendada') returning 1) select count(*)::text from d$q$) like 'ERR|42501|%');
-- ===== F4: atomicidad =====
insert into citas (id, paciente_id, dentista_id, inicio, fin, estado) values ('a9000000-0000-0000-0000-0000000000a1','b8000000-0000-0000-0000-000000000002','a8000000-0000-0000-0000-000000000002','2031-06-01 10:00+00','2031-06-01 10:30+00','agendada');
select set_config('t.r4', pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-00000000000d', 'Control', pg_temp.nota('d1000000-0000-0000-0000-000000000004'),
  '{"id":"e1000000-0000-0000-0000-000000000004","inicio":"2031-06-01T10:10:00Z","fin":"2031-06-01T10:40:00Z"}'), false);
select pg_temp.t('F4 si el seguimiento choca con otra cita del odontólogo se DESHACE TODO: la cita sigue en consulta, no queda NINGUNA nota, y el mensaje explica el horario ocupado',
  pg_temp.hint(current_setting('t.r4')) = 'HORARIO_OCUPADO' and pg_temp.msg(current_setting('t.r4')) like '%horario del seguimiento ya está ocupado%'
  and pg_temp.estado('a9000000-0000-0000-0000-00000000000d') = 'en_consulta' and pg_temp.notas('a9000000-0000-0000-0000-00000000000d') = 0
  and not exists (select 1 from citas where id = 'e1000000-0000-0000-0000-000000000004'));
select set_config('t.r4b', pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-00000000000d', 'Control', pg_temp.nota('d1000000-0000-0000-0000-000000000004'),
  '{"id":"e1000000-0000-0000-0000-000000000004","inicio":"2031-06-02T10:00:00Z","fin":"2031-06-02T10:30:00Z"}'), false);
select pg_temp.t('F4b reintentar con un horario libre (mismos ids) funciona y deja exactamente UNA nota y UN seguimiento',
  (pg_temp.j(current_setting('t.r4b')) ->> 'ok') = 'true' and pg_temp.estado('a9000000-0000-0000-0000-00000000000d') = 'completada'
  and pg_temp.notas('a9000000-0000-0000-0000-00000000000d') = 1 and (select count(*) from citas where id = 'e1000000-0000-0000-0000-000000000004') = 1);
select pg_temp.t('F4c seguimiento con fechas inválidas (fin <= inicio) se rechaza sin tocar la consulta',
  pg_temp.hint(pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-00000000000e', 'x', null, '{"inicio":"2031-07-01T10:30:00Z","fin":"2031-07-01T10:00:00Z"}')) = 'SEGUIMIENTO_INVALIDO'
  and pg_temp.estado('a9000000-0000-0000-0000-00000000000e') = 'en_consulta');
-- ===== F5-F8: quién NO puede, y por qué (mensajes claros, sin efectos) =====
select pg_temp.t('F5 un ASISTENTE y RECEPCIÓN reciben ROL_NO_PERMITIDO (antes: "Cannot coerce…") y no se cambia nada',
  pg_temp.hint(pg_temp.fin(current_setting('t.as'), 'a9000000-0000-0000-0000-000000000008')) = 'ROL_NO_PERMITIDO'
  and pg_temp.hint(pg_temp.fin(current_setting('t.re'), 'a9000000-0000-0000-0000-000000000008')) = 'ROL_NO_PERMITIDO'
  and pg_temp.estado('a9000000-0000-0000-0000-000000000008') = 'en_consulta' and pg_temp.notas('a9000000-0000-0000-0000-000000000008') = 0);
select pg_temp.t('F6 un dentista con un paciente que NO tiene asignado (sin responsable, o de otro dentista) recibe PACIENTE_NO_ASIGNADO y un mensaje accionable',
  pg_temp.hint(pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000002', 'x', pg_temp.nota('d1000000-0000-0000-0000-000000000009'))) = 'PACIENTE_NO_ASIGNADO'
  and pg_temp.hint(pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000003')) = 'PACIENTE_NO_ASIGNADO'
  and pg_temp.msg(pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000002')) like '%asigne como odontólogo responsable%'
  and pg_temp.estado('a9000000-0000-0000-0000-000000000002') = 'en_consulta' and pg_temp.notas('a9000000-0000-0000-0000-000000000002') = 0);
select pg_temp.t('F7 un dentista no finaliza la cita de OTRO odontólogo aunque el paciente sea suyo (CITA_DE_OTRO_DENTISTA)',
  pg_temp.hint(pg_temp.fin(current_setting('t.d2'), 'a9000000-0000-0000-0000-000000000007')) = 'CITA_DE_OTRO_DENTISTA' and pg_temp.estado('a9000000-0000-0000-0000-000000000007') = 'en_consulta');
select pg_temp.t('F8 una cita de una sucursal a la que el dentista no pertenece → SUCURSAL_NO_PERMITIDA, sin efectos',
  pg_temp.hint(pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000004')) = 'SUCURSAL_NO_PERMITIDA' and pg_temp.estado('a9000000-0000-0000-0000-000000000004') = 'en_consulta');
insert into sucursal_usuarios (sucursal_id, usuario_id) values ('f8000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000002');
select set_config('t.r8', pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000004', 'Suc', null, '{"id":"e1000000-0000-0000-0000-000000000008","inicio":"2031-08-01T10:00:00Z","fin":"2031-08-01T10:30:00Z"}'), false);
select pg_temp.t('F8b ya asignado a esa sucursal funciona, y el seguimiento hereda la sucursal de la consulta',
  (pg_temp.j(current_setting('t.r8')) ->> 'ok') = 'true' and (select sucursal_id from citas where id = 'e1000000-0000-0000-0000-000000000008') = 'f8000000-0000-0000-0000-000000000001');

-- ===== F9: AISLAMIENTO ENTRE CLÍNICAS (en ambos sentidos) =====
select pg_temp.t('F9 el owner y el dentista de B NO pueden finalizar la cita de A (CITA_NO_ENCONTRADA: ni siquiera se revela que existe), y el owner de A tampoco la de B',
  pg_temp.hint(pg_temp.fin(current_setting('t.ob'), 'a9000000-0000-0000-0000-000000000008')) = 'CITA_NO_ENCONTRADA'
  and pg_temp.hint(pg_temp.fin(current_setting('t.db'), 'a9000000-0000-0000-0000-000000000008', 'x', pg_temp.nota('d1000000-0000-0000-0000-000000000010'))) = 'CITA_NO_ENCONTRADA'
  and pg_temp.hint(pg_temp.fin(current_setting('t.o'), 'a9000000-0000-0000-0000-00000000000b')) = 'CITA_NO_ENCONTRADA'
  and pg_temp.estado('a9000000-0000-0000-0000-000000000008') = 'en_consulta' and pg_temp.estado('a9000000-0000-0000-0000-00000000000b') = 'en_consulta'
  and pg_temp.notas('a9000000-0000-0000-0000-000000000008') = 0 and pg_temp.notas('a9000000-0000-0000-0000-00000000000b') = 0);
select set_config('t.r9', pg_temp.fin(current_setting('t.db'), 'a9000000-0000-0000-0000-00000000000b', 'B', pg_temp.nota('d1000000-0000-0000-0000-000000000011')), false);
select pg_temp.t('F9b el dentista de B finaliza lo SUYO y la nota va al expediente del paciente de B (el expediente sale del paciente de la cita: el cliente no puede apuntarlo a otra clínica)',
  (pg_temp.j(current_setting('t.r9')) ->> 'ok') = 'true'
  and (select e.paciente_id from notas_clinicas n join expedientes e on e.id = n.expediente_id where n.cita_id = 'a9000000-0000-0000-0000-00000000000b') = 'b8000000-0000-0000-0000-00000000000b'
  and not exists (select 1 from notas_clinicas n join expedientes e on e.id = n.expediente_id join pacientes p on p.id = e.paciente_id where n.usuario_id = current_setting('t.db')::uuid and p.clinica_id <> 'c8000000-0000-0000-0000-00000000000b'));
-- ===== F10: estados =====
select pg_temp.t('F10 una cita cancelada o marcada "no asistió" no se puede finalizar (ESTADO_INVALIDO) y no queda ninguna nota',
  pg_temp.hint(pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000005', 'x', pg_temp.nota('d1000000-0000-0000-0000-000000000012'))) = 'ESTADO_INVALIDO'
  and pg_temp.hint(pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000006')) = 'ESTADO_INVALIDO'
  and pg_temp.estado('a9000000-0000-0000-0000-000000000005') = 'cancelada' and pg_temp.notas('a9000000-0000-0000-0000-000000000005') = 0);
-- ===== F11: plan =====
update suscripcion_funcionalidades set habilitada = false where funcionalidad = 'notas_clinicas' and suscripcion_id = (select id from suscripciones where clinica_id = 'c8000000-0000-0000-0000-00000000000a' and estado <> 'reemplazada');
select pg_temp.t('F11 sin notas clínicas en el plan: con nota → FUNCIONALIDAD_NO_INCLUIDA (sin efectos); SIN nota la consulta sí se cierra (cerrar no depende de las notas)',
  pg_temp.hint(pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-00000000000e', 'x', pg_temp.nota('d1000000-0000-0000-0000-000000000013'))) = 'FUNCIONALIDAD_NO_INCLUIDA'
  and pg_temp.estado('a9000000-0000-0000-0000-00000000000e') = 'en_consulta'
  and pg_temp.hint(pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-00000000000e', 'sin plan de notas')) = 'OK' and pg_temp.estado('a9000000-0000-0000-0000-00000000000e') = 'completada' and pg_temp.notas('a9000000-0000-0000-0000-00000000000e') = 0);
update suscripcion_funcionalidades set habilitada = true where funcionalidad = 'notas_clinicas' and suscripcion_id = (select id from suscripciones where clinica_id = 'c8000000-0000-0000-0000-00000000000a' and estado <> 'reemplazada');
update suscripcion_funcionalidades set habilitada = false where funcionalidad = 'citas' and suscripcion_id = (select id from suscripciones where clinica_id = 'c8000000-0000-0000-0000-00000000000a' and estado <> 'reemplazada');
select pg_temp.t('F11b sin la funcionalidad "citas" en el plan tampoco se finaliza (las políticas restrictivas plan_func_* siguen valiendo dentro de la función)',
  pg_temp.hint(pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-00000000000f')) = 'FUNCIONALIDAD_NO_INCLUIDA' and pg_temp.estado('a9000000-0000-0000-0000-00000000000f') = 'en_consulta');
update suscripcion_funcionalidades set habilitada = true where funcionalidad = 'citas' and suscripcion_id = (select id from suscripciones where clinica_id = 'c8000000-0000-0000-0000-00000000000a' and estado <> 'reemplazada');
-- ===== F12: candado optimista (subida offline) =====
select set_config('t.act', (select actualizado_en::text from citas where id = 'a9000000-0000-0000-0000-00000000000f'), false);
select pg_temp.t('F12 con un candado de concurrencia desactualizado → CONFLICTO_CONCURRENCIA (mensaje exacto que ya entiende la cola offline) y sin efectos; con el vigente funciona',
  pg_temp.msg(pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-00000000000f', 'x', null, null, '2020-01-01 00:00:00+00')) = 'CONFLICTO_CONCURRENCIA'
  and pg_temp.hint(pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-00000000000f', 'x', null, null, '2020-01-01 00:00:00+00')) = 'CONFLICTO_CONCURRENCIA'
  and pg_temp.estado('a9000000-0000-0000-0000-00000000000f') = 'en_consulta'
  and pg_temp.hint(pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-00000000000f', 'x', null, null, current_setting('t.act'))) = 'OK');
-- ===== F13-F15: sesión =====
select pg_temp.t('F13 un usuario anónimo no puede ejecutar la función; uno autenticado sin usuario en SIRO recibe SESION_INVALIDA',
  not has_function_privilege('anon', 'fn_finalizar_consulta(uuid,text,jsonb,jsonb,timestamptz)', 'EXECUTE')
  and pg_temp.hint(pg_temp.fin('a8000000-0000-0000-0000-00000000000b', 'a9000000-0000-0000-0000-000000000009')) = 'SESION_INVALIDA' and pg_temp.estado('a9000000-0000-0000-0000-000000000009') = 'en_consulta');
update clinicas set estado = 'suspendida' where id = 'c8000000-0000-0000-0000-00000000000a';
select pg_temp.t('F14 una clínica SUSPENDIDA no puede finalizar consultas (SESION_INVALIDA)',
  pg_temp.hint(pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000009')) = 'SESION_INVALIDA' and pg_temp.estado('a9000000-0000-0000-0000-000000000009') = 'en_consulta');
update clinicas set estado = 'activa' where id = 'c8000000-0000-0000-0000-00000000000a';
update plataforma_config set valor = 'on' where clave = 'control_sesiones_estricto';
select pg_temp.t('F15 con el control estricto de sesiones ENCENDIDO: una sesión revocada recibe SESION_CERRADA y sin efectos; una sesión viva y los tokens sin session_id siguen funcionando',
  pg_temp.hint(pg_temp.como(current_setting('t.d')::uuid, format('select fn_finalizar_consulta(%L::uuid)::text', 'a9000000-0000-0000-0000-000000000009'), jsonb_build_object('session_id', 'aaaaaaaa-0000-0000-0000-000000000001'))) = 'SESION_CERRADA'
  and pg_temp.estado('a9000000-0000-0000-0000-000000000009') = 'en_consulta'
  and pg_temp.hint(pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000009')) = 'OK');
update plataforma_config set valor = 'off' where clave = 'control_sesiones_estricto';
-- ===== F16-F18: integridad de la nota =====
select set_config('t.r16a', pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-00000000000a', 'x', pg_temp.nota('d1000000-0000-0000-0000-000000000001')), false);
select set_config('t.r16b', pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-00000000000a', 'x', jsonb_build_object('id','d1000000-0000-0000-0000-000000000020','contenido','n','creado_en','2099-01-01T00:00:00Z')::text), false);
select pg_temp.t('F16 el id de una nota ya usada por OTRA cita no se puede reutilizar (NOTA_CONFLICTO, sin efectos), y la hora de captura nunca queda en el futuro',
  pg_temp.hint(current_setting('t.r16a')) = 'NOTA_CONFLICTO' and pg_temp.hint(current_setting('t.r16b')) = 'OK'
  and (select creado_en <= now() from notas_clinicas where id = 'd1000000-0000-0000-0000-000000000020'));
select pg_temp.t('F17 la inmutabilidad de las notas se conserva: authenticated sigue SIN poder actualizar ni borrar notas, y la función no abrió ninguna política nueva',
  pg_temp.como(current_setting('t.d')::uuid, $q$with d as (update notas_clinicas set contenido = 'x' returning 1) select count(*)::text from d$q$) like 'ERR|42501|%'
  and pg_temp.como(current_setting('t.d')::uuid, $q$with d as (delete from notas_clinicas returning 1) select count(*)::text from d$q$) like 'ERR|42501|%'
  and (select count(*) from pg_policies where tablename = 'notas_clinicas') = 4 and (select count(*) from pg_policies where tablename = 'citas') = 5);
select pg_temp.t('F18 queda en la auditoría de la clínica correcta (la nota y la cita completada, a nombre del dentista)',
  exists (select 1 from auditoria a where a.entidad = 'notas_clinicas' and a.usuario_id = current_setting('t.d')::uuid and a.clinica_id = 'c8000000-0000-0000-0000-00000000000a')
  and exists (select 1 from auditoria a where a.entidad = 'citas' and a.usuario_id = current_setting('t.d')::uuid and a.clinica_id = 'c8000000-0000-0000-0000-00000000000a'));
-- ===== F19: owner =====
select set_config('t.r19', pg_temp.fin(current_setting('t.o'), 'a9000000-0000-0000-0000-000000000002', '   ', pg_temp.nota('d1000000-0000-0000-0000-000000000021')), false);
select pg_temp.t('F19 el propietario puede finalizar cualquier consulta de su clínica (incluida la de un paciente sin responsable), y un motivo vacío se guarda como NULL',
  pg_temp.hint(current_setting('t.r19')) = 'OK'
  and pg_temp.estado('a9000000-0000-0000-0000-000000000002') = 'completada' and (select motivo_consulta from citas where id = 'a9000000-0000-0000-0000-000000000002') is null
  and (select usuario_id from notas_clinicas where cita_id = 'a9000000-0000-0000-0000-000000000002') = current_setting('t.o')::uuid);

-- ===== F20: el cliente NO decide de quién ni dónde es una nota clínica =====
select set_config('t.r20', pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000008', 'x',
  jsonb_build_object('id', 'd1000000-0000-0000-0000-000000000030', 'contenido', 'nota con campos falsificados',
    'usuario_id', current_setting('t.o'),                                                                                  -- otro usuario
    'expediente_id', (select id from expedientes where paciente_id = 'b8000000-0000-0000-0000-00000000000b'),             -- el expediente de un paciente de OTRA clínica
    'cita_id', 'a9000000-0000-0000-0000-00000000000b', 'editado', true, 'version_anterior_id', 'd1000000-0000-0000-0000-000000000001')::text), false);
select pg_temp.t('F20 una nota con usuario_id, expediente_id, cita_id y versión anterior FALSIFICADOS se guarda con los VERDADEROS: el usuario autenticado, el expediente del paciente de la cita, esa cita, sin marcar y sin versión anterior',
  pg_temp.hint(current_setting('t.r20')) = 'OK'
  and (select usuario_id from notas_clinicas where id = 'd1000000-0000-0000-0000-000000000030') = current_setting('t.d')::uuid
  and (select expediente_id from notas_clinicas where id = 'd1000000-0000-0000-0000-000000000030') = (select id from expedientes where paciente_id = 'b8000000-0000-0000-0000-000000000001')
  and (select cita_id from notas_clinicas where id = 'd1000000-0000-0000-0000-000000000030') = 'a9000000-0000-0000-0000-000000000008'
  and coalesce((select editado from notas_clinicas where id = 'd1000000-0000-0000-0000-000000000030'), false) = false
  and (select version_anterior_id from notas_clinicas where id = 'd1000000-0000-0000-0000-000000000030') is null
  and not exists (select 1 from notas_clinicas where cita_id = 'a9000000-0000-0000-0000-00000000000b' and contenido = 'nota con campos falsificados'));

do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO 085: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 150), ' | ') from _res where not ok); end if;
end $$;
rollback;
