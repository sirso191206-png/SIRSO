-- Migración 104: política de conservación por categoría, retención legal y supresión autorizada.
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


create function pg_temp.ej(p_sql text) returns text language plpgsql as $$
declare h text; m text; v text;
begin begin if p_sql ~* '^\s*(insert|update|delete)' then execute p_sql; return 'ok'; end if; execute p_sql into v; return coalesce('ok:' || v, 'ok'); exception when others then get stacked diagnostics h = pg_exception_hint, m = message_text; return 'ERR|' || coalesce(nullif(h, ''), sqlstate) || '|' || m; end; end $$;
create function pg_temp.con_sesion(p_uid text, p_sql text) returns text language plpgsql as $$
declare r text; begin perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true); r := pg_temp.ej(p_sql); perform set_config('request.jwt.claims', '', true); return r; end $$;
-- ===== estructura inicial (antes de cualquier decisión) =====
select pg_temp.t('K1 el modelo trae las 9 categorías, TODAS con estado PENDIENTE_DE_ABOGADO, ninguna con eliminación automática, y SIN plazo definido (no se inventa ninguno); solo el expediente clínico tiene un piso de 5 años',
  (select count(*) from politicas_conservacion) = 9 and (select count(*) from politicas_conservacion where estado_aprobacion = 'PENDIENTE_DE_ABOGADO' and not eliminacion_automatica and plazo_anios is null) = 9
  and (select plazo_minimo_anios from politicas_conservacion where categoria = 'expediente_clinico') = 5 and (select count(*) from politicas_conservacion where plazo_minimo_anios is not null) = 1
  and (select evento_inicio from politicas_conservacion where categoria = 'expediente_clinico') = 'ultimo_acto_medico');
