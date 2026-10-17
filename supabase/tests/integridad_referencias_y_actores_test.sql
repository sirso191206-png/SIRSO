-- Migración 098: integridad de referencias entre clínicas y de autoría en el resto de tablas clínicas.
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


insert into sucursales (id, clinica_id, nombre) values ('f8000000-0000-0000-0000-0000000000a2','c8000000-0000-0000-0000-00000000000a','Sucursal A2'), ('f8000000-0000-0000-0000-0000000000b1','c8000000-0000-0000-0000-00000000000b','Sucursal B');
insert into consultorios (id, sucursal_id, nombre) values ('f9000000-0000-0000-0000-0000000000a2','f8000000-0000-0000-0000-0000000000a2','Consultorio A2'), ('f9000000-0000-0000-0000-0000000000b1','f8000000-0000-0000-0000-0000000000b1','Consultorio B');
select set_config('request.jwt.claims', '', true);
insert into tratamientos (id, paciente_id, descripcion, costo) values ('77000000-0000-0000-0000-0000000000a1','b8000000-0000-0000-0000-000000000001','Limpieza A',500), ('77000000-0000-0000-0000-0000000000a3','b8000000-0000-0000-0000-000000000003','Limpieza A3',500), ('77000000-0000-0000-0000-0000000000b1','b8000000-0000-0000-0000-00000000000b','Limpieza B',500);
create function pg_temp.dml(p_uid text, p_sql text) returns text language sql as $$ select pg_temp.como(p_uid::uuid, 'with x as (' || p_sql || ' returning 1) select count(*)::text from x') $$;
-- Como `dml`, pero SOLO fija la identidad de la sesión (no cambia de rol): prueba el disparador sin depender de las políticas de cada tabla.
create function pg_temp.sub(p_uid text, p_sql text) returns text language plpgsql as $$
declare v text; h text; m text;
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
  begin execute 'with x as (' || p_sql || ' returning 1) select count(*)::text from x' into v; perform set_config('request.jwt.claims', '', true); return v;
  exception when others then get stacked diagnostics h = pg_exception_hint, m = message_text; perform set_config('request.jwt.claims', '', true); return 'ERR|'||coalesce(nullif(h, ''), sqlstate)||'|'||m; end;
end $$;
-- ===== D: odontólogo de otra clínica =====
select set_config('t.d_ajeno', pg_temp.dml(current_setting('t.o'), format('update tratamientos set dentista_id = %L where id = ''77000000-0000-0000-0000-0000000000a1''', current_setting('t.ob'))), false);
select set_config('t.d_falso', pg_temp.dml(current_setting('t.o'), format('update tratamientos set dentista_id = %L where id = ''77000000-0000-0000-0000-0000000000a1''', gen_random_uuid())), false);
select set_config('t.d_rec', pg_temp.dml(current_setting('t.d'), format('insert into recetas (paciente_id, dentista_id) values (%L, %L)', 'b8000000-0000-0000-0000-000000000001', current_setting('t.ob'))), false);
select set_config('t.d_con', pg_temp.sub(current_setting('t.o'), format('insert into consentimientos_informados (paciente_id, procedimiento, dentista_id) values (%L, ''Extracción'', %L)', 'b8000000-0000-0000-0000-000000000001', current_setting('t.ob'))), false);
select set_config('t.d_ref', pg_temp.sub(current_setting('t.o'), format('insert into referencias_medicas (paciente_id, direccion, medico_nombre, dentista_id) values (%L, ''enviada'', ''Dr. X'', %L)', 'b8000000-0000-0000-0000-000000000001', current_setting('t.ob'))), false);
select pg_temp.t('D1 un odontólogo de OTRA clínica se rechaza (REFERENCIA_DENTISTA_INCOHERENTE) en tratamientos, recetas, consentimientos y referencias médicas',
  pg_temp.hint(current_setting('t.d_ajeno')) = 'REFERENCIA_DENTISTA_INCOHERENTE' and pg_temp.hint(current_setting('t.d_rec')) in ('REFERENCIA_DENTISTA_INCOHERENTE', 'FIRMANTE_INCOHERENTE')   -- en recetas, un odontólogo que firma como otro recibe FIRMANTE_INCOHERENTE (101); sigue rechazado
  and pg_temp.hint(current_setting('t.d_con')) in ('REFERENCIA_DENTISTA_INCOHERENTE', 'FIRMANTE_INCOHERENTE') and pg_temp.hint(current_setting('t.d_ref')) in ('REFERENCIA_DENTISTA_INCOHERENTE', 'FIRMANTE_INCOHERENTE')
  and not exists (select 1 from tratamientos where dentista_id = current_setting('t.ob')::uuid) and not exists (select 1 from recetas where dentista_id = current_setting('t.ob')::uuid));
