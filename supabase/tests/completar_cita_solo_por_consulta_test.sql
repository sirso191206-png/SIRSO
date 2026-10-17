-- Migración 090: una cita solo se completa finalizando la consulta; recuperación de citas completadas sin nota; listado.
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


create function pg_temp.como_rol(p_rol text, p_uid uuid, p_sql text, p_claims jsonb default '{}'::jsonb) returns text language plpgsql as $$
declare v text; h text; m text;
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '' else (jsonb_build_object('sub', p_uid, 'role', p_rol) || p_claims)::text end, true);
  execute format('set local role %I', p_rol);
  begin execute p_sql into v; reset role; return v;
  exception when others then get stacked diagnostics h = pg_exception_hint, m = message_text; reset role; return 'ERR|'||coalesce(nullif(h, ''), sqlstate)||'|'||m; end;
end $$;
create function pg_temp.directo(p_uid text, p_cita text, p_estado text) returns text language sql as $$
  select pg_temp.como(p_uid::uuid, format('with u as (update citas set estado = %L where id = %L returning 1) select count(*)::text from u', p_estado, p_cita)) $$;
create function pg_temp.nx(p_id text, p_extra jsonb default '{}'::jsonb) returns text language sql as $$
  select (jsonb_build_object('id', p_id, 'contenido', 'Se atendió', 'diagnostico', 'Caries', 'interrogatorio_sistemas', jsonb_build_object('a', 1), 'hallazgos', 'Pieza 36') || p_extra)::text $$;
create function pg_temp.sg(p_id text, p_ini text, p_fin text, p_motivo text default 'Control') returns text language sql as $$
  select jsonb_build_object('id', p_id, 'inicio', p_ini, 'fin', p_fin, 'motivo', p_motivo)::text $$;
create function pg_temp.rec(p_uid text, p_cita text, p_nota text default null, p_seg text default null) returns text language sql as $$
  select pg_temp.como(p_uid::uuid, format('select fn_completar_consulta_pendiente(%L::uuid, %L::jsonb, %L::jsonb)::text', p_cita, p_nota, p_seg)) $$;
