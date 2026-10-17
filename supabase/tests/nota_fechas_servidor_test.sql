-- Migración 097: fecha del evento, lo que dijo el dispositivo y fecha de recepción en el servidor.
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
create function pg_temp.como_rol(p_rol text, p_uid uuid, p_sql text) returns text language plpgsql as $$
declare v text; h text; m text;
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', p_rol)::text end, true);
  execute format('set local role %I', p_rol);
  begin execute p_sql into v; reset role; return v;
  exception when others then get stacked diagnostics h = pg_exception_hint, m = message_text; reset role; return 'ERR|'||coalesce(nullif(h, ''), sqlstate)||'|'||m; end;
end $$;

create function pg_temp.nota_f(p_uid text, p_cols text, p_vals text) returns text language sql as $$
  select pg_temp.dml(p_uid, format('insert into notas_clinicas (expediente_id, usuario_id, contenido, tipo%s) values (%L, %L, ''x'', ''consulta''%s)', case when p_cols = '' then '' else ', ' || p_cols end, (select id from expedientes where paciente_id = 'b8000000-0000-0000-0000-000000000001'), p_uid, case when p_vals = '' then '' else ', ' || p_vals end)) $$;
create function pg_temp.limpia() returns void language plpgsql as $$ begin perform set_config('request.jwt.claims', '', true); delete from notas_clinicas; end $$;
select set_config('t.a', pg_temp.nota_f(current_setting('t.d'), '', ''), false);
select pg_temp.t('F1 sin fecha explícita: creado_en_cliente queda NULL (no hay nada que conservar) y la RECEPCIÓN la fija el servidor',
  current_setting('t.a') = '1' and (select creado_en_cliente is null and recibida_en = now() and creado_en = now() from notas_clinicas where usuario_id = current_setting('t.d')::uuid));
select pg_temp.limpia();
select set_config('t.b', pg_temp.nota_f(current_setting('t.d'), 'creado_en', 'now() - interval ''30 hours'''), false);
select pg_temp.t('F2 captura SIN CONEXIÓN (hace 30 h): el evento conserva su fecha, el dispositivo queda registrado y la recepción es de AHORA; nada se «corrige» en silencio',
  current_setting('t.b') = '1' and (select creado_en = creado_en_cliente and creado_en < now() - interval '29 hours' and recibida_en = now() from notas_clinicas));
select pg_temp.limpia();
select set_config('t.c', pg_temp.nota_f(current_setting('t.d'), 'creado_en', 'now() + interval ''2 hours'''), false);
select pg_temp.t('F3 RELOJ ADELANTADO (+2 h): la fecha del evento se acota a ahora (no queda en el futuro) pero lo que dijo el dispositivo SE CONSERVA en creado_en_cliente; la nota se guarda',
  current_setting('t.c') = '1' and (select creado_en <= now() and creado_en_cliente > now() + interval '1 hour 59 minutes' and creado_en_cliente < now() + interval '2 hours 1 minute' from notas_clinicas));
select pg_temp.limpia();
select set_config('t.res_f4', pg_temp.nota_f(current_setting('t.d'), 'recibida_en', 'now() - interval ''10 days'''), false);
select pg_temp.t('F4 un usuario NO puede elegir la fecha de recepción: el valor enviado se ignora y queda la del servidor',
  current_setting('t.res_f4') = '1' and (select recibida_en = now() from notas_clinicas));
select pg_temp.limpia();
select set_config('request.jwt.claims', '', true);
insert into notas_clinicas (expediente_id, usuario_id, contenido, tipo, recibida_en) values ((select id from expedientes where paciente_id = 'b8000000-0000-0000-0000-000000000001'), current_setting('t.o')::uuid, 'import 1', 'consulta', timestamptz '2024-01-05 10:00+00');
insert into notas_clinicas (expediente_id, usuario_id, contenido, tipo) values ((select id from expedientes where paciente_id = 'b8000000-0000-0000-0000-000000000001'), current_setting('t.o')::uuid, 'import 2', 'consulta');
select pg_temp.t('F5 la operación administrativa (importaciones) puede conservar una fecha de recepción propia; sin ella queda la del servidor',
  (select recibida_en = timestamptz '2024-01-05 10:00+00' from notas_clinicas where contenido = 'import 1') and (select recibida_en = now() from notas_clinicas where contenido = 'import 2'));
select pg_temp.t('F6 las notas ANTERIORES a esta migración no inventan un dato histórico: las columnas admiten NULL (recibida_en = «anterior a la 097»)',
  (select is_nullable = 'YES' from information_schema.columns where table_name = 'notas_clinicas' and column_name = 'recibida_en') and (select is_nullable = 'YES' from information_schema.columns where table_name = 'notas_clinicas' and column_name = 'creado_en_cliente'));
select pg_temp.limpia();
select set_config('request.jwt.claims', '', true); delete from plataforma_config where clave = 'nota_retrofecha_max_horas'; insert into plataforma_config (clave, valor) values ('nota_retrofecha_max_horas', '48');
select set_config('t.g1', pg_temp.nota_f(current_setting('t.d'), 'creado_en', 'now() - interval ''72 hours'''), false);
select set_config('t.g2', pg_temp.nota_f(current_setting('t.d'), 'creado_en', 'now() + interval ''3 hours'''), false);
select pg_temp.t('F7 con límite de retrofecha configurado (48 h): una nota de hace 72 h se rechaza con NOTA_FECHA_FUERA_DE_LIMITE (no se corrige), y un RELOJ ADELANTADO no se rechaza injustamente: se acota y se guarda',
  pg_temp.hint(current_setting('t.g1')) = 'NOTA_FECHA_FUERA_DE_LIMITE' and current_setting('t.g2') = '1' and (select count(*) from notas_clinicas) = 1);
select set_config('t.h', pg_temp.como(current_setting('t.d')::uuid, 'update notas_clinicas set recibida_en = now() - interval ''1 year'''), false);
select pg_temp.t('F8 las notas siguen siendo inmutables: un usuario no puede modificar la fecha de recepción ni ninguna otra columna (sin privilegio UPDATE)', current_setting('t.h') like 'ERR|%');
select set_config('request.jwt.claims', '', true); delete from plataforma_config where clave = 'nota_retrofecha_max_horas'; delete from notas_clinicas;
select set_config('t.fin', pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000001', 'x', jsonb_build_object('id','d1000000-0000-0000-0000-0000000000a1','contenido','ok','creado_en',(now() - interval '30 hours')::text)::text), false);
select pg_temp.t('F9 al FINALIZAR una consulta con una nota capturada sin conexión, la nota conserva su fecha del evento, lo que dijo el dispositivo y la recepción del servidor',
  (pg_temp.j(current_setting('t.fin')) ->> 'ok') = 'true' and (select creado_en = creado_en_cliente and creado_en < now() - interval '29 hours' and recibida_en = now() from notas_clinicas where id = 'd1000000-0000-0000-0000-0000000000a1'));
do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO 097: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 120), ' | ') from _res where not ok); end if;
end $$;
rollback;