select pg_temp.t('D2 SIN ORÁCULO: un odontólogo que no existe responde EXACTAMENTE igual que uno de otra clínica (código, hint y mensaje)', current_setting('t.d_falso') = current_setting('t.d_ajeno'));
select pg_temp.t('D3 lo legítimo sigue: un odontólogo de la MISMA clínica y un valor nulo se aceptan',
  pg_temp.dml(current_setting('t.o'), format('update tratamientos set dentista_id = %L where id = ''77000000-0000-0000-0000-0000000000a1''', current_setting('t.d'))) = '1'
  and pg_temp.dml(current_setting('t.o'), 'update tratamientos set dentista_id = null where id = ''77000000-0000-0000-0000-0000000000a1''') = '1'
  and pg_temp.dml(current_setting('t.d'), format('insert into recetas (paciente_id, dentista_id) values (%L, %L)', 'b8000000-0000-0000-0000-000000000001', current_setting('t.d'))) = '1');
-- ===== C: consultorio en las citas =====
select set_config('t.c1', pg_temp.dml(current_setting('t.o'), 'update citas set consultorio_id = ''f9000000-0000-0000-0000-0000000000b1'' where id = ''a9000000-0000-0000-0000-000000000002'''), false);
select set_config('t.c2', pg_temp.dml(current_setting('t.o'), format('update citas set consultorio_id = %L where id = ''a9000000-0000-0000-0000-000000000002''', gen_random_uuid())), false);
select pg_temp.t('C1 un consultorio de OTRA clínica se rechaza (CITA_CONSULTORIO_INCOHERENTE) y uno inexistente responde exactamente igual (sin oráculo)', pg_temp.hint(current_setting('t.c1')) = 'CITA_CONSULTORIO_INCOHERENTE' and current_setting('t.c1') = current_setting('t.c2')
  and not exists (select 1 from citas where consultorio_id = 'f9000000-0000-0000-0000-0000000000b1'));
select pg_temp.t('C2 el consultorio PROPIO de la clínica y el nulo se aceptan',
  pg_temp.dml(current_setting('t.o'), 'update citas set consultorio_id = ''f9000000-0000-0000-0000-0000000000a2'' where id = ''a9000000-0000-0000-0000-000000000002''') = '1'
  and pg_temp.dml(current_setting('t.o'), 'update citas set consultorio_id = null where id = ''a9000000-0000-0000-0000-000000000002''') = '1');
select set_config('request.jwt.claims', '', true);
set local session_replication_role = replica;
update citas set consultorio_id = 'f9000000-0000-0000-0000-0000000000b1' where id = 'a9000000-0000-0000-0000-000000000003';   -- dato LEGADO preparado saltando el guardián solo en esta sentencia
set local session_replication_role = origin;
select pg_temp.t('C3 una cita LEGADA que ya apunta a un consultorio ajeno se puede seguir gestionando (confirmar): el control solo actúa si se CAMBIA el consultorio, el odontólogo, el sillón o el paciente',
  pg_temp.dml(current_setting('t.o'), 'update citas set estado = ''confirmada'' where id = ''a9000000-0000-0000-0000-000000000003''') = '1');