select pg_temp.t('K2 ni anon ni authenticated tienen NINGÚN privilegio sobre las tres tablas, ni pueden ejecutar las funciones de gestión; solo service_role ejecuta la supresión, las retenciones y el cambio de plazos',
  not exists (select 1 from unnest(array['politicas_conservacion','retenciones_legales','conservacion_historial']) t, unnest(array['anon','authenticated']) r, unnest(array['SELECT','INSERT','UPDATE','DELETE']) p where has_table_privilege(r, 'public.' || t, p))
  and not has_function_privilege('authenticated', 'fn_suprimir_paciente_autorizado(uuid,text,uuid)', 'EXECUTE') and not has_function_privilege('anon', 'fn_colocar_retencion_legal(uuid,uuid,text,text,text,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'fn_establecer_plazo_conservacion(text,integer,text,text,uuid)', 'EXECUTE') and not has_function_privilege('authenticated', 'fn_conservacion_paciente(uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'fn_suprimir_paciente_autorizado(uuid,text,uuid)', 'EXECUTE') and has_function_privilege('service_role', 'fn_liberar_retencion_legal(uuid,text,uuid)', 'EXECUTE')
  and (select bool_and(relrowsecurity) from pg_class where oid in ('public.politicas_conservacion'::regclass, 'public.retenciones_legales'::regclass, 'public.conservacion_historial'::regclass)));
select set_config('t.e1', pg_temp.como(current_setting('t.o')::uuid, 'select count(*)::text from politicas_conservacion'), false), set_config('t.e2', pg_temp.como(current_setting('t.o')::uuid, 'select count(*)::text from retenciones_legales'), false),
       set_config('t.e3', pg_temp.como(current_setting('t.o')::uuid, 'update politicas_conservacion set plazo_anios = 5 where true'), false), set_config('t.e4', pg_temp.como(current_setting('t.o')::uuid, 'delete from conservacion_historial where true'), false),
       set_config('t.e5', pg_temp.como(current_setting('t.o')::uuid, $q$insert into retenciones_legales (clinica_id, categoria, motivo) values ('c8000000-0000-0000-0000-00000000000a', 'expediente_clinico', 'intento de un usuario')$q$), false);
select pg_temp.t('K3 un PROPIETARIO de clínica no puede ver, cambiar plazos, borrar el historial ni crear retenciones (permiso denegado 42501)', current_setting('t.e1') like 'ERR|42501|%' and current_setting('t.e2') like 'ERR|42501|%' and current_setting('t.e3') like 'ERR|42501|%' and current_setting('t.e4') like 'ERR|42501|%' and current_setting('t.e5') like 'ERR|42501|%');
select pg_temp.t('K4 un usuario con sesión que llega a las funciones de gestión (aunque sea por una vía indirecta) recibe SOLO_SERVIDOR: no puede cambiar plazos, colocar retenciones ni suprimir',
  pg_temp.con_sesion(current_setting('t.o'), $q$select fn_establecer_plazo_conservacion('expediente_clinico', 9, 'PENDIENTE_DE_ABOGADO', 'intento de un usuario con sesion', null)$q$) like 'ERR|SOLO_SERVIDOR|%'
  and pg_temp.con_sesion(current_setting('t.o'), $q$select fn_colocar_retencion_legal('c8000000-0000-0000-0000-00000000000a', null, 'expediente_clinico', 'intento de un usuario con sesion', null, null)$q$) like 'ERR|SOLO_SERVIDOR|%'
  and pg_temp.con_sesion(current_setting('t.o'), $q$select fn_suprimir_paciente_autorizado('b8000000-0000-0000-0000-000000000001', 'intento de un usuario con sesion sin autorizacion', null)$q$) like 'ERR|SOLO_SERVIDOR|%');
-- ===== datos sintéticos =====
insert into pacientes (id, clinica_id, nombre_completo) values ('e0000000-0000-0000-0000-000000000001','c8000000-0000-0000-0000-00000000000a','Sintético A (acto hace 6 años)'),('e0000000-0000-0000-0000-000000000002','c8000000-0000-0000-0000-00000000000a','Sintético B (acto hace 2 años)'),('e0000000-0000-0000-0000-000000000003','c8000000-0000-0000-0000-00000000000a','Sintético C (sin registros)'),('e0000000-0000-0000-0000-000000000004','c8000000-0000-0000-0000-00000000000a','Sintético D (acto hace 30 años)');
insert into tratamientos (paciente_id, descripcion, costo, creado_en) values ('e0000000-0000-0000-0000-000000000001','Sintético',1, now() - interval '6 years 1 day'), ('e0000000-0000-0000-0000-000000000002','Sintético',1, now() - interval '2 years'), ('e0000000-0000-0000-0000-000000000004','Sintético',1, now() - interval '30 years');
insert into recetas (paciente_id, creado_en) values ('e0000000-0000-0000-0000-000000000001', now() - interval '7 years');
select pg_temp.t('K5 el ÚLTIMO ACTO MÉDICO es el registro clínico más reciente (hace 6 años), NO la fecha de alta del paciente (hoy); sin registros es NULL',
  (select fn_ultimo_acto_medico('e0000000-0000-0000-0000-000000000001') < now() - interval '6 years' and fn_ultimo_acto_medico('e0000000-0000-0000-0000-000000000001') > now() - interval '6 years 3 days')
  and (select fn_ultimo_acto_medico('e0000000-0000-0000-0000-000000000003')) is null and (select creado_en > now() - interval '1 day' from pacientes where id = 'e0000000-0000-0000-0000-000000000001'));
select set_config('t.k5_blanco', fn_paciente_tiene_registros_clinicos('e0000000-0000-0000-0000-000000000003')::text, false), set_config('t.k5_piezas', (select count(*)::text from odontograma_piezas where paciente_id = 'e0000000-0000-0000-0000-000000000003'), false);
update odontograma_piezas set estado = 'caries' where paciente_id = 'e0000000-0000-0000-0000-000000000003' and numero_pieza = (select min(numero_pieza) from odontograma_piezas where paciente_id = 'e0000000-0000-0000-0000-000000000003');
select set_config('t.k5_tocado', fn_paciente_tiene_registros_clinicos('e0000000-0000-0000-0000-000000000003')::text, false);
update odontograma_piezas set estado = 'sano' where paciente_id = 'e0000000-0000-0000-0000-000000000003'; delete from odontograma_historial where pieza_id in (select id from odontograma_piezas where paciente_id = 'e0000000-0000-0000-0000-000000000003');
update expedientes set alergias = '["penicilina"]'::jsonb where paciente_id = 'e0000000-0000-0000-0000-000000000003';
select set_config('t.k5_exp', fn_paciente_tiene_registros_clinicos('e0000000-0000-0000-0000-000000000003')::text, false);
update expedientes set alergias = '[]'::jsonb where paciente_id = 'e0000000-0000-0000-0000-000000000003';
select pg_temp.t('K5b un paciente recién creado (con su expediente y sus 64 piezas en blanco) NO tiene registros clínicos y se puede borrar; tocar una pieza del odontograma o llenar el expediente SÍ cuenta; al deshacerlo, vuelve a estar en blanco',
  current_setting('t.k5_blanco') = 'false' and current_setting('t.k5_piezas') = '32' and current_setting('t.k5_tocado') = 'true' and current_setting('t.k5_exp') = 'true' and not fn_paciente_tiene_registros_clinicos('e0000000-0000-0000-0000-000000000003'));
insert into pacientes (id, clinica_id, nombre_completo) values ('e0000000-0000-0000-0000-0000000000b5','c8000000-0000-0000-0000-00000000000a','Sintético E (tratamiento viejo, cita completada reciente)');
insert into tratamientos (paciente_id, descripcion, costo, creado_en) values ('e0000000-0000-0000-0000-0000000000b5','Sintético',1, now() - interval '9 years');
set local session_replication_role = replica;
insert into citas (paciente_id, dentista_id, inicio, fin, estado) values ('e0000000-0000-0000-0000-0000000000b5', current_setting('t.d')::uuid, now() - interval '1 year', now() - interval '1 year' + interval '30 minutes', 'completada');
set local session_replication_role = origin;
select pg_temp.t('K5c el último acto médico considera TODOS los registros clínicos, no solo los tratamientos: una cita completada de hace 1 año prevalece sobre un tratamiento de hace 9',
  fn_ultimo_acto_medico('e0000000-0000-0000-0000-0000000000b5') > now() - interval '1 year 2 days' and fn_ultimo_acto_medico('e0000000-0000-0000-0000-0000000000b5') < now() - interval '364 days');
select pg_temp.t('K6 SIN plazo definido nada es suprimible: ni un expediente de hace 30 años (no se inventa un plazo); un paciente sin registros sí se puede borrar',
  (fn_conservacion_paciente('e0000000-0000-0000-0000-000000000004') ->> 'puede_suprimirse')::boolean = false and fn_conservacion_paciente('e0000000-0000-0000-0000-000000000004') ->> 'motivo_bloqueo' = 'PLAZO_CLINICO_NO_DEFINIDO'
  and (fn_conservacion_paciente('e0000000-0000-0000-0000-000000000003') ->> 'puede_suprimirse')::boolean and fn_plazo_expediente_anios() is null);
insert into plataforma_config (clave, valor) values ('retencion_expediente_anios', '4');
select set_config('t.pz4', coalesce(fn_plazo_expediente_anios()::text, 'null'), false);
update plataforma_config set valor = '7' where clave = 'retencion_expediente_anios';
select set_config('t.pz7', coalesce(fn_plazo_expediente_anios()::text, 'null'), false);
select pg_temp.t('K7 un plazo legado por debajo del piso (4 años) NO vale (= sin plazo); uno válido (7) sí; y un plazo por debajo de 5 se rechaza en la política (violación de CHECK)', current_setting('t.pz4') = 'null' and current_setting('t.pz7') = '7'
  and pg_temp.ej($q$select fn_establecer_plazo_conservacion('expediente_clinico', 3, 'PENDIENTE_DE_ABOGADO', 'intento de bajar el plazo por debajo del piso', null)$q$) like 'ERR|23514|%');
select fn_establecer_plazo_conservacion('expediente_clinico', 6, 'APROBADA_POR_RESPONSABLE', 'Decisión del responsable: 6 años, pendiente de revisión jurídica', current_setting('t.o')::uuid);
select pg_temp.t('K8 la política prevalece sobre el valor legado (6 frente a 7); el cambio queda en el HISTORIAL con plazo anterior y nuevo, actor y motivo',
  fn_plazo_expediente_anios() = 6 and exists (select 1 from conservacion_historial where accion = 'politica_actualizada' and (valor_nuevo ->> 'plazo_anios')::int = 6 and valor_anterior ->> 'plazo_anios' is null and actor = current_setting('t.o')::uuid)
  and exists (select 1 from conservacion_historial where accion = 'motivo_de_decision' and motivo like 'Decisión del responsable%' and actor = current_setting('t.o')::uuid));
select pg_temp.t('K9 con plazo de 6 años: el expediente de hace 6 años (A) y el de hace 30 (D) son suprimibles; el de hace 2 años (B) NO (DENTRO_DEL_PLAZO_DE_CONSERVACION)',
  (fn_conservacion_paciente('e0000000-0000-0000-0000-000000000001') ->> 'puede_suprimirse')::boolean and (fn_conservacion_paciente('e0000000-0000-0000-0000-000000000004') ->> 'puede_suprimirse')::boolean
  and not (fn_conservacion_paciente('e0000000-0000-0000-0000-000000000002') ->> 'puede_suprimirse')::boolean and fn_conservacion_paciente('e0000000-0000-0000-0000-000000000002') ->> 'motivo_bloqueo' = 'DENTRO_DEL_PLAZO_DE_CONSERVACION'
  and not (fn_conservacion_paciente('e0000000-0000-0000-0000-0000000000b5') ->> 'puede_suprimirse')::boolean);   -- E: tratamiento de hace 9 años pero cita completada de hace 1: NO es suprimible
select set_config('t.d_a', pg_temp.ej($q$delete from pacientes where id = 'e0000000-0000-0000-0000-000000000001'$q$), false), set_config('t.d_b', pg_temp.ej($q$delete from pacientes where id = 'e0000000-0000-0000-0000-000000000004'$q$), false), set_config('t.d_c', pg_temp.ej($q$delete from pacientes where id = 'e0000000-0000-0000-0000-000000000003'$q$), false);
select pg_temp.t('K10 el BORRADO FÍSICO directo de un paciente con registros clínicos se rechaza (EXPEDIENTE_SUJETO_A_CONSERVACION) aunque su plazo esté vencido: solo procede por el procedimiento autorizado; el que no tiene registros sí se borra',
  current_setting('t.d_a') like 'ERR|EXPEDIENTE_SUJETO_A_CONSERVACION|%' and current_setting('t.d_b') like 'ERR|EXPEDIENTE_SUJETO_A_CONSERVACION|%' and current_setting('t.d_c') like 'ok%'
  and exists (select 1 from tratamientos where paciente_id = 'e0000000-0000-0000-0000-000000000001') and not exists (select 1 from pacientes where id = 'e0000000-0000-0000-0000-000000000003'));
select fn_colocar_retencion_legal('c8000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-000000000004', 'expediente_clinico', 'Litigio en curso, oficio del juzgado (sintético)', 'EXP-SINTETICO-1', current_setting('t.o')::uuid);
select set_config('t.k11', pg_temp.ej($q$select (fn_suprimir_paciente_autorizado('e0000000-0000-0000-0000-000000000004', 'Intento de supresión con retención legal activa', null) ->> 'motivo_bloqueo')$q$), false);
select pg_temp.t('K11 una RETENCIÓN LEGAL por paciente suspende la supresión aunque el plazo esté vencido (se devuelve RETENCION_LEGAL_ACTIVA y el intento rechazado queda en el historial); el paciente sigue existiendo',
  fn_conservacion_paciente('e0000000-0000-0000-0000-000000000004') ->> 'motivo_bloqueo' = 'RETENCION_LEGAL_ACTIVA' and not (fn_conservacion_paciente('e0000000-0000-0000-0000-000000000004') ->> 'puede_suprimirse')::boolean
  and current_setting('t.k11') = 'ok:RETENCION_LEGAL_ACTIVA' and exists (select 1 from pacientes where id = 'e0000000-0000-0000-0000-000000000004') and exists (select 1 from conservacion_historial where accion = 'supresion_rechazada' and paciente_id = 'e0000000-0000-0000-0000-000000000004'));
insert into pacientes (id, clinica_id, nombre_completo) values ('e0000000-0000-0000-0000-0000000000a1','c8000000-0000-0000-0000-00000000000a','Sintético sin registros con retención');
select fn_colocar_retencion_legal('c8000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-0000000000a1', 'expediente_clinico', 'Retención sobre un paciente sin registros (sintético)', null, null) as hold_a1 \gset
select set_config('t.k11b1', pg_temp.ej($q$delete from pacientes where id = 'e0000000-0000-0000-0000-0000000000a1'$q$), false);
select fn_liberar_retencion_legal(:'hold_a1'::uuid, 'Retención levantada, constancia en el expediente (sintético)', null);
select set_config('t.k11b2', pg_temp.ej($q$delete from pacientes where id = 'e0000000-0000-0000-0000-0000000000a1'$q$), false);
select pg_temp.t('K11b el DISPARADOR de pacientes aplica la retención legal por sí mismo: un paciente SIN registros clínicos con retención activa no se borra (RETENCION_LEGAL_ACTIVA); liberada, sí',
  current_setting('t.k11b1') like 'ERR|RETENCION_LEGAL_ACTIVA|%' and current_setting('t.k11b2') like 'ok%' and not exists (select 1 from pacientes where id = 'e0000000-0000-0000-0000-0000000000a1'));
select pg_temp.t('K12 las retenciones exigen motivo (mínimo 10 caracteres) y un paciente de la clínica indicada; el historial registra quién y por qué',
  pg_temp.ej($q$select fn_colocar_retencion_legal('c8000000-0000-0000-0000-00000000000a', null, 'expediente_clinico', 'corto', null, null)$q$) like 'ERR|MOTIVO_REQUERIDO|%'
  and pg_temp.ej($q$select fn_colocar_retencion_legal('c8000000-0000-0000-0000-00000000000a', 'b8000000-0000-0000-0000-00000000000b', 'expediente_clinico', 'Paciente de OTRA clínica (sintético)', null, null)$q$) like 'ERR|PACIENTE_INCOHERENTE|%'
  and exists (select 1 from conservacion_historial where accion = 'retencion_legal_colocada' and actor = current_setting('t.o')::uuid and motivo like 'Litigio%'));
select fn_colocar_retencion_legal('c8000000-0000-0000-0000-00000000000a', null, 'expediente_clinico', 'Auditoría de la autoridad a toda la clínica (sintético)', null, null) as hold_clinica \gset
select pg_temp.t('K13 una retención de CLÍNICA suspende la supresión de TODOS sus pacientes (A, aunque su plazo esté vencido) y la eliminación de la clínica', fn_conservacion_paciente('e0000000-0000-0000-0000-000000000001') ->> 'motivo_bloqueo' = 'RETENCION_LEGAL_ACTIVA'
  and pg_temp.ej($q$delete from clinicas where id = 'c8000000-0000-0000-0000-00000000000a'$q$) like 'ERR|RETENCION_LEGAL_ACTIVA|%');
select fn_liberar_retencion_legal(:'hold_clinica'::uuid, 'Auditoría concluida, oficio de cierre (sintético)', current_setting('t.o')::uuid);
select pg_temp.t('K14 liberar la retención la levanta (queda historial); liberar dos veces o con motivo corto se rechaza; la retención del paciente D sigue activa',
  (fn_conservacion_paciente('e0000000-0000-0000-0000-000000000001') ->> 'puede_suprimirse')::boolean and (fn_conservacion_paciente('e0000000-0000-0000-0000-000000000004') ->> 'motivo_bloqueo') = 'RETENCION_LEGAL_ACTIVA'
  and pg_temp.ej(format($q$select fn_liberar_retencion_legal(%L, 'Intento de liberar otra vez la misma retención', null)$q$, :'hold_clinica')) like 'ERR|RETENCION_NO_ENCONTRADA|%'
  and pg_temp.ej(format($q$select fn_liberar_retencion_legal(%L, 'corto', null)$q$, :'hold_clinica')) like 'ERR|MOTIVO_REQUERIDO|%' and exists (select 1 from conservacion_historial where accion = 'retencion_legal_liberada'));
select set_config('t.s_b', pg_temp.ej($q$select (fn_suprimir_paciente_autorizado('e0000000-0000-0000-0000-000000000002', 'Intento de supresión dentro del plazo (sintético)', null) ->> 'motivo_bloqueo')$q$), false),
       set_config('t.s_c', pg_temp.ej($q$select fn_suprimir_paciente_autorizado('e0000000-0000-0000-0000-000000000001', 'corto', null)$q$), false);
select pg_temp.t('K15 la supresión autorizada se rechaza dentro del plazo (DENTRO_DEL_PLAZO_DE_CONSERVACION, queda en el historial) y sin motivo suficiente (mínimo 20 caracteres); el paciente sigue existiendo',
  current_setting('t.s_b') = 'ok:DENTRO_DEL_PLAZO_DE_CONSERVACION' and current_setting('t.s_c') like 'ERR|MOTIVO_REQUERIDO|%' and exists (select 1 from pacientes where id = 'e0000000-0000-0000-0000-000000000002')
  and exists (select 1 from conservacion_historial where accion = 'supresion_rechazada' and paciente_id = 'e0000000-0000-0000-0000-000000000002'));
select set_config('t.s_a', pg_temp.ej($q$select (fn_suprimir_paciente_autorizado('e0000000-0000-0000-0000-000000000001', 'Supresión autorizada de un expediente sintético con plazo vencido', current_setting('t.o')::uuid) ->> 'puede_suprimirse')$q$), false);
select pg_temp.t('K16 con plazo VENCIDO, sin retención legal y con motivo, la supresión autorizada se ejecuta: borra al paciente y sus registros (en cascada), deja historial con el estado que la justificó y NO deja activada la autorización',
  current_setting('t.s_a') = 'ok:true' and not exists (select 1 from pacientes where id = 'e0000000-0000-0000-0000-000000000001') and not exists (select 1 from tratamientos where paciente_id = 'e0000000-0000-0000-0000-000000000001') and not exists (select 1 from recetas where paciente_id = 'e0000000-0000-0000-0000-000000000001')
  and exists (select 1 from conservacion_historial where accion = 'supresion_autorizada' and paciente_id = 'e0000000-0000-0000-0000-000000000001' and actor = current_setting('t.o')::uuid and (valor_nuevo ->> 'puede_suprimirse')::boolean and valor_nuevo ->> 'ultimo_acto_medico' is not null)
  and coalesce(current_setting('siro.supresion_autorizada', true), 'off') = 'off' and pg_temp.ej($q$delete from pacientes where id = 'e0000000-0000-0000-0000-000000000002'$q$) like 'ERR|EXPEDIENTE_SUJETO_A_CONSERVACION|%');
select set_config('t.h1', pg_temp.ej($q$update conservacion_historial set motivo = 'alterado' where true$q$), false), set_config('t.h2', pg_temp.ej($q$delete from conservacion_historial where true$q$), false);
select pg_temp.t('K17 el historial de decisiones es INMUTABLE: ni siquiera el servidor puede modificarlo o borrarlo (HISTORIAL_INMUTABLE)', current_setting('t.h1') like 'ERR|HISTORIAL_INMUTABLE|%' and current_setting('t.h2') like 'ERR|HISTORIAL_INMUTABLE|%');
select pg_temp.t('K18 la eliminación AUTOMÁTICA está prohibida por el esquema, y ningún plazo por debajo del piso ni fuera de rango se acepta',
  pg_temp.ej($q$update politicas_conservacion set eliminacion_automatica = true where categoria = 'pagos'$q$) like 'ERR|23514|%' and pg_temp.ej($q$update politicas_conservacion set plazo_anios = 0 where categoria = 'pagos'$q$) like 'ERR|23514|%'
  and pg_temp.ej($q$update politicas_conservacion set plazo_anios = 101 where categoria = 'contratos'$q$) like 'ERR|23514|%' and pg_temp.ej($q$update politicas_conservacion set plazo_anios = 4 where categoria = 'expediente_clinico'$q$) like 'ERR|23514|%');
insert into clinicas (id, nombre) values ('c9000000-0000-0000-0000-0000000000f1','Clínica sintética'); 
select fn_colocar_retencion_legal('c9000000-0000-0000-0000-0000000000f1', null, 'contratos', 'Controversia contractual abierta (sintético)', null, null) as hold_f1 \gset
select set_config('t.c1', pg_temp.ej($q$delete from clinicas where id = 'c9000000-0000-0000-0000-0000000000f1'$q$), false);
select fn_liberar_retencion_legal(:'hold_f1'::uuid, 'Controversia resuelta, constancia en el expediente (sintético)', null);
select set_config('t.c2', pg_temp.ej($q$delete from clinicas where id = 'c9000000-0000-0000-0000-0000000000f1'$q$), false);
select pg_temp.t('K19 una clínica con retención legal activa NO se elimina (RETENCION_LEGAL_ACTIVA); liberada, ya no la bloquea y se elimina',
  current_setting('t.c1') like 'ERR|RETENCION_LEGAL_ACTIVA|%' and current_setting('t.c2') like 'ok%' and not exists (select 1 from clinicas where id = 'c9000000-0000-0000-0000-0000000000f1'));
do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO 104: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 100), ' | ') from _res where not ok); end if;
end $$;
rollback;
