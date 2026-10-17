-- Migración 093: límite de retrofecha de las notas — configuración explícita, sin valor por omisión.
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


create function pg_temp.como_rol_admin_nota() returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  insert into notas_clinicas (expediente_id, usuario_id, contenido, tipo, creado_en) values ((select id from expedientes where paciente_id = 'b8000000-0000-0000-0000-000000000001'), current_setting('t.o')::uuid, 'import', 'consulta', now() - interval '5000 hours');
  return 'ok'; exception when others then return 'ERR|'||sqlstate||'|'||sqlerrm; end $$;

create function pg_temp.dml(p_uid text, p_sql text) returns text language sql as $$ select pg_temp.como(p_uid::uuid, 'with x as (' || p_sql || ' returning 1) select count(*)::text from x') $$;
create function pg_temp.nota_hace(p_uid text, p_horas text) returns text language sql as $$
  select pg_temp.dml(p_uid, format('insert into notas_clinicas (expediente_id, usuario_id, contenido, tipo, creado_en) values (%L, %L, ''x'', ''consulta'', now() - interval %L)', (select id from expedientes where paciente_id = 'b8000000-0000-0000-0000-000000000001'), p_uid, p_horas || ' hours')) $$;
create function pg_temp.cfg(p_valor text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  delete from plataforma_config where clave = 'nota_retrofecha_max_horas';
  if p_valor is not null then insert into plataforma_config (clave, valor) values ('nota_retrofecha_max_horas', p_valor); end if;
end $$;
create function pg_temp.hace(p_cita text, p_horas int) returns text language sql as $$
  select pg_temp.fin(current_setting('t.d'), p_cita, 'x', jsonb_build_object('id', md5(p_cita || p_horas)::uuid, 'contenido', 'ok', 'creado_en', (now() - make_interval(hours => p_horas))::text)::text) $$;

create function pg_temp.como_rol(p_rol text, p_uid uuid, p_sql text) returns text language plpgsql as $$
declare v text; h text; m text;
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', p_rol)::text end, true);
  execute format('set local role %I', p_rol);
  begin execute p_sql into v; reset role; return v;
  exception when others then get stacked diagnostics h = pg_exception_hint, m = message_text; reset role; return 'ERR|'||coalesce(nullif(h, ''), sqlstate)||'|'||m; end;
end $$;
select pg_temp.cfg(null);
select set_config('t.r1', pg_temp.nota_hace(current_setting('t.d'), '43800'), false);   -- 5 años
select pg_temp.t('R1 SIN configuración no hay límite (decisión del propietario del producto): una nota de hace 5 años (captura sin conexión) se guarda', current_setting('t.r1') = '1');
select pg_temp.cfg('48');
select set_config('t.r2a', pg_temp.nota_hace(current_setting('t.d'), '47'), false), set_config('t.r2b', pg_temp.nota_hace(current_setting('t.d'), '49'), false), set_config('t.r2c', pg_temp.nota_hace(current_setting('t.d'), '1'), false);
select pg_temp.t('R2 con 48 horas configuradas: 1 h y 47 h se aceptan; 49 h se RECHAZA con NOTA_FECHA_FUERA_DE_LIMITE (no se corrige en silencio) y el mensaje dice el límite',
  current_setting('t.r2a') = '1' and current_setting('t.r2c') = '1' and pg_temp.hint(current_setting('t.r2b')) = 'NOTA_FECHA_FUERA_DE_LIMITE' and pg_temp.msg(current_setting('t.r2b')) like '%48 horas%'
  and (select count(*) from notas_clinicas where creado_en < now() - interval '48 hours') = 1);   -- solo la de R1 (anterior a la configuración)
create function pg_temp.ignora(p_valor text) returns boolean language plpgsql as $$
begin perform pg_temp.cfg(p_valor); return pg_temp.nota_hace(current_setting('t.d'), '999') = '1'; end $$;
select pg_temp.t('R3 una configuración INVÁLIDA no bloquea nada (se ignora y no hay límite): abc, 0, -5, 1.5, vacío, "12 h", 7 cifras',
  pg_temp.ignora('abc') and pg_temp.ignora('0') and pg_temp.ignora('-5') and pg_temp.ignora('1.5') and pg_temp.ignora('') and pg_temp.ignora('12 h') and pg_temp.ignora('1234567'));
select pg_temp.cfg('48');
select set_config('t.r4', pg_temp.como_rol_admin_nota(), false);
select pg_temp.t('R4 la operación administrativa (sin sesión de usuario: importaciones, mantenimiento) NO está limitada', current_setting('t.r4') = 'ok');
select set_config('t.r5', pg_temp.dml(current_setting('t.d'), format('insert into notas_clinicas (expediente_id, usuario_id, contenido, tipo, creado_en) values (%L, %L, ''futura'', ''consulta'', now() + interval ''1 year'')', (select id from expedientes where paciente_id = 'b8000000-0000-0000-0000-000000000001'), current_setting('t.d'))), false);
select pg_temp.t('R5 la fecha FUTURA sigue acotándose a ahora con el límite activo', current_setting('t.r5') = '1' and (select max(creado_en) from notas_clinicas where contenido = 'futura') <= now());
select set_config('t.r6a', pg_temp.hace('a9000000-0000-0000-0000-000000000001', 72), false);
select pg_temp.t('R6 al FINALIZAR una consulta con una nota fuera del límite se revierte TODO: la cita NO queda completada y no queda ninguna nota (nunca una consulta completada sin nota)',
  pg_temp.hint(current_setting('t.r6a')) = 'NOTA_FECHA_FUERA_DE_LIMITE' and pg_temp.estado('a9000000-0000-0000-0000-000000000001') = 'en_consulta' and pg_temp.notas('a9000000-0000-0000-0000-000000000001') = 0);
select set_config('t.r7a', pg_temp.hace('a9000000-0000-0000-0000-000000000001', 24), false);
select pg_temp.t('R7 …y con una nota DENTRO del límite (24 h: sincronizada un día después) la finalización funciona y respeta la fecha original de la captura',
  (pg_temp.j(current_setting('t.r7a')) ->> 'ok') = 'true' and pg_temp.estado('a9000000-0000-0000-0000-000000000001') = 'completada'
  and (select creado_en from notas_clinicas where cita_id = 'a9000000-0000-0000-0000-000000000001') between now() - interval '25 hours' and now() - interval '23 hours');
select set_config('t.r8a', pg_temp.como(current_setting('t.o')::uuid, $q$with x as (insert into plataforma_config (clave, valor) values ('nota_retrofecha_max_horas', '999999') on conflict (clave) do update set valor = excluded.valor returning 1) select count(*)::text from x$q$), false);
select set_config('t.r8b', pg_temp.como(current_setting('t.d')::uuid, $q$with x as (update plataforma_config set valor = '999999' where clave = 'nota_retrofecha_max_horas' returning 1) select count(*)::text from x$q$), false);
select set_config('t.r8c', pg_temp.como_rol('anon', null, $q$with x as (update plataforma_config set valor = '999999' where clave = 'nota_retrofecha_max_horas' returning 1) select count(*)::text from x$q$), false);
select pg_temp.t('R8 un usuario NO puede cambiar el límite: ni el propietario (insert/upsert), ni el dentista (update), ni un anónimo; cada intento falla o no afecta a ninguna fila',
  (current_setting('t.r8a') like 'ERR|%' or current_setting('t.r8a') = '0') and (current_setting('t.r8b') like 'ERR|%' or current_setting('t.r8b') = '0') and (current_setting('t.r8c') like 'ERR|%' or current_setting('t.r8c') = '0'));
select pg_temp.t('R9 el valor configurado no cambió tras los intentos, y las funciones no son invocables por usuarios',
  (select valor from plataforma_config where clave = 'nota_retrofecha_max_horas') = '48'
  and not has_function_privilege('authenticated', 'fn_config_horas_positivas(text)', 'EXECUTE') and not has_function_privilege('anon', 'fn_config_horas_positivas(text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'fn_validar_autoria_nota()', 'EXECUTE'));
do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO 093: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 120), ' | ') from _res where not ok); end if;
end $$;
rollback;
