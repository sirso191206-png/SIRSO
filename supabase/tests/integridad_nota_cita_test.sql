-- Migración 091: una nota solo se liga a una cita del MISMO paciente de su expediente; sin oráculo de existencia entre clínicas.
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


create function pg_temp.como_dueno() returns text language plpgsql as $$
declare h text; m text;
begin
  perform set_config('request.jwt.claims', '', true);   -- el PROPIETARIO DE LA BASE actúa sin sesión de usuario
  begin
    insert into notas_clinicas (expediente_id, cita_id, usuario_id, contenido, tipo) values ((select id from expedientes where paciente_id = 'b8000000-0000-0000-0000-000000000001'), 'a9000000-0000-0000-0000-00000000000b', current_setting('t.o')::uuid, 'x', 'consulta');
    return 'insertada';
  exception when others then get stacked diagnostics h = pg_exception_hint, m = message_text; return 'ERR|'||coalesce(nullif(h, ''), sqlstate)||'|'||m; end;
end $$;

create function pg_temp.ins_nota(p_uid text, p_pac text, p_cita text) returns text language sql as $$
  select pg_temp.como(p_uid::uuid, format('with i as (insert into notas_clinicas (expediente_id, cita_id, usuario_id, contenido, tipo) values (%L, %L, %L, ''x'', ''consulta'') returning 1) select count(*)::text from i',
    (select id from expedientes where paciente_id = p_pac::uuid), p_cita, p_uid)) $$;
create function pg_temp.notas_de(p_uid text) returns bigint language sql as $$ select count(*) from notas_clinicas where usuario_id = p_uid::uuid $$;
select set_config('t.a', pg_temp.ins_nota(current_setting('t.d'), 'b8000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000003'), false);   -- cita de OTRO paciente de la misma clínica (P3)
select set_config('t.b', pg_temp.ins_nota(current_setting('t.d'), 'b8000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-00000000000b'), false);   -- cita de OTRA CLÍNICA
select set_config('t.c', pg_temp.ins_nota(current_setting('t.d'), 'b8000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-0000000000ee'), false);   -- cita INEXISTENTE
select set_config('t.o1', pg_temp.ins_nota(current_setting('t.o'), 'b8000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-00000000000b'), false);   -- el PROPIETARIO tampoco
select pg_temp.t('I1 una nota de P1 ligada a la cita de OTRO paciente, de OTRA CLÍNICA, inexistente (o intentada por el propietario) se RECHAZA con NOTA_CITA_INCOHERENTE; no queda ninguna nota',
  pg_temp.hint(current_setting('t.a')) = 'NOTA_CITA_INCOHERENTE' and pg_temp.hint(current_setting('t.b')) = 'NOTA_CITA_INCOHERENTE' and pg_temp.hint(current_setting('t.c')) = 'NOTA_CITA_INCOHERENTE'
  and pg_temp.hint(current_setting('t.o1')) = 'NOTA_CITA_INCOHERENTE' and pg_temp.notas_de(current_setting('t.d')) = 0 and pg_temp.notas_de(current_setting('t.o')) = 0);
select pg_temp.t('I2 SIN ORÁCULO: «no existe», «es de otro paciente» y «es de otra clínica» dan EXACTAMENTE la misma respuesta (código, hint y mensaje): no se puede averiguar si un id de cita ajeno existe',
  current_setting('t.a') = current_setting('t.b') and current_setting('t.b') = current_setting('t.c') and current_setting('t.c') not like '%foreign key%' and current_setting('t.c') not like '%23503%');
select pg_temp.t('I3 lo legítimo sigue funcionando: una nota con la cita de SU paciente, y una nota sin cita',
  pg_temp.ins_nota(current_setting('t.d'), 'b8000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000001') = '1'
  and pg_temp.como(current_setting('t.d')::uuid, format('with i as (insert into notas_clinicas (expediente_id, usuario_id, contenido, tipo) values (%L, %L, ''sin cita'', ''consulta'') returning 1) select count(*)::text from i', (select id from expedientes where paciente_id = 'b8000000-0000-0000-0000-000000000001'), current_setting('t.d'))) = '1');
select pg_temp.t('I4 un dentista tampoco puede ligar la nota de SU paciente a la cita de un paciente suyo distinto (la coherencia es por paciente, no solo por clínica)',
  pg_temp.hint(pg_temp.ins_nota(current_setting('t.o'), 'b8000000-0000-0000-0000-000000000002', 'a9000000-0000-0000-0000-000000000001')) = 'NOTA_CITA_INCOHERENTE');
select pg_temp.t('I5 el guardián protege también a los flujos del servidor: fn_finalizar_consulta crea su nota sin problema (cita y expediente coinciden), y el propietario de la base tampoco puede crear una incoherente',
  (pg_temp.j(pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-00000000000c', 'x', jsonb_build_object('id', 'd1000000-0000-0000-0000-0000000000c1', 'contenido', 'ok')::text)) ->> 'ok') = 'true'
  and pg_temp.como_dueno() like 'ERR|NOTA_CITA_INCOHERENTE|%');
select pg_temp.t('I6 la función del guardián no es invocable por usuarios (solo actúa como trigger) y el trigger existe; las 4 políticas de notas no cambiaron',
  not has_function_privilege('authenticated', 'fn_validar_nota_cita()', 'EXECUTE') and not has_function_privilege('anon', 'fn_validar_nota_cita()', 'EXECUTE')
  and exists (select 1 from pg_trigger where tgname = 'trg_validar_nota_cita' and tgrelid = 'notas_clinicas'::regclass) and (select count(*) from pg_policies where tablename = 'notas_clinicas') = 4);

do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO 091: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 150), ' | ') from _res where not ok); end if;
end $$;
rollback;
