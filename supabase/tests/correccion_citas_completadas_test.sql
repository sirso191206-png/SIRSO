-- Migración 094: corrección de citas COMPLETADAS con motivo, por rol y con auditoría completa.
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
create function pg_temp.corrige(p_uid text, p_cita text, p_estado text, p_motivo text) returns text language sql as $$
  select pg_temp.como(p_uid::uuid, format('select fn_corregir_estado_cita(%L::uuid, %L, %L)::text', p_cita, p_estado, p_motivo)) $$;
create function pg_temp.hash_nota(p_cita text) returns text language sql as $$ select coalesce(string_agg(md5(n.id::text || n.contenido || coalesce(n.diagnostico,'') || n.creado_en::text), ',' order by n.creado_en, n.id), '') from notas_clinicas n where n.cita_id = p_cita::uuid $$;
insert into pagos (paciente_id, monto, metodo, tipo) values ('b8000000-0000-0000-0000-000000000001', 100, 'efectivo', 'pago');
select set_config('t.f', pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000001', 'x', jsonb_build_object('id','d1000000-0000-0000-0000-0000000000f1','contenido','Primera nota','diagnostico','Caries')::text), false);
select set_config('t.h0', pg_temp.hash_nota('a9000000-0000-0000-0000-000000000001'), false), set_config('t.pagos0', (select count(*)::text from pagos), false);
select set_config('t.x1', pg_temp.dml(current_setting('t.o'), 'update citas set estado=''cancelada'' where id=''a9000000-0000-0000-0000-000000000001'''), false), set_config('t.x2', pg_temp.dml(current_setting('t.re'), 'update citas set estado=''no_asistio'' where id=''a9000000-0000-0000-0000-000000000001'''), false), set_config('t.x3', pg_temp.dml(current_setting('t.d'), 'update citas set estado=''agendada'' where id=''a9000000-0000-0000-0000-000000000001'''), false);
select pg_temp.t('C1 el cambio DIRECTO de estado de una cita completada (propietario, recepción o el dentista asignado) se rechaza con CORREGIR_ESTADO_REQUIERE_MOTIVO; sigue completada con su nota',
  pg_temp.hint(current_setting('t.x1')) = 'CORREGIR_ESTADO_REQUIERE_MOTIVO' and pg_temp.hint(current_setting('t.x2')) = 'CORREGIR_ESTADO_REQUIERE_MOTIVO' and pg_temp.hint(current_setting('t.x3')) = 'CORREGIR_ESTADO_REQUIERE_MOTIVO'
  and pg_temp.estado('a9000000-0000-0000-0000-000000000001') = 'completada' and pg_temp.notas('a9000000-0000-0000-0000-000000000001') = 1);
select pg_temp.t('C2 cancelar o registrar inasistencia ANTES de completar no cambia: recepción cancela una cita en consulta y el propietario marca no asistió a otra; no se crea ninguna nota',
  pg_temp.dml(current_setting('t.re'), 'update citas set estado=''cancelada'' where id=''a9000000-0000-0000-0000-000000000003''') = '1' and pg_temp.dml(current_setting('t.o'), 'update citas set estado=''no_asistio'' where id=''a9000000-0000-0000-0000-000000000005''') = '1'
  and pg_temp.notas('a9000000-0000-0000-0000-000000000003') = 0 and pg_temp.notas('a9000000-0000-0000-0000-000000000005') = 0);
select set_config('t.m1', pg_temp.corrige(current_setting('t.re'), 'a9000000-0000-0000-0000-000000000001', 'cancelada', 'Cita registrada por error de captura'), false), set_config('t.m2', pg_temp.corrige(current_setting('t.as'), 'a9000000-0000-0000-0000-000000000001', 'agendada', 'Cita registrada por error de captura'), false),
       set_config('t.m3', pg_temp.corrige(current_setting('t.d2'), 'a9000000-0000-0000-0000-000000000001', 'agendada', 'Cita registrada por error de captura'), false), set_config('t.m4', pg_temp.corrige(current_setting('t.ob'), 'a9000000-0000-0000-0000-000000000001', 'cancelada', 'Cita registrada por error de captura'), false),
       set_config('t.m5', pg_temp.corrige(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000001', 'cancelada', 'Cita registrada por error de captura'), false), set_config('t.m6', pg_temp.corrige(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000001', 'no_asistio', 'Cita registrada por error de captura'), false);
select pg_temp.t('C3 MATRIZ: recepción y asistente → ROL_NO_PERMITIDO; un dentista que NO es el responsable → CITA_DE_OTRO_DENTISTA; el propietario de OTRA clínica → CITA_NO_ENCONTRADA; el dentista responsable no puede cancelar ni marcar inasistencia (ESTADO_NO_PERMITIDO_PARA_ROL); nada cambia',
  pg_temp.hint(current_setting('t.m1')) = 'ROL_NO_PERMITIDO' and pg_temp.hint(current_setting('t.m2')) = 'ROL_NO_PERMITIDO' and pg_temp.hint(current_setting('t.m3')) = 'CITA_DE_OTRO_DENTISTA' and pg_temp.hint(current_setting('t.m4')) = 'CITA_NO_ENCONTRADA'
  and pg_temp.hint(current_setting('t.m5')) = 'ESTADO_NO_PERMITIDO_PARA_ROL' and pg_temp.hint(current_setting('t.m6')) = 'ESTADO_NO_PERMITIDO_PARA_ROL' and pg_temp.estado('a9000000-0000-0000-0000-000000000001') = 'completada' and pg_temp.hash_nota('a9000000-0000-0000-0000-000000000001') = current_setting('t.h0'));
select pg_temp.t('C4 entradas inválidas: motivo vacío, corto o de 501 caracteres → MOTIVO_REQUERIDO; estado «completada», «confirmada» o nulo → ESTADO_NO_PERMITIDO; una cita que NO está completada → CITA_NO_COMPLETADA',
  pg_temp.hint(pg_temp.corrige(current_setting('t.o'), 'a9000000-0000-0000-0000-000000000001', 'cancelada', '')) = 'MOTIVO_REQUERIDO' and pg_temp.hint(pg_temp.corrige(current_setting('t.o'), 'a9000000-0000-0000-0000-000000000001', 'cancelada', '   corto  ')) = 'MOTIVO_REQUERIDO'
  and pg_temp.hint(pg_temp.corrige(current_setting('t.o'), 'a9000000-0000-0000-0000-000000000001', 'cancelada', repeat('x', 501))) = 'MOTIVO_REQUERIDO'
  and pg_temp.hint(pg_temp.corrige(current_setting('t.o'), 'a9000000-0000-0000-0000-000000000001', 'completada', 'Motivo suficiente para corregir')) = 'ESTADO_NO_PERMITIDO' and pg_temp.hint(pg_temp.corrige(current_setting('t.o'), 'a9000000-0000-0000-0000-000000000001', 'confirmada', 'Motivo suficiente para corregir')) = 'ESTADO_NO_PERMITIDO'
  and pg_temp.hint(pg_temp.como(current_setting('t.o')::uuid, format('select fn_corregir_estado_cita(%L::uuid, null, %L)::text', 'a9000000-0000-0000-0000-000000000001', 'Motivo suficiente para corregir'))) = 'ESTADO_NO_PERMITIDO'
  and pg_temp.hint(pg_temp.corrige(current_setting('t.o'), 'a9000000-0000-0000-0000-000000000004', 'cancelada', 'Motivo suficiente para corregir')) = 'CITA_NO_COMPLETADA' and pg_temp.estado('a9000000-0000-0000-0000-000000000001') = 'completada');
select set_config('t.n0', (select count(*) from auditoria where accion = 'corregir_estado_cita')::text, false);
select set_config('t.ok', pg_temp.corrige(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000001', 'agendada', 'Se finalizó por error: era otro paciente'), false);
select pg_temp.t('C5 el odontólogo RESPONSABLE reabre su consulta con motivo: la cita vuelve a agendada, la nota NO se toca (mismo contenido y fecha), los pagos no cambian y la auditoría guarda ACTOR, ROL, FECHA, estado ANTERIOR, estado NUEVO, MOTIVO y notas ligadas',
  (pg_temp.j(current_setting('t.ok')) ->> 'ok') = 'true' and pg_temp.estado('a9000000-0000-0000-0000-000000000001') = 'agendada' and pg_temp.hash_nota('a9000000-0000-0000-0000-000000000001') = current_setting('t.h0') and (select count(*)::text from pagos) = current_setting('t.pagos0')
  and (select count(*) from auditoria where accion = 'corregir_estado_cita') = current_setting('t.n0')::int + 1
  and exists (select 1 from auditoria a where a.accion = 'corregir_estado_cita' and a.entidad_id = 'a9000000-0000-0000-0000-000000000001' and a.usuario_id = current_setting('t.d')::uuid and a.detalle ->> 'rol' = 'dentista' and a.detalle ->> 'antes' = 'completada' and a.detalle ->> 'despues' = 'agendada'
              and a.detalle ->> 'motivo' = 'Se finalizó por error: era otro paciente' and (a.detalle ->> 'notas_ligadas')::int = 1 and a.creado_en is not null)
  and exists (select 1 from auditoria a where a.accion = 'editar_citas' and a.entidad_id = 'a9000000-0000-0000-0000-000000000001' and a.detalle ->> 'estado' = 'agendada'));
select pg_temp.t('C6 doble clic o reintento: repetir la corrección NO duplica la auditoría (CITA_NO_COMPLETADA: ya se corrigió)',
  pg_temp.hint(pg_temp.corrige(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000001', 'agendada', 'Se finalizó por error: era otro paciente')) = 'CITA_NO_COMPLETADA' and (select count(*) from auditoria where accion = 'corregir_estado_cita') = current_setting('t.n0')::int + 1);
select set_config('t.i1', pg_temp.dml(current_setting('t.d'), 'update citas set estado=''en_consulta'' where id=''a9000000-0000-0000-0000-000000000001'''), false);
select set_config('t.f2', pg_temp.fin(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000001', 'x', jsonb_build_object('id','d1000000-0000-0000-0000-0000000000f2','contenido','Nota adicional tras reabrir','diagnostico','Control')::text), false);
select pg_temp.t('C7 reabrir y finalizar de nuevo: la cita vuelve a completada con una nota ADICIONAL; la PRIMERA queda intacta (las notas son inmutables) y ambas permanecen ligadas a la misma cita; nada se sobrescribe',
  current_setting('t.i1') = '1' and (pg_temp.j(current_setting('t.f2')) ->> 'ok') = 'true' and pg_temp.estado('a9000000-0000-0000-0000-000000000001') = 'completada' and pg_temp.notas('a9000000-0000-0000-0000-000000000001') = 2
  and (select contenido from notas_clinicas where id = 'd1000000-0000-0000-0000-0000000000f1') = 'Primera nota' and pg_temp.hash_nota('a9000000-0000-0000-0000-000000000001') like current_setting('t.h0') || ',%');
select set_config('t.n1', (select count(*) from auditoria where accion = 'corregir_estado_cita')::text, false);
select set_config('t.o1', pg_temp.corrige(current_setting('t.o'), 'a9000000-0000-0000-0000-000000000001', 'cancelada', 'Paciente atendido por error en esta cita'), false);
select pg_temp.t('C8 el propietario puede corregir cualquiera de los tres destinos con motivo; la auditoría registra su rol y que hay 2 notas; ninguna nota se borra ni cambia y los pagos siguen igual',
  (pg_temp.j(current_setting('t.o1')) ->> 'ok') = 'true' and pg_temp.estado('a9000000-0000-0000-0000-000000000001') = 'cancelada' and pg_temp.notas('a9000000-0000-0000-0000-000000000001') = 2 and (select count(*)::text from pagos) = current_setting('t.pagos0')
  and exists (select 1 from auditoria a where a.accion = 'corregir_estado_cita' and a.usuario_id = current_setting('t.o')::uuid and a.detalle ->> 'rol' = 'owner' and (a.detalle ->> 'notas_ligadas')::int = 2 and a.detalle ->> 'despues' = 'cancelada')
  and (select count(*) from auditoria where accion = 'corregir_estado_cita') = current_setting('t.n1')::int + 1);
select set_config('t.s0', (select count(*) from auditoria where accion = 'corregir_estado_cita')::text, false);
update plataforma_config set valor = 'on' where clave = 'control_sesiones_estricto';
select set_config('t.s1', pg_temp.como(current_setting('t.o')::uuid, format('select fn_corregir_estado_cita(%L::uuid, %L, %L)::text', 'a9000000-0000-0000-0000-000000000001', 'agendada', 'Motivo suficiente para corregir'), jsonb_build_object('session_id', 'aaaaaaaa-0000-0000-0000-000000000001')), false);
update plataforma_config set valor = 'off' where clave = 'control_sesiones_estricto';
select pg_temp.t('C9 una sesión revocada no puede corregir (SESION_CERRADA)', pg_temp.hint(current_setting('t.s1')) = 'SESION_CERRADA');
select set_config('request.jwt.claims', '', true);
update citas set estado = 'agendada' where id = 'a9000000-0000-0000-0000-000000000001';
select pg_temp.t('C10 la operación administrativa (sin sesión de usuario) conserva su libertad; y la función no es invocable por anónimos ni el disparador por usuarios',
  pg_temp.estado('a9000000-0000-0000-0000-000000000001') = 'agendada' and not has_function_privilege('anon', 'fn_corregir_estado_cita(uuid,text,text)', 'EXECUTE') and has_function_privilege('authenticated', 'fn_corregir_estado_cita(uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'fn_proteger_cita_completada()', 'EXECUTE') and exists (select 1 from pg_trigger where tgname = 'trg_proteger_cita_completada')
  and (select count(*) from auditoria where accion = 'corregir_estado_cita')::text = current_setting('t.s0'));
select set_config('request.jwt.claims', '', true);
update citas set estado = 'completada' where id = 'a9000000-0000-0000-0000-000000000004';   -- cita de una SUCURSAL a la que el dentista D no pertenece (preparación como administrador)
select set_config('t.suc1', pg_temp.corrige(current_setting('t.d'), 'a9000000-0000-0000-0000-000000000004', 'agendada', 'Se finalizó por error: era otro paciente'), false);
select set_config('t.suc2', pg_temp.corrige(current_setting('t.o'), 'a9000000-0000-0000-0000-000000000004', 'agendada', 'Se finalizó por error: era otro paciente'), false);
select pg_temp.t('C11 SUCURSAL: un odontólogo no puede corregir una consulta de una sucursal a la que no pertenece (SUCURSAL_NO_PERMITIDA) y la cita no cambia; el propietario, con acceso a todas, sí puede',
  pg_temp.hint(current_setting('t.suc1')) = 'SUCURSAL_NO_PERMITIDA' and (pg_temp.j(current_setting('t.suc2')) ->> 'ok') = 'true' and pg_temp.estado('a9000000-0000-0000-0000-000000000004') = 'agendada');
do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO 094: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 120), ' | ') from _res where not ok); end if;
end $$;
rollback;
