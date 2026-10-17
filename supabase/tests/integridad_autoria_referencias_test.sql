-- Migración 092: autoría de las notas, fecha futura y odontólogo/sillón de otra clínica en las citas.
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


create function pg_temp.como_rol_admin(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return 'ERR|'||sqlstate||'|'||sqlerrm; end $$;

insert into sucursales (id, clinica_id, nombre) values ('f8000000-0000-0000-0000-0000000000b1', 'c8000000-0000-0000-0000-00000000000b', 'Sucursal de B');
insert into consultorios (id, sucursal_id, nombre) values ('f9000000-0000-0000-0000-0000000000b1', 'f8000000-0000-0000-0000-0000000000b1', 'Consultorio B');
insert into sillones (id, consultorio_id, nombre) values ('fa000000-0000-0000-0000-0000000000b1', 'f9000000-0000-0000-0000-0000000000b1', 'Sillón de B');
create function pg_temp.dml(p_uid text, p_sql text) returns text language sql as $$ select pg_temp.como(p_uid::uuid, 'with x as (' || p_sql || ' returning 1) select count(*)::text from x') $$;
create function pg_temp.exp_pac(p_pac text) returns uuid language sql as $$ select id from expedientes where paciente_id = p_pac::uuid $$;
create function pg_temp.nota_aut(p_uid text, p_autor text, p_extra text default '') returns text language sql as $$
  select pg_temp.dml(p_uid, format('insert into notas_clinicas (expediente_id, usuario_id, contenido, tipo%s) values (%L, %L, ''x'', ''consulta''%s)', case when p_extra = '' then '' else ', creado_en' end, pg_temp.exp_pac('b8000000-0000-0000-0000-000000000001'), p_autor, case when p_extra = '' then '' else ', ' || p_extra end)) $$;

-- ===== A: autoría de las notas =====
select set_config('t.a1', pg_temp.nota_aut(current_setting('t.d'), current_setting('t.o')), false), set_config('t.a2', pg_temp.nota_aut(current_setting('t.o'), current_setting('t.d')), false);
select pg_temp.t('A1 el AUTOR de una nota es quien la guarda: un dentista no puede firmar una nota como el propietario ni el propietario como el dentista (NOTA_AUTOR_INCOHERENTE); no queda ninguna nota',
  pg_temp.hint(current_setting('t.a1')) = 'NOTA_AUTOR_INCOHERENTE' and pg_temp.hint(current_setting('t.a2')) = 'NOTA_AUTOR_INCOHERENTE' and (select count(*) from notas_clinicas) = 0);
select set_config('t.a3', pg_temp.nota_aut(current_setting('t.d'), current_setting('t.d')), false),
       set_config('t.a4', pg_temp.dml(current_setting('t.d'), format('insert into notas_clinicas (expediente_id, contenido, tipo) values (%L, ''sin autor'', ''consulta'')', pg_temp.exp_pac('b8000000-0000-0000-0000-000000000001'))), false);
select pg_temp.t('A2 la nota propia sí se guarda; sin usuario_id se rellena con quien la guarda (nunca queda sin autor)',
  current_setting('t.a3') = '1' and current_setting('t.a4') = '1' and (select count(*) from notas_clinicas where contenido = 'sin autor' and usuario_id = current_setting('t.d')::uuid) = 1);
select set_config('request.jwt.claims', '', true);  -- contexto de OPERACIÓN ADMINISTRATIVA: sin sub (como service_role en Supabase); como() deja las claims fijadas hasta el final de la transacción
select set_config('t.a5', pg_temp.como_rol_admin(format('insert into notas_clinicas (expediente_id, usuario_id, contenido, tipo) values (%L, %L, ''admin'', ''consulta'')', pg_temp.exp_pac('b8000000-0000-0000-0000-000000000001'), current_setting('t.o'))), false);
select pg_temp.t('A3 la operación administrativa (sin sesión de usuario) conserva su libertad: puede registrar una nota a nombre de cualquiera (p. ej. importaciones)',
  current_setting('t.a5') = 'ok' and exists (select 1 from notas_clinicas where contenido = 'admin' and usuario_id = current_setting('t.o')::uuid));
-- ===== B: fecha =====
select set_config('t.b1', pg_temp.nota_aut(current_setting('t.d'), current_setting('t.d'), 'now() + interval ''1 year'''), false), set_config('t.b2', pg_temp.nota_aut(current_setting('t.d'), current_setting('t.d'), 'timestamptz ''2031-01-01 10:00+00'' - interval ''10 years'''), false);
select pg_temp.t('B1 una nota con fecha FUTURA se acota a ahora (nunca queda en el futuro); una fecha pasada (captura sin conexión) se conserva',
  current_setting('t.b1') = '1' and current_setting('t.b2') = '1' and (select max(creado_en) from notas_clinicas) <= now() and exists (select 1 from notas_clinicas where creado_en = timestamptz '2021-01-01 10:00+00'));
-- ===== C: referencias entre clínicas en las citas =====
select set_config('t.c1', pg_temp.dml(current_setting('t.o'), format('update citas set dentista_id = %L where id = %L', current_setting('t.ob'), 'a9000000-0000-0000-0000-000000000002')), false);
select set_config('t.c2', pg_temp.dml(current_setting('t.o'), format('insert into citas (paciente_id, dentista_id, inicio, fin, estado) values (''b8000000-0000-0000-0000-000000000001'', %L, ''2036-01-01 09:00+00'', ''2036-01-01 09:30+00'', ''agendada'')', current_setting('t.ob'))), false);
select set_config('t.c3', pg_temp.dml(current_setting('t.o'), format('insert into citas (paciente_id, dentista_id, inicio, fin, estado) values (''b8000000-0000-0000-0000-000000000001'', %L, ''2036-01-01 09:00+00'', ''2036-01-01 09:30+00'', ''agendada'')', gen_random_uuid())), false);
select pg_temp.t('C1 una cita NO puede apuntar a un odontólogo de OTRA clínica (CITA_DENTISTA_INCOHERENTE), ni al actualizarla ni al crearla; así una clínica no puede ocupar la agenda de otra',
  pg_temp.hint(current_setting('t.c1')) = 'CITA_DENTISTA_INCOHERENTE' and pg_temp.hint(current_setting('t.c2')) = 'CITA_DENTISTA_INCOHERENTE'
  and not exists (select 1 from citas where dentista_id = current_setting('t.ob')::uuid));
select pg_temp.t('C2 SIN ORÁCULO: un odontólogo que no existe responde EXACTAMENTE igual que uno de otra clínica; y no se revela la agenda ajena (no hay error de traslape)',
  current_setting('t.c3') = current_setting('t.c2') and current_setting('t.c2') not like '%traslape%' and current_setting('t.c2') not like '%exclusion%');
select set_config('t.c4', pg_temp.dml(current_setting('t.o'), 'update citas set sillon_id = ''fa000000-0000-0000-0000-0000000000b1'' where id = ''a9000000-0000-0000-0000-000000000002'''), false);
select pg_temp.t('C3 una cita tampoco puede usar el SILLÓN de otra clínica (CITA_SILLON_INCOHERENTE)', pg_temp.hint(current_setting('t.c4')) = 'CITA_SILLON_INCOHERENTE' and not exists (select 1 from citas where sillon_id = 'fa000000-0000-0000-0000-0000000000b1'));
select pg_temp.t('C4 lo legítimo sigue: un odontólogo de la misma clínica, sin odontólogo asignado y el propio sillón de la clínica (si existe) funcionan',
  pg_temp.dml(current_setting('t.o'), format('update citas set dentista_id = %L where id = %L', current_setting('t.d2'), 'a9000000-0000-0000-0000-000000000002')) = '1'
  and pg_temp.dml(current_setting('t.o'), 'insert into citas (paciente_id, inicio, fin, estado) values (''b8000000-0000-0000-0000-000000000001'', ''2036-02-01 09:00+00'', ''2036-02-01 09:30+00'', ''agendada'')') = '1');
-- datos LEGADOS: una cita que ya apunta a otra clínica no bloquea el resto de sus cambios (el trigger solo actúa al cambiar esos campos)
select set_config('request.jwt.claims', '', true);  -- contexto de OPERACIÓN ADMINISTRATIVA: sin sub (como service_role en Supabase); como() deja las claims fijadas hasta el final de la transacción
set local session_replication_role = replica;   -- dato LEGADO preparado saltando el guardián solo durante esta sentencia
update citas set dentista_id = current_setting('t.ob')::uuid where id = 'a9000000-0000-0000-0000-000000000003';
set local session_replication_role = origin;
select pg_temp.t('C5 una cita LEGADA con odontólogo ajeno se puede seguir gestionando (confirmar, cancelar): el control solo actúa si se cambia el odontólogo o el paciente',
  pg_temp.dml(current_setting('t.o'), 'update citas set estado = ''confirmada'' where id = ''a9000000-0000-0000-0000-000000000003''') = '1');
select pg_temp.t('G1 las funciones de trigger nuevas no son invocables por usuarios, y existen los triggers',
  not has_function_privilege('authenticated', 'fn_validar_autoria_nota()', 'EXECUTE') and not has_function_privilege('anon', 'fn_validar_autoria_nota()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'fn_validar_referencias_cita()', 'EXECUTE') and not has_function_privilege('anon', 'fn_validar_referencias_cita()', 'EXECUTE')
  and exists (select 1 from pg_trigger where tgname = 'trg_validar_autoria_nota') and exists (select 1 from pg_trigger where tgname = 'trg_validar_referencias_cita'));

do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO 092: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 120), ' | ') from _res where not ok); end if;
end $$;
rollback;