-- ===== T: tratamiento de otro paciente o de otra clínica =====
select set_config('t.t_b', pg_temp.dml(current_setting('t.o'), 'insert into pagos (paciente_id, monto, metodo, tipo, tratamiento_id) values (''b8000000-0000-0000-0000-000000000001'', 10, ''efectivo'', ''pago'', ''77000000-0000-0000-0000-0000000000b1'')'), false);
select set_config('t.t_a3', pg_temp.dml(current_setting('t.o'), 'insert into pagos (paciente_id, monto, metodo, tipo, tratamiento_id) values (''b8000000-0000-0000-0000-000000000001'', 10, ''efectivo'', ''pago'', ''77000000-0000-0000-0000-0000000000a3'')'), false);
select set_config('t.t_falso', pg_temp.dml(current_setting('t.o'), format('insert into pagos (paciente_id, monto, metodo, tipo, tratamiento_id) values (%L, 10, ''efectivo'', ''pago'', %L)', 'b8000000-0000-0000-0000-000000000001', gen_random_uuid())), false);
select pg_temp.t('T1 un pago ligado al tratamiento de OTRO paciente de la misma clínica o de OTRA clínica se rechaza (REFERENCIA_TRATAMIENTO_INCOHERENTE) y un tratamiento inexistente responde exactamente igual (sin oráculo)',
  pg_temp.hint(current_setting('t.t_b')) = 'REFERENCIA_TRATAMIENTO_INCOHERENTE' and current_setting('t.t_b') = current_setting('t.t_a3') and current_setting('t.t_a3') = current_setting('t.t_falso')
  and not exists (select 1 from pagos where tratamiento_id in ('77000000-0000-0000-0000-0000000000b1', '77000000-0000-0000-0000-0000000000a3')));
select set_config('t.t_f', pg_temp.sub(current_setting('t.d'), 'insert into fotografias (paciente_id, url_storage, etiqueta, tratamiento_id) values (''b8000000-0000-0000-0000-000000000001'', ''x/f.jpg'', ''intraoral'', ''77000000-0000-0000-0000-0000000000b1'')'), false);
select set_config('t.t_c', pg_temp.sub(current_setting('t.o'), 'insert into consentimientos_informados (paciente_id, procedimiento, tratamiento_id) values (''b8000000-0000-0000-0000-000000000001'', ''Extracción'', ''77000000-0000-0000-0000-0000000000b1'')'), false);
select pg_temp.t('T2 lo mismo en fotografías y consentimientos', pg_temp.hint(current_setting('t.t_f')) = 'REFERENCIA_TRATAMIENTO_INCOHERENTE' and pg_temp.hint(current_setting('t.t_c')) = 'REFERENCIA_TRATAMIENTO_INCOHERENTE');
select pg_temp.t('T3 lo legítimo sigue: un pago ligado al tratamiento del MISMO paciente, y un pago sin tratamiento',
  pg_temp.dml(current_setting('t.o'), 'insert into pagos (paciente_id, monto, metodo, tipo, tratamiento_id) values (''b8000000-0000-0000-0000-000000000001'', 10, ''efectivo'', ''pago'', ''77000000-0000-0000-0000-0000000000a1'')') = '1'
  and pg_temp.dml(current_setting('t.o'), 'insert into pagos (paciente_id, monto, metodo, tipo) values (''b8000000-0000-0000-0000-000000000001'', 10, ''efectivo'', ''pago'')') = '1');
-- ===== A: autoría =====
select set_config('t.a_ajeno', pg_temp.dml(current_setting('t.re'), format('insert into pagos (paciente_id, monto, metodo, tipo, registrado_por) values (%L, 77, ''efectivo'', ''pago'', %L)', 'b8000000-0000-0000-0000-000000000001', current_setting('t.o'))), false);
select set_config('t.a_propio', pg_temp.dml(current_setting('t.re'), format('insert into pagos (paciente_id, monto, metodo, tipo, registrado_por) values (%L, 11, ''efectivo'', ''pago'', %L)', 'b8000000-0000-0000-0000-000000000001', current_setting('t.re'))), false);
select set_config('t.a_nulo', pg_temp.dml(current_setting('t.re'), format('insert into pagos (paciente_id, monto, metodo, tipo) values (%L, 12, ''efectivo'', ''pago'')', 'b8000000-0000-0000-0000-000000000001')), false);
select pg_temp.t('A1 AUTORÍA de un pago: registrar a nombre de OTRA persona se rechaza (ACTOR_INCOHERENTE); a nombre propio funciona; sin indicar, se rellena con quien lo registra',
  pg_temp.hint(current_setting('t.a_ajeno')) = 'ACTOR_INCOHERENTE' and current_setting('t.a_propio') = '1' and current_setting('t.a_nulo') = '1'
  and (select count(*) from pagos where monto = 77) = 0
  and (select registrado_por from pagos where monto = 12) = current_setting('t.re')::uuid and (select registrado_por from pagos where monto = 11) = current_setting('t.re')::uuid);