create function pg_temp.lista(p_uid text, p_dias int default 30) returns text language sql as $$
  select pg_temp.como(p_uid::uuid, format('select coalesce(string_agg(cita_id::text, '','' order by cita_id), '''') from fn_consultas_sin_nota(%s)', p_dias)) $$;
create function pg_temp.cita_nueva(p_id text, p_dia int, p_pac text default 'b8000000-0000-0000-0000-000000000001', p_estado text default 'en_consulta') returns void language plpgsql as $$
begin
  insert into citas (id, paciente_id, dentista_id, inicio, fin, estado) values (p_id::uuid, p_pac::uuid, 'a8000000-0000-0000-0000-000000000002',
    timestamptz '2032-01-01 09:00+00' + (p_dia || ' days')::interval, timestamptz '2032-01-01 09:30+00' + (p_dia || ' days')::interval, p_estado);
end $$;
create function pg_temp.total_notas() returns bigint language sql as $$ select count(*) from notas_clinicas $$;
create function pg_temp.total_citas() returns bigint language sql as $$ select count(*) from citas $$;

-- ===== M1-M2: un usuario final NO puede dejar una cita en "completada" (la base lo hace cumplir, no solo la interfaz) =====
select set_config('t.m1d', pg_temp.directo(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000001', 'completada'), false);
select set_config('t.m1o', pg_temp.directo(current_setting('t.o'), 'a9000000-0000-0000-0000-000000000001', 'completada'), false);
select set_config('t.m1r', pg_temp.directo(current_setting('t.re'), 'a9000000-0000-0000-0000-000000000001', 'completada'), false);
select pg_temp.t('M1 el dentista, el propietario y la recepción reciben COMPLETAR_SOLO_VIA_CONSULTA al marcar "completada" directamente (antes: se completaba sin consulta); la cita no cambia',
  pg_temp.hint(current_setting('t.m1d')) = 'COMPLETAR_SOLO_VIA_CONSULTA' and pg_temp.hint(current_setting('t.m1o')) = 'COMPLETAR_SOLO_VIA_CONSULTA' and pg_temp.hint(current_setting('t.m1r')) = 'COMPLETAR_SOLO_VIA_CONSULTA'
  and pg_temp.estado('a9000000-0000-0000-0000-000000000001') = 'en_consulta' and pg_temp.msg(current_setting('t.m1d')) like '%finalizando la consulta clínica%');
select pg_temp.t('M2 insertar una cita ya "completada" por la API también se bloquea; insertar una agendada sigue funcionando',
  pg_temp.hint(pg_temp.como(current_setting('t.o')::uuid, $q$with i as (insert into citas (paciente_id, dentista_id, inicio, fin, estado) values ('b8000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000002', '2033-01-01 09:00+00', '2033-01-01 09:30+00', 'completada') returning 1) select count(*)::text from i$q$)) = 'COMPLETAR_SOLO_VIA_CONSULTA'
  and pg_temp.como(current_setting('t.o')::uuid, $q$with i as (insert into citas (paciente_id, dentista_id, inicio, fin, estado) values ('b8000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000002', '2033-01-02 09:00+00', '2033-01-02 09:30+00', 'agendada') returning 1) select count(*)::text from i$q$) = '1');
-- ===== M3: las acciones ADMINISTRATIVAS siguen libres y no generan notas =====
select pg_temp.cita_nueva('a9000000-0000-0000-0000-000000000201', 1, 'b8000000-0000-0000-0000-000000000001', 'agendada');
select set_config('t.n0', pg_temp.total_notas()::text, false);
do $$ declare e text; mal text := ''; r text; begin
  foreach e in array array['pendiente_confirmar','confirmada','en_espera','en_consulta','no_asistio','agendada','cancelada'] loop
    r := pg_temp.directo(current_setting('t.o'), 'a9000000-0000-0000-0000-000000000201', e);
    if r <> '1' or pg_temp.estado('a9000000-0000-0000-0000-000000000201') <> e then mal := mal || '[' || e || ': ' || r || ']'; end if;
  end loop;
  perform set_config('t.m3', mal, false);
end $$;
select pg_temp.t('M3 confirmar, pendiente, en espera, iniciar consulta, no asistió, reprogramar (agendada) y cancelar siguen funcionando para el propietario, SIN generar ninguna nota',
  current_setting('t.m3') = '' and pg_temp.total_notas()::text = current_setting('t.n0'));
select pg_temp.t('M3b la recepción confirma/pone en espera y el dentista cancela o marca no asistió sus citas; todo administrativo',
  pg_temp.directo(current_setting('t.re'), 'a9000000-0000-0000-0000-000000000201', 'confirmada') = '1' and pg_temp.directo(current_setting('t.re'), 'a9000000-0000-0000-0000-000000000201', 'en_espera') = '1'
  and pg_temp.directo(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000201', 'no_asistio') = '1');
-- ===== M4: quién SÍ puede (la operación administrativa y la función de finalización) =====
select pg_temp.t('M4 service_role y el propietario de la base (operación administrativa) pueden marcar "completada" directamente; fn_finalizar_consulta (SECURITY DEFINER) sigue completando',
  pg_temp.como_rol('service_role', null, $q$with u as (update citas set estado = 'completada' where id = 'a9000000-0000-0000-0000-000000000002' returning 1) select count(*)::text from u$q$) = '1'
  and pg_temp.estado('a9000000-0000-0000-0000-000000000002') = 'completada'
  and pg_temp.hint(pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000003')) <> 'COMPLETAR_SOLO_VIA_CONSULTA'
  and (pg_temp.j(pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-00000000000c', 'x', pg_temp.nx('d1000000-0000-0000-0000-0000000000c1'))) ->> 'ok') = 'true' and pg_temp.estado('a9000000-0000-0000-0000-00000000000c') = 'completada');
select pg_temp.t('M4b sobre una cita YA completada el usuario puede editar otros campos y «completada → completada» no es un cambio; pero cambiar su estado directamente se BLOQUEA (migración 094: la corrección y la reapertura van por fn_corregir_estado_cita, con motivo y auditoría); y volver a «completada» directamente sigue bloqueado',
  pg_temp.como(current_setting('t.o')::uuid, $q$with u as (update citas set notas = 'nota interna' where id = 'a9000000-0000-0000-0000-00000000000c' returning 1) select count(*)::text from u$q$) = '1'
  and pg_temp.directo(current_setting('t.o'), 'a9000000-0000-0000-0000-00000000000c', 'completada') = '1'
  and pg_temp.hint(pg_temp.directo(current_setting('t.o'), 'a9000000-0000-0000-0000-00000000000c', 'confirmada')) = 'CORREGIR_ESTADO_REQUIERE_MOTIVO'
  and pg_temp.estado('a9000000-0000-0000-0000-00000000000c') = 'completada'
  and pg_temp.hint(pg_temp.directo(current_setting('t.o'), 'a9000000-0000-0000-0000-000000000001', 'completada')) = 'COMPLETAR_SOLO_VIA_CONSULTA');

-- ===== R: recuperación de una cita completada SIN nota =====
select pg_temp.cita_nueva('a9000000-0000-0000-0000-000000000210', 10); select pg_temp.cita_nueva('a9000000-0000-0000-0000-000000000211', 11); select pg_temp.cita_nueva('a9000000-0000-0000-0000-000000000212', 12);
select pg_temp.cita_nueva('a9000000-0000-0000-0000-000000000213', 13); select pg_temp.cita_nueva('a9000000-0000-0000-0000-000000000214', 14);
update citas set estado = 'completada', motivo_consulta = 'Dolor' where id in ('a9000000-0000-0000-0000-000000000210','a9000000-0000-0000-0000-000000000211','a9000000-0000-0000-0000-000000000212','a9000000-0000-0000-0000-000000000213');
select set_config('t.act0', (select actualizado_en::text from citas where id = 'a9000000-0000-0000-0000-000000000210'), false);
select set_config('t.l0', pg_temp.lista(current_setting('t.d')), false);
select pg_temp.t('L1 antes de recuperar: el dentista ve SUS citas completadas sin nota (210-213), no las que tienen nota ni las en consulta',
  current_setting('t.l0') like '%a9000000-0000-0000-0000-000000000210%' and current_setting('t.l0') like '%a9000000-0000-0000-0000-000000000213%' and current_setting('t.l0') not like '%a9000000-0000-0000-0000-000000000214%'
  and current_setting('t.l0') not like '%a9000000-0000-0000-0000-00000000000c%');
select set_config('t.r1', pg_temp.rec(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000210', pg_temp.nx('d1000000-0000-0000-0000-000000000210')), false);
select pg_temp.t('R1 completar la consulta pendiente crea la nota (autor = quien la completa) y la VERIFICA; NO modifica la cita (estado, motivo y actualizado_en intactos)',
  (pg_temp.j(current_setting('t.r1')) ->> 'ya_existia') = 'false' and (pg_temp.j(current_setting('t.r1')) -> 'verificado' ->> 'nota') = 'true' and pg_temp.notas('a9000000-0000-0000-0000-000000000210') = 1
  and (select usuario_id from notas_clinicas where cita_id = 'a9000000-0000-0000-0000-000000000210') = current_setting('t.d')::uuid
  and (select (estado, motivo_consulta, actualizado_en::text) = ('completada', 'Dolor', current_setting('t.act0')) from citas where id = 'a9000000-0000-0000-0000-000000000210'));
select set_config('t.n1', pg_temp.total_notas()::text, false);
select pg_temp.t('R2 doble clic / respuesta perdida: repetirla es IDEMPOTENTE (ya_existia, sin crear nada); con OTRO contenido → NOTA_CONFLICTO; con OTRO id de nota → CONSULTA_YA_TIENE_NOTA (nunca una segunda nota)',
  (pg_temp.j(pg_temp.rec(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000210', pg_temp.nx('d1000000-0000-0000-0000-000000000210'))) ->> 'ya_existia') = 'true'
  and pg_temp.hint(pg_temp.rec(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000210', pg_temp.nx('d1000000-0000-0000-0000-000000000210', '{"contenido":"otro"}'))) = 'NOTA_CONFLICTO'
  and pg_temp.hint(pg_temp.rec(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000210', pg_temp.nx('d1000000-0000-0000-0000-0000000002ff'))) = 'CONSULTA_YA_TIENE_NOTA'
  and pg_temp.total_notas()::text = current_setting('t.n1'));
select pg_temp.t('L2 tras recuperarla, la cita DESAPARECE del listado; el propietario sigue viendo las demás',
  pg_temp.lista(current_setting('t.d')) not like '%a9000000-0000-0000-0000-000000000210%' and pg_temp.lista(current_setting('t.o')) like '%a9000000-0000-0000-0000-000000000211%');
select pg_temp.t('R3 estados y datos inválidos: cita NO completada → CITA_NO_COMPLETADA; sin nada que completar → NADA_QUE_COMPLETAR; sin id → ID_REQUERIDO_PARA_REINTENTO; nada se escribe',
  pg_temp.hint(pg_temp.rec(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000214', pg_temp.nx('d1000000-0000-0000-0000-000000000214'))) = 'CITA_NO_COMPLETADA' and pg_temp.estado('a9000000-0000-0000-0000-000000000214') = 'en_consulta'
  and pg_temp.hint(pg_temp.rec(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000211')) = 'NADA_QUE_COMPLETAR'
  and pg_temp.hint(pg_temp.rec(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000211', '{"contenido":"x"}')) = 'ID_REQUERIDO_PARA_REINTENTO'
  and pg_temp.notas('a9000000-0000-0000-0000-000000000211') = 0 and pg_temp.notas('a9000000-0000-0000-0000-000000000214') = 0);
-- seguimiento en la recuperación
select set_config('t.n2', pg_temp.total_notas()::text, false), set_config('t.c2', pg_temp.total_citas()::text, false);
select set_config('t.r4', pg_temp.rec(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000211', pg_temp.nx('d1000000-0000-0000-0000-000000000211'), pg_temp.sg('e1000000-0000-0000-0000-000000000211', '2034-03-01T10:00:00Z', '2034-03-01T10:30:00Z')), false);
select pg_temp.t('R4 con seguimiento: se crean la nota Y el seguimiento (mismo paciente, odontólogo y sucursal), verificados; repetir no duplica',
  (pg_temp.j(current_setting('t.r4')) -> 'verificado' ->> 'seguimiento') = 'true' and pg_temp.total_notas() = current_setting('t.n2')::bigint + 1 and pg_temp.total_citas() = current_setting('t.c2')::bigint + 1
  and (pg_temp.j(pg_temp.rec(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000211', pg_temp.nx('d1000000-0000-0000-0000-000000000211'), pg_temp.sg('e1000000-0000-0000-0000-000000000211', '2034-03-01T10:00:00Z', '2034-03-01T10:30:00Z'))) ->> 'ya_existia') = 'true'
  and pg_temp.total_citas() = current_setting('t.c2')::bigint + 1);
insert into citas (id, paciente_id, dentista_id, inicio, fin, estado) values ('a9000000-0000-0000-0000-0000000002f1', 'b8000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000002', '2034-04-01 10:00+00', '2034-04-01 10:30+00', 'agendada');
select set_config('t.n3', pg_temp.total_notas()::text, false), set_config('t.c3', pg_temp.total_citas()::text, false);
select set_config('t.r5', pg_temp.rec(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000212', pg_temp.nx('d1000000-0000-0000-0000-000000000212'), pg_temp.sg('e1000000-0000-0000-0000-000000000212', '2034-04-01T10:10:00Z', '2034-04-01T10:40:00Z')), false);
select pg_temp.t('R5 un seguimiento en horario ocupado → HORARIO_OCUPADO y se revierte TODO (sin nota ni seguimiento); con otro horario y los mismos ids funciona',
  pg_temp.hint(current_setting('t.r5')) = 'HORARIO_OCUPADO' and pg_temp.total_notas()::text = current_setting('t.n3') and pg_temp.total_citas()::text = current_setting('t.c3')
  and (pg_temp.j(pg_temp.rec(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000212', pg_temp.nx('d1000000-0000-0000-0000-000000000212'), pg_temp.sg('e1000000-0000-0000-0000-000000000212', '2034-04-02T10:00:00Z', '2034-04-02T10:30:00Z'))) -> 'verificado' ->> 'seguimiento') = 'true');
select pg_temp.t('R6 un seguimiento con el id de OTRA cita o de la propia cita → SEGUIMIENTO_CONFLICTO sin tocar nada',
  pg_temp.hint(pg_temp.rec(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000213', pg_temp.nx('d1000000-0000-0000-0000-000000000213'), pg_temp.sg('e1000000-0000-0000-0000-000000000211', '2034-05-01T10:00:00Z', '2034-05-01T10:30:00Z'))) = 'SEGUIMIENTO_CONFLICTO'
  and pg_temp.hint(pg_temp.rec(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000213', null, pg_temp.sg('a9000000-0000-0000-0000-000000000213', '2034-05-01T10:00:00Z', '2034-05-01T10:30:00Z'))) = 'SEGUIMIENTO_CONFLICTO'
  and pg_temp.notas('a9000000-0000-0000-0000-000000000213') = 0);
-- autorización
select pg_temp.t('R7 autorización: asistente y recepción → ROL_NO_PERMITIDO; un dentista con un paciente que no es suyo → PACIENTE_NO_ASIGNADO; la cita de otro odontólogo → CITA_DE_OTRO_DENTISTA; otra clínica → CITA_NO_ENCONTRADA; sin escribir nada',
  pg_temp.hint(pg_temp.rec(current_setting('t.as'), 'a9000000-0000-0000-0000-000000000213', pg_temp.nx('d1000000-0000-0000-0000-000000000213'))) = 'ROL_NO_PERMITIDO'
  and pg_temp.hint(pg_temp.rec(current_setting('t.re'), 'a9000000-0000-0000-0000-000000000213', pg_temp.nx('d1000000-0000-0000-0000-000000000213'))) = 'ROL_NO_PERMITIDO'
  and pg_temp.hint(pg_temp.rec(current_setting('t.d2'), 'a9000000-0000-0000-0000-000000000213', pg_temp.nx('d1000000-0000-0000-0000-000000000213'))) in ('PACIENTE_NO_ASIGNADO', 'CITA_DE_OTRO_DENTISTA')
  and pg_temp.hint(pg_temp.rec(current_setting('t.db'), 'a9000000-0000-0000-0000-000000000213', pg_temp.nx('d1000000-0000-0000-0000-000000000213'))) = 'CITA_NO_ENCONTRADA'
  and pg_temp.hint(pg_temp.rec(current_setting('t.ob'), 'a9000000-0000-0000-0000-000000000213', pg_temp.nx('d1000000-0000-0000-0000-000000000213'))) = 'CITA_NO_ENCONTRADA'
  and pg_temp.notas('a9000000-0000-0000-0000-000000000213') = 0);
update plataforma_config set valor = 'on' where clave = 'control_sesiones_estricto';
select set_config('t.r8', pg_temp.como(current_setting('t.d')::uuid, format('select fn_completar_consulta_pendiente(%L::uuid, %L::jsonb)::text', 'a9000000-0000-0000-0000-000000000213', pg_temp.nx('d1000000-0000-0000-0000-000000000213')), jsonb_build_object('session_id', 'aaaaaaaa-0000-0000-0000-000000000001')), false);
update plataforma_config set valor = 'off' where clave = 'control_sesiones_estricto';
update suscripcion_funcionalidades set habilitada = false where funcionalidad = 'notas_clinicas' and suscripcion_id = (select id from suscripciones where clinica_id = 'c8000000-0000-0000-0000-00000000000a' and estado <> 'reemplazada');
select pg_temp.t('R8 sesión revocada → SESION_CERRADA; plan sin notas → FUNCIONALIDAD_NO_INCLUIDA y el listado queda vacío; sin escribir nada',
  pg_temp.hint(current_setting('t.r8')) = 'SESION_CERRADA' and pg_temp.hint(pg_temp.rec(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000213', pg_temp.nx('d1000000-0000-0000-0000-000000000213'))) = 'FUNCIONALIDAD_NO_INCLUIDA'
  and pg_temp.lista(current_setting('t.o')) = '' and pg_temp.notas('a9000000-0000-0000-0000-000000000213') = 0);
update suscripcion_funcionalidades set habilitada = true where funcionalidad = 'notas_clinicas' and suscripcion_id = (select id from suscripciones where clinica_id = 'c8000000-0000-0000-0000-00000000000a' and estado <> 'reemplazada');
select pg_temp.cita_nueva('a9000000-0000-0000-0000-000000000220', 20, 'b8000000-0000-0000-0000-000000000002');
update citas set estado = 'completada' where id = 'a9000000-0000-0000-0000-000000000220';
select set_config('t.r9', pg_temp.rec(current_setting('t.o'), 'a9000000-0000-0000-0000-000000000220', pg_temp.nx('d1000000-0000-0000-0000-000000000220', jsonb_build_object('usuario_id', current_setting('t.d'), 'expediente_id', (select id from expedientes where paciente_id = 'b8000000-0000-0000-0000-00000000000b')))), false);
select pg_temp.t('R9 el propietario completa la consulta de un paciente sin responsable; los campos falsificados (usuario_id, expediente_id) se ignoran: el autor es quien está autenticado y la nota va al expediente del paciente de la cita', (pg_temp.j(current_setting('t.r9')) ->> 'ok') = 'true'
  and (select usuario_id from notas_clinicas where cita_id = 'a9000000-0000-0000-0000-000000000220') = current_setting('t.o')::uuid
  and (select e.paciente_id from notas_clinicas n join expedientes e on e.id = n.expediente_id where n.cita_id = 'a9000000-0000-0000-0000-000000000220') = 'b8000000-0000-0000-0000-000000000002');
-- ===== L: el listado respeta roles, clínicas, sucursales y ventana =====
update citas set estado = 'completada', inicio = now() - interval '100 days', fin = now() - interval '100 days' + interval '30 minutes' where id = 'a9000000-0000-0000-0000-000000000214';
update citas set estado = 'completada' where id = 'a9000000-0000-0000-0000-000000000004';
select pg_temp.t('L3 ventana: una cita de hace 100 días no sale con 30 días y sí con 365; valores absurdos de p_dias se acotan (sin error)',
  pg_temp.lista(current_setting('t.d'), 30) not like '%a9000000-0000-0000-0000-000000000214%' and pg_temp.lista(current_setting('t.d'), 365) like '%a9000000-0000-0000-0000-000000000214%'
  and pg_temp.lista(current_setting('t.d'), -5) not like 'ERR%' and pg_temp.lista(current_setting('t.d'), 100000) not like 'ERR%');
select pg_temp.t('L4 sucursal: una cita de una sucursal a la que el dentista no pertenece NO aparece para él pero sí para el propietario',
  pg_temp.lista(current_setting('t.d'), 365) not like '%a9000000-0000-0000-0000-000000000004%' and pg_temp.lista(current_setting('t.o'), 365) like '%a9000000-0000-0000-0000-000000000004%');
select pg_temp.t('L5 roles y aislamiento: recepción, asistente, un anónimo y la otra clínica reciben una lista VACÍA (no un error ni datos ajenos); el dentista no ve las citas de otro odontólogo',
  pg_temp.lista(current_setting('t.re'), 365) = '' and pg_temp.lista(current_setting('t.as'), 365) = '' and pg_temp.lista(current_setting('t.ob'), 365) = '' and pg_temp.lista(current_setting('t.db'), 365) = ''
  and pg_temp.como_rol('anon', null, 'select count(*)::text from fn_consultas_sin_nota(30)') like 'ERR|42501|%'
  and pg_temp.lista(current_setting('t.d2'), 365) = '');
-- ===== R10: cada control de autorización se prueba AISLADO (si no, uno tapa al otro) =====
insert into citas (id, paciente_id, dentista_id, inicio, fin, estado) values ('a9000000-0000-0000-0000-000000000230', 'b8000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000003', '2033-06-01 09:00+00', '2033-06-01 09:30+00', 'completada');   -- paciente de D, cita de D2
select pg_temp.cita_nueva('a9000000-0000-0000-0000-000000000231', 31, 'b8000000-0000-0000-0000-000000000003', 'completada');                                                                         -- cita de D, paciente de D2
select pg_temp.cita_nueva('a9000000-0000-0000-0000-000000000232', 32, 'b8000000-0000-0000-0000-000000000001', 'completada');
select pg_temp.cita_nueva('a9000000-0000-0000-0000-000000000233', 33, 'b8000000-0000-0000-0000-000000000001', 'completada');
select pg_temp.cita_nueva('a9000000-0000-0000-0000-000000000234', 34, 'b8000000-0000-0000-0000-000000000001', 'completada');
update citas set motivo_consulta = 'Dolor' where id = 'a9000000-0000-0000-0000-000000000234';
insert into citas (id, paciente_id, dentista_id, inicio, fin, estado) values ('a9000000-0000-0000-0000-000000000235', 'b8000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000005', '2033-07-01 09:00+00', '2033-07-01 09:30+00', 'completada');   -- dato ANÓMALO: odontólogo = un usuario de recepción
select pg_temp.t('R10a SOLO «cita de otro odontólogo» (el paciente SÍ es del dentista): CITA_DE_OTRO_DENTISTA; SOLO «paciente no asignado» (la cita SÍ es del dentista): PACIENTE_NO_ASIGNADO; SOLO «sucursal no permitida»: SUCURSAL_NO_PERMITIDA',
  pg_temp.hint(pg_temp.rec(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000230', pg_temp.nx('d1000000-0000-0000-0000-000000000230'))) = 'CITA_DE_OTRO_DENTISTA'
  and pg_temp.hint(pg_temp.rec(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000231', pg_temp.nx('d1000000-0000-0000-0000-000000000231'))) = 'PACIENTE_NO_ASIGNADO'
  and pg_temp.hint(pg_temp.rec(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000004', pg_temp.nx('d1000000-0000-0000-0000-000000000004'))) = 'SUCURSAL_NO_PERMITIDA'
  and pg_temp.notas('a9000000-0000-0000-0000-000000000230') = 0 and pg_temp.notas('a9000000-0000-0000-0000-000000000231') = 0 and pg_temp.notas('a9000000-0000-0000-0000-000000000004') = 0);
select set_config('request.jwt.claims', '', true);   -- preparación como ADMINISTRADOR (sin sub)
insert into notas_clinicas (id, expediente_id, cita_id, usuario_id, contenido, tipo, diagnostico, interrogatorio_sistemas, hallazgos)
  select 'd1000000-0000-0000-0000-000000000232', e.id, 'a9000000-0000-0000-0000-000000000232', current_setting('t.o')::uuid, 'Se atendió', 'consulta', 'Caries', '{"a":1}', 'Pieza 36' from expedientes e where e.paciente_id = 'b8000000-0000-0000-0000-000000000001';
select pg_temp.t('R10b una nota existente IDÉNTICA pero escrita por OTRO usuario (el propietario) no es un reintento del dentista: NOTA_CONFLICTO (el autor cuenta)',
  pg_temp.hint(pg_temp.rec(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000232', pg_temp.nx('d1000000-0000-0000-0000-000000000232'))) = 'NOTA_CONFLICTO');
select set_config('t.r10c', pg_temp.rec(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000233', null, pg_temp.sg('e1000000-0000-0000-0000-000000000233', '2034-07-01T10:00:00Z', '2034-07-01T10:30:00Z')), false);
update citas set inicio = inicio - interval '5 minutes' where id = 'e1000000-0000-0000-0000-000000000233';
select pg_temp.t('R10c un seguimiento existente que difiere SOLO en el inicio no se acepta como reintento: SEGUIMIENTO_CONFLICTO (se creó bien la primera vez)',
  (pg_temp.j(current_setting('t.r10c')) -> 'verificado' ->> 'seguimiento') = 'true'
  and pg_temp.hint(pg_temp.rec(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000233', null, pg_temp.sg('e1000000-0000-0000-0000-000000000233', '2034-07-01T10:00:00Z', '2034-07-01T10:30:00Z'))) = 'SEGUIMIENTO_CONFLICTO');
select pg_temp.t('R10d un seguimiento con el id de la PROPIA cita, con SU mismo horario y motivo (que la comparación daría por bueno) → SEGUIMIENTO_CONFLICTO',
  pg_temp.hint(pg_temp.rec(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000234', null, pg_temp.sg('a9000000-0000-0000-0000-000000000234', '2032-02-04T09:00:00Z', '2032-02-04T09:30:00Z', 'Dolor'))) = 'SEGUIMIENTO_CONFLICTO');
select pg_temp.t('L6 el dentista NO ve en su lista una cita de OTRO odontólogo aunque el paciente sea suyo (filtro «solo las suyas»), el propietario sí; y un usuario de recepción con un dato anómalo (aparece como odontólogo de una cita) recibe lista VACÍA (el rol se comprueba)',
  pg_temp.lista(current_setting('t.d'), 3000) not like '%a9000000-0000-0000-0000-000000000230%' and pg_temp.lista(current_setting('t.o'), 3000) like '%a9000000-0000-0000-0000-000000000230%'
  and pg_temp.lista(current_setting('t.re'), 3000) = '' and pg_temp.lista(current_setting('t.o'), 3000) like '%a9000000-0000-0000-0000-000000000235%');

select pg_temp.t('G1 estructura: las funciones nuevas no modifican ni borran notas, no conceden UPDATE, authenticated ejecuta pero anon no, y el guardián existe; las políticas de notas y citas no cambiaron',
  pg_get_functiondef('fn_completar_consulta_pendiente(uuid,jsonb,jsonb)'::regprocedure) !~* 'update\s+notas_clinicas|delete\s+from|do\s+update|update\s+citas'
  and pg_get_functiondef('fn_consultas_sin_nota(integer)'::regprocedure) !~* 'update |delete |insert '
  and has_function_privilege('authenticated', 'fn_completar_consulta_pendiente(uuid,jsonb,jsonb)', 'EXECUTE') and not has_function_privilege('anon', 'fn_completar_consulta_pendiente(uuid,jsonb,jsonb)', 'EXECUTE')
  and not has_table_privilege('authenticated', 'notas_clinicas', 'UPDATE') and exists (select 1 from pg_trigger where tgname = 'trg_bloquear_completar_cita_directo')
  and (select count(*) from pg_policies where tablename = 'notas_clinicas') = 4 and (select count(*) from pg_policies where tablename = 'citas') = 5);

do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO 090: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 150), ' | ') from _res where not ok); end if;
end $$;
rollback;