select set_config('t.a_sv', pg_temp.sub(current_setting('t.d'), format('insert into signos_vitales (paciente_id, registrado_por) values (%L, %L)', 'b8000000-0000-0000-0000-000000000001', current_setting('t.o'))), false);
select set_config('t.a_doc', pg_temp.sub(current_setting('t.d'), format('insert into documentos_clinicos (paciente_id, tipo, nombre, url_storage, subido_por) values (%L, ''documento'', ''d'', ''x/d.pdf'', %L)', 'b8000000-0000-0000-0000-000000000001', current_setting('t.o'))), false);
select set_config('t.a_foto', pg_temp.sub(current_setting('t.d'), format('insert into fotografias (paciente_id, url_storage, etiqueta, subido_por) values (%L, ''x/g.jpg'', ''intraoral'', %L)', 'b8000000-0000-0000-0000-000000000001', current_setting('t.o'))), false);
select pg_temp.t('A2 lo mismo en signos vitales, documentos y fotografías (quién registra o sube es la sesión)', pg_temp.hint(current_setting('t.a_sv')) = 'ACTOR_INCOHERENTE' and pg_temp.hint(current_setting('t.a_doc')) = 'ACTOR_INCOHERENTE' and pg_temp.hint(current_setting('t.a_foto')) = 'ACTOR_INCOHERENTE');
select set_config('t.a_ok', pg_temp.sub(current_setting('t.d'), format('insert into documentos_clinicos (paciente_id, tipo, nombre, url_storage, subido_por) values (%L, ''documento'', ''d2'', ''x/d2.pdf'', %L)', 'b8000000-0000-0000-0000-000000000001', current_setting('t.d'))), false);
select pg_temp.t('A3 subir un documento a nombre propio funciona', current_setting('t.a_ok') = '1');
select set_config('request.jwt.claims', '', true);
insert into pagos (paciente_id, monto, metodo, tipo, registrado_por) values ('b8000000-0000-0000-0000-000000000001', 99, 'efectivo', 'pago', current_setting('t.o')::uuid);
select pg_temp.t('A4 la operación administrativa (sin sesión de usuario: importaciones, mantenimiento) conserva su libertad: puede registrar a nombre de cualquiera', (select registrado_por = current_setting('t.o')::uuid from pagos where monto = 99));
set local session_replication_role = replica;
insert into tratamientos (id, paciente_id, descripcion, costo, dentista_id) values ('77000000-0000-0000-0000-0000000000a9', 'b8000000-0000-0000-0000-000000000001', 'Legado', 100, current_setting('t.ob')::uuid);   -- tratamiento LEGADO con odontólogo ajeno
set local session_replication_role = origin;
select pg_temp.t('A5 un tratamiento LEGADO con odontólogo ajeno se sigue gestionando: cambiar otro campo (la descripción) no dispara el control. (Un pago registrado ya NO se puede editar —solo anular— por una regla anterior, por eso no se usa aquí)',
  pg_temp.dml(current_setting('t.o'), 'update tratamientos set descripcion = ''Legado editado'' where id = ''77000000-0000-0000-0000-0000000000a9''') = '1');
select pg_temp.t('G1 las funciones nuevas no son invocables por usuarios, y los 12 disparadores nuevos existen; el de citas incluye consultorio_id',
  not has_function_privilege('authenticated', 'fn_validar_dentista_misma_clinica()', 'EXECUTE') and not has_function_privilege('anon', 'fn_validar_dentista_misma_clinica()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'fn_validar_tratamiento_mismo_paciente()', 'EXECUTE') and not has_function_privilege('authenticated', 'fn_validar_actor()', 'EXECUTE')
  and (select count(*) from pg_trigger where tgname in ('trg_ref_dentista', 'trg_ref_tratamiento', 'trg_actor_registro')) = 12
  and (select pg_get_triggerdef(oid) from pg_trigger where tgname = 'trg_validar_referencias_cita') like '%consultorio_id%');
do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO 098: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 100), ' | ') from _res where not ok); end if;
end $$;
rollback;
