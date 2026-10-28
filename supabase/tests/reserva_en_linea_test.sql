-- Migración 117: reserva en línea. Datos sintéticos; todo con ROLLBACK.
-- Cubre: lo que ve anon (solo horas libres, nunca datos de otros pacientes), ocupación (citas, bloqueos, sillones,
-- solicitudes pendientes), validación, campo trampa, límites de frecuencia, plan, aislamiento entre clínicas y el
-- flujo del personal (confirmar con paciente nuevo o existente, rechazar, choque con otra cita).
\set ON_ERROR_STOP on
\set QUIET on
begin;
create temp table _res (ok boolean, nombre text);
create function pg_temp.t(p_nombre text, p_cond boolean) returns void language plpgsql as $$
begin insert into _res values (coalesce(p_cond,false), p_nombre); raise notice '% %', case when coalesce(p_cond,false) then 'PASS' else 'FAIL' end, p_nombre; end $$;
-- Como usuario con sesión
create function pg_temp.val(p_uid uuid, p_sql text) returns text language plpgsql as $$
declare v text; v_h text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin execute p_sql into v; reset role; return v;
  exception when others then get stacked diagnostics v_h = pg_exception_hint; reset role; return 'ERR|' || sqlstate || '|' || coalesce(v_h, '') || '|' || sqlerrm; end;
end $$;
-- Como visitante anónimo (enlace público), desde la IP indicada
create function pg_temp.anon(p_sql text, p_ip text default '198.51.100.1') returns text language plpgsql as $$
declare v text; v_h text;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.headers', json_build_object('x-forwarded-for', p_ip || ', 10.0.0.1')::text, true);
  set local role anon;
  begin execute p_sql into v; reset role; return v;
  exception when others then get stacked diagnostics v_h = pg_exception_hint; reset role; return 'ERR|' || sqlstate || '|' || coalesce(v_h, '') || '|' || sqlerrm; end;
end $$;
-- Hora local de la clínica (America/Mexico_City) dentro de N días
create function pg_temp.h(p_dias integer, p_hora text) returns timestamptz language sql as $$
  select (((now() at time zone 'America/Mexico_City')::date + p_dias)::timestamp + p_hora::time) at time zone 'America/Mexico_City'
$$;
create function pg_temp.fecha(p_dias integer) returns date language sql as $$ select (now() at time zone 'America/Mexico_City')::date + p_dias $$;
create function pg_temp.pedir(p_inicio timestamptz, p_correo text, p_ip text default '198.51.100.1', p_slug text default 'clinica-a',
  p_srv uuid default 'e1170000-0000-0000-0000-00000000000a', p_nombre text default 'Laura Gómez', p_tel text default '55 1234 5678',
  p_motivo text default null, p_trampa text default null) returns text language sql as $$
  select pg_temp.anon(format('select reserva_solicitar_cita(%L, %L, %L, %L, %L, %L, %L, null, %L)::text',
                             p_slug, p_srv, p_inicio, p_nombre, p_correo, p_tel, p_motivo, p_trampa), p_ip)
$$;
create function pg_temp.libres(p_dias integer, p_slug text default 'clinica-a', p_srv uuid default 'e1170000-0000-0000-0000-00000000000a') returns text language sql as $$
  select pg_temp.anon(format('select reserva_horarios_libres(%L, %L, %L)::text', p_slug, p_srv, pg_temp.fecha(p_dias)))
$$;
create function pg_temp.horas(p_json text) returns text language sql as $$
  select coalesce(string_agg(e ->> 'hora', ',' order by e ->> 'hora'), '') from jsonb_array_elements(p_json::jsonb) e
$$;

-- ---------- Datos ----------
insert into auth.users (id, email) select ('a1170000-0000-0000-0000-0000000000'||lpad(g::text,2,'0'))::uuid, 'rl_'||g||'@x.mx' from generate_series(1,10) g;
insert into clinicas (id, nombre, telefono) values
 ('c1170000-0000-0000-0000-00000000000a','Clínica A','5511112222'),
 ('c1170000-0000-0000-0000-00000000000b','Clínica B','5533334444'),
 ('c1170000-0000-0000-0000-00000000000e','Clínica Esencial','5500000000');
select fn_asignar_plan_interno(null, 'c1170000-0000-0000-0000-00000000000a', 'empresarial', 'mensual'),
       fn_asignar_plan_interno(null, 'c1170000-0000-0000-0000-00000000000b', 'empresarial', 'mensual'),
       fn_asignar_plan_interno(null, 'c1170000-0000-0000-0000-00000000000e', 'esencial', 'mensual');
insert into usuarios (id, clinica_id, nombre, correo, rol) values
 ('a1170000-0000-0000-0000-000000000001','c1170000-0000-0000-0000-00000000000a','Owner A','rl_1@x.mx','owner'),
 ('a1170000-0000-0000-0000-000000000002','c1170000-0000-0000-0000-00000000000a','Dentista A1','rl_2@x.mx','dentista'),
 ('a1170000-0000-0000-0000-000000000003','c1170000-0000-0000-0000-00000000000a','Dentista A2','rl_3@x.mx','dentista'),
 ('a1170000-0000-0000-0000-000000000004','c1170000-0000-0000-0000-00000000000a','Recepción A','rl_4@x.mx','recepcion'),
 ('a1170000-0000-0000-0000-000000000005','c1170000-0000-0000-0000-00000000000a','Asistente A','rl_5@x.mx','asistente'),
 ('a1170000-0000-0000-0000-000000000006','c1170000-0000-0000-0000-00000000000b','Owner B','rl_6@x.mx','owner'),
 ('a1170000-0000-0000-0000-000000000007','c1170000-0000-0000-0000-00000000000b','Dentista B1','rl_7@x.mx','dentista'),
 ('a1170000-0000-0000-0000-000000000008','c1170000-0000-0000-0000-00000000000b','Dentista B2','rl_8@x.mx','dentista'),
 ('a1170000-0000-0000-0000-000000000009','c1170000-0000-0000-0000-00000000000e','Owner E','rl_9@x.mx','owner');
update usuarios set creado_en = now() - interval '2 days' where id = 'a1170000-0000-0000-0000-000000000002';  -- A1 es el primero en asignarse
update usuarios set creado_en = now() - interval '1 day'  where id = 'a1170000-0000-0000-0000-000000000003';
\set OA '''a1170000-0000-0000-0000-000000000001'''
\set DA1 '''a1170000-0000-0000-0000-000000000002'''
\set DA2 '''a1170000-0000-0000-0000-000000000003'''
\set RA '''a1170000-0000-0000-0000-000000000004'''
\set AA '''a1170000-0000-0000-0000-000000000005'''
\set OB '''a1170000-0000-0000-0000-000000000006'''
insert into pacientes (id, clinica_id, nombre_completo, telefono, correo, dentista_responsable_id) values
 ('b1170000-0000-0000-0000-00000000000a','c1170000-0000-0000-0000-00000000000a','Paciente Existente Secreto','5599998888','secreto@x.mx','a1170000-0000-0000-0000-000000000002'),
 ('b1170000-0000-0000-0000-00000000000b','c1170000-0000-0000-0000-00000000000b','Paciente de B','5577776666',null,'a1170000-0000-0000-0000-000000000007');
insert into reserva_config (clinica_id, activa, slug, dias_semana, hora_apertura, hora_cierre, intervalo_min, anticipacion_min_horas, anticipacion_max_dias, mensaje) values
 ('c1170000-0000-0000-0000-00000000000a', true, 'Clinica-A ', '{1,2,3,4,5,6,7}', '09:00', '12:00', 30, 0, 30, 'Trae tu identificación.'),
 ('c1170000-0000-0000-0000-00000000000b', true, 'clinica-b', '{1,2,3,4,5,6,7}', '09:00', '11:00', 60, 0, 30, null),
 ('c1170000-0000-0000-0000-00000000000e', true, 'clinica-esencial', '{1,2,3,4,5,6,7}', '09:00', '11:00', 60, 0, 30, null);
insert into reserva_servicios (id, clinica_id, nombre, duracion_min) values
 ('e1170000-0000-0000-0000-00000000000a','c1170000-0000-0000-0000-00000000000a','Limpieza dental',60),
 ('e1170000-0000-0000-0000-0000000000a2','c1170000-0000-0000-0000-00000000000a','Servicio inactivo',30),
 ('e1170000-0000-0000-0000-00000000000b','c1170000-0000-0000-0000-00000000000b','Valoración',60),
 ('e1170000-0000-0000-0000-00000000000e','c1170000-0000-0000-0000-00000000000e','Valoración',60);
update reserva_servicios set activo = false where id = 'e1170000-0000-0000-0000-0000000000a2';
-- Clínica B: una sucursal con UN sillón (dos dentistas, pero el sillón limita).
insert into sucursales (id, clinica_id, nombre) values ('d1170000-0000-0000-0000-00000000000b','c1170000-0000-0000-0000-00000000000b','Matriz B');
insert into consultorios (id, sucursal_id, nombre) values ('d1170000-0000-0000-0000-0000000000c1','d1170000-0000-0000-0000-00000000000b','Consultorio 1');
insert into sillones (id, consultorio_id, nombre) values ('d1170000-0000-0000-0000-0000000000f1','d1170000-0000-0000-0000-0000000000c1','Sillón 1');

-- ============================================================ 1. Lo que ve el visitante anónimo
select set_config('t.info', pg_temp.anon($q$select reserva_publica_info('clinica-a')::text$q$), true);
select pg_temp.t('R1 anon ve el nombre de la clínica, sus servicios ACTIVOS y el mensaje (slug normalizado a minúsculas)',
  current_setting('t.info')::jsonb #>> '{clinica,nombre}' = 'Clínica A'
  and jsonb_array_length(current_setting('t.info')::jsonb -> 'servicios') = 1
  and current_setting('t.info')::jsonb ->> 'mensaje' = 'Trae tu identificación.');
select pg_temp.t('R1b la información pública no incluye pacientes, usuarios ni correos internos',
  current_setting('t.info') not like '%Paciente Existente%' and current_setting('t.info') not like '%Dentista%' and current_setting('t.info') not like '%rl_%@x.mx%');
select pg_temp.t('R2 con todo libre: 09:00 a 11:00 cada 30 min para un servicio de 60 min (cierre 12:00)',
  pg_temp.horas(pg_temp.libres(3)) = '09:00,09:30,10:00,10:30,11:00');
-- Ocupación: cita de A1 9:00–10:00, bloqueo de A2 9:00–9:30, bloqueo de TODA la clínica 11:00–12:00.
insert into citas (paciente_id, dentista_id, inicio, fin, estado, motivo_consulta) values
 ('b1170000-0000-0000-0000-00000000000a','a1170000-0000-0000-0000-000000000002', pg_temp.h(3,'09:00'), pg_temp.h(3,'10:00'), 'agendada', 'Motivo privado del paciente');
insert into horarios_bloqueados (clinica_id, dentista_id, tipo, inicio, fin) values
 ('c1170000-0000-0000-0000-00000000000a','a1170000-0000-0000-0000-000000000003','comida', pg_temp.h(3,'09:00'), pg_temp.h(3,'09:30')),
 ('c1170000-0000-0000-0000-00000000000a', null, 'otro', pg_temp.h(3,'11:00'), pg_temp.h(3,'12:00'));
select set_config('t.lib', pg_temp.libres(3), true);
select pg_temp.t('R3 respeta citas existentes, bloqueos del dentista y bloqueos de toda la clínica (quedan 09:30 y 10:00)',
  pg_temp.horas(current_setting('t.lib')) = '09:30,10:00');
select pg_temp.t('R4 la respuesta de horarios trae SOLO {inicio, hora}: nada de pacientes, motivos, dentistas ni ids',
  (select bool_and((select array_agg(k order by k) from jsonb_object_keys(e) k) = '{hora,inicio}') from jsonb_array_elements(current_setting('t.lib')::jsonb) e)
  and current_setting('t.lib') not like '%Paciente%' and current_setting('t.lib') not like '%privado%' and current_setting('t.lib') !~ '[0-9a-f]{8}-[0-9a-f]{4}-');
insert into citas (paciente_id, dentista_id, inicio, fin, estado) values
 ('b1170000-0000-0000-0000-00000000000a','a1170000-0000-0000-0000-000000000003', pg_temp.h(4,'09:00'), pg_temp.h(4,'10:00'), 'cancelada');
select pg_temp.t('R4b una cita CANCELADA no ocupa el horario: el día 4 sigue completo', pg_temp.horas(pg_temp.libres(4)) = '09:00,09:30,10:00,10:30,11:00');

-- ============================================================ 2. Crear solicitudes
select set_config('t.s1', pg_temp.pedir(pg_temp.h(3,'10:00'), 'laura@correo.mx', '203.0.113.10'), true);
select pg_temp.t('R5 anon crea una solicitud: responde ok con inicio/fin/servicio y nada más', current_setting('t.s1')::jsonb ->> 'ok' = 'true'
  and current_setting('t.s1')::jsonb ->> 'servicio' = 'Limpieza dental' and not (current_setting('t.s1')::jsonb ? 'id'));
select pg_temp.t('R6 la solicitud queda PENDIENTE DE CONFIRMAR, asignada al primer dentista libre y sin crear paciente ni cita',
  (select estado = 'pendiente_confirmar' and dentista_id = :DA1 and cita_id is null and paciente_id is null and fin - inicio = interval '60 minutes'
     from solicitudes_cita where correo = 'laura@correo.mx')
  and (select count(*) from pacientes where clinica_id = 'c1170000-0000-0000-0000-00000000000a') = 1);
select pg_temp.t('R7 la IP se guarda como hash con sal (64 hex), nunca en claro',
  (select ip_hash ~ '^[0-9a-f]{64}$' and ip_hash <> encode(sha256('203.0.113.10'::bytea), 'hex') from solicitudes_cita where correo = 'laura@correo.mx')
  and not exists (select 1 from solicitudes_cita s where to_jsonb(s)::text like '%203.0.113%'));
select set_config('t.s2', pg_temp.pedir(pg_temp.h(3,'10:00'), 'pedro@correo.mx', '203.0.113.11', p_nombre => 'Pedro Ruiz'), true);
select pg_temp.t('R8 una segunda persona a la misma hora toma al OTRO dentista libre',
  current_setting('t.s2')::jsonb ->> 'ok' = 'true' and (select dentista_id from solicitudes_cita where correo = 'pedro@correo.mx') = :DA2);
select pg_temp.t('R9 sin dentistas libres: la tercera a la misma hora se rechaza (RESERVA_HORARIO_OCUPADO) y ya no se ofrece (ni 09:30, que choca con las solicitudes de las 10:00)',
  pg_temp.pedir(pg_temp.h(3,'10:00'), 'ana@correo.mx', '203.0.113.12') like 'ERR|P0001|RESERVA_HORARIO_OCUPADO|%'
  and pg_temp.horas(pg_temp.libres(3)) = '');
select pg_temp.t('R10 horario no alineado, fuera de horario, en el pasado o más allá de la anticipación máxima: RESERVA_HORARIO_INVALIDO',
  pg_temp.pedir(pg_temp.h(5,'09:10'), 'x1@correo.mx', '203.0.113.20') like 'ERR|P0001|RESERVA_HORARIO_INVALIDO|%'
  and pg_temp.pedir(pg_temp.h(5,'11:30'), 'x1@correo.mx', '203.0.113.20') like 'ERR|P0001|RESERVA_HORARIO_INVALIDO|%'
  and pg_temp.pedir(pg_temp.h(-1,'09:00'), 'x1@correo.mx', '203.0.113.20') like 'ERR|P0001|RESERVA_HORARIO_INVALIDO|%'
  and pg_temp.pedir(pg_temp.h(31,'09:00'), 'x1@correo.mx', '203.0.113.20') like 'ERR|P0001|RESERVA_HORARIO_INVALIDO|%'
  and pg_temp.libres(31) = '[]');
select pg_temp.t('R11 validación estricta: correo, teléfono, nombre, motivo con < >, servicio inactivo o de otra clínica → RESERVA_DATOS_INVALIDOS',
  pg_temp.pedir(pg_temp.h(5,'09:00'), 'no-es-correo', '203.0.113.21') like 'ERR|P0001|RESERVA_DATOS_INVALIDOS|%'
  and pg_temp.pedir(pg_temp.h(5,'09:00'), 'ok@correo.mx', '203.0.113.21', p_tel => '123') like 'ERR|P0001|RESERVA_DATOS_INVALIDOS|%'
  and pg_temp.pedir(pg_temp.h(5,'09:00'), 'ok@correo.mx', '203.0.113.21', p_tel => '55-1234-ABCD') like 'ERR|P0001|RESERVA_DATOS_INVALIDOS|%'
  and pg_temp.pedir(pg_temp.h(5,'09:00'), 'ok@correo.mx', '203.0.113.21', p_nombre => 'X') like 'ERR|P0001|RESERVA_DATOS_INVALIDOS|%'
  and pg_temp.pedir(pg_temp.h(5,'09:00'), 'ok@correo.mx', '203.0.113.21', p_nombre => '<b>Hola</b>') like 'ERR|P0001|RESERVA_DATOS_INVALIDOS|%'
  and pg_temp.pedir(pg_temp.h(5,'09:00'), 'ok@correo.mx', '203.0.113.21', p_motivo => '<script>alert(1)</script>') like 'ERR|P0001|RESERVA_DATOS_INVALIDOS|%'
  and pg_temp.pedir(pg_temp.h(5,'09:00'), 'ok@correo.mx', '203.0.113.21', p_motivo => repeat('a', 501)) like 'ERR|P0001|RESERVA_DATOS_INVALIDOS|%'
  and pg_temp.pedir(pg_temp.h(5,'09:00'), 'ok@correo.mx', '203.0.113.21', p_srv => 'e1170000-0000-0000-0000-0000000000a2') like 'ERR|P0001|RESERVA_DATOS_INVALIDOS|%'
  and pg_temp.pedir(pg_temp.h(5,'09:00'), 'ok@correo.mx', '203.0.113.21', p_srv => 'e1170000-0000-0000-0000-00000000000b') like 'ERR|P0001|RESERVA_DATOS_INVALIDOS|%'
  and not exists (select 1 from solicitudes_cita where correo = 'ok@correo.mx'));
select set_config('t.trampa', pg_temp.pedir(pg_temp.h(5,'09:00'), 'robot@spam.mx', '203.0.113.22', p_trampa => 'http://spam.example'), true);
select pg_temp.t('R12 campo trampa lleno: se responde ok (el robot no se entera) pero NO se guarda nada',
  current_setting('t.trampa')::jsonb ->> 'ok' = 'true' and not exists (select 1 from solicitudes_cita where correo = 'robot@spam.mx'));

-- ============================================================ 3. Límites de frecuencia
select pg_temp.pedir(pg_temp.h(5, h), 'repite@correo.mx', '203.0.113.30') from unnest(array['09:00','09:30','10:00']) h;
select pg_temp.t('R13 límite por correo: la 4.ª solicitud del mismo correo en 24 h se rechaza (RESERVA_DEMASIADAS), aun desde otra IP',
  (select count(*) from solicitudes_cita where correo = 'repite@correo.mx') = 3
  and pg_temp.pedir(pg_temp.h(5,'10:30'), 'REPITE@correo.mx', '203.0.113.31') like 'ERR|P0001|RESERVA_DEMASIADAS|%');
select pg_temp.pedir(pg_temp.h(6, h), 'ip' || replace(h, ':', '') || '@correo.mx', '203.0.113.40') from unnest(array['09:00','09:30','10:00','10:30','11:00']) h;
select pg_temp.t('R14 límite por IP: la 6.ª solicitud desde la misma IP en una hora se rechaza aunque cambie el correo',
  (select count(*) from solicitudes_cita where correo like 'ip%@correo.mx') = 5
  and pg_temp.pedir(pg_temp.h(7,'09:00'), 'otro-mas@correo.mx', '203.0.113.40') like 'ERR|P0001|RESERVA_DEMASIADAS|%');
insert into plataforma_config (clave, valor) values ('reserva_max_por_clinica_hora', '12') on conflict (clave) do update set valor = excluded.valor;
select pg_temp.t('R15 límite por clínica (ajustable en plataforma_config): con el tope alcanzado se rechaza a cualquiera',
  (select count(*) from solicitudes_cita where clinica_id = 'c1170000-0000-0000-0000-00000000000a') = 10
  and pg_temp.pedir(pg_temp.h(7,'09:00'), 'nueva1@correo.mx', '203.0.113.50') like '{%'
  and pg_temp.pedir(pg_temp.h(7,'09:00'), 'nueva2@correo.mx', '203.0.113.51') like '{%'
  and pg_temp.pedir(pg_temp.h(7,'09:30'), 'nueva3@correo.mx', '203.0.113.52') like 'ERR|P0001|RESERVA_DEMASIADAS|%');
delete from plataforma_config where clave = 'reserva_max_por_clinica_hora';

-- ============================================================ 4. Cuándo NO hay reserva
update reserva_config set activa = false where clinica_id = 'c1170000-0000-0000-0000-00000000000b';
select pg_temp.t('R16 enlace desactivado, inexistente o de una clínica sin la funcionalidad (Esencial): RESERVA_NO_DISPONIBLE',
  pg_temp.anon($q$select reserva_publica_info('clinica-b')::text$q$) like 'ERR|P0001|RESERVA_NO_DISPONIBLE|%'
  and pg_temp.anon($q$select reserva_publica_info('no-existe')::text$q$) like 'ERR|P0001|RESERVA_NO_DISPONIBLE|%'
  and pg_temp.anon($q$select reserva_publica_info('clinica-esencial')::text$q$) like 'ERR|P0001|RESERVA_NO_DISPONIBLE|%'
  and pg_temp.pedir(pg_temp.h(5,'09:00'), 'e@correo.mx', '203.0.113.60', p_slug => 'clinica-esencial', p_srv => 'e1170000-0000-0000-0000-00000000000e') like 'ERR|P0001|RESERVA_NO_DISPONIBLE|%');
update reserva_config set activa = true where clinica_id = 'c1170000-0000-0000-0000-00000000000b';
update clinicas set estado = 'suspendida' where id = 'c1170000-0000-0000-0000-00000000000b';
select pg_temp.t('R17 clínica suspendida: no se puede reservar', pg_temp.anon($q$select reserva_publica_info('clinica-b')::text$q$) like 'ERR|P0001|RESERVA_NO_DISPONIBLE|%');
update clinicas set estado = 'activa' where id = 'c1170000-0000-0000-0000-00000000000b';

-- ============================================================ 5. Sillones y sucursales (clínica B)
insert into citas (paciente_id, dentista_id, inicio, fin, estado, sucursal_id, sillon_id) values
 ('b1170000-0000-0000-0000-00000000000b','a1170000-0000-0000-0000-000000000007', pg_temp.h(3,'09:00'), pg_temp.h(3,'10:00'), 'agendada',
  'd1170000-0000-0000-0000-00000000000b', 'd1170000-0000-0000-0000-0000000000f1');
select pg_temp.t('R18 con el único sillón ocupado a las 09:00 no se ofrece esa hora aunque el otro dentista esté libre',
  pg_temp.horas(pg_temp.libres(3, 'clinica-b', 'e1170000-0000-0000-0000-00000000000b')) = '10:00');
select set_config('t.sb', pg_temp.pedir(pg_temp.h(3,'10:00'), 'b1@correo.mx', '203.0.113.70', p_slug => 'clinica-b', p_srv => 'e1170000-0000-0000-0000-00000000000b'), true);
select pg_temp.t('R19 la solicitud toma la sucursal única y el sillón libre; el sillón queda apartado para otra solicitud',
  (select sucursal_id = 'd1170000-0000-0000-0000-00000000000b' and sillon_id = 'd1170000-0000-0000-0000-0000000000f1' from solicitudes_cita where correo = 'b1@correo.mx')
  and pg_temp.horas(pg_temp.libres(3, 'clinica-b', 'e1170000-0000-0000-0000-00000000000b')) = '');
insert into sucursales (id, clinica_id, nombre) values ('d1170000-0000-0000-0000-0000000000b2','c1170000-0000-0000-0000-00000000000b','Sucursal Norte');
select pg_temp.t('R20 con dos sucursales hay que elegir una (RESERVA_SUCURSAL_REQUERIDA); una sucursal de otra clínica es inválida',
  pg_temp.libres(3, 'clinica-b', 'e1170000-0000-0000-0000-00000000000b') like 'ERR|P0001|RESERVA_SUCURSAL_REQUERIDA|%'
  and pg_temp.anon(format('select reserva_horarios_libres(%L, %L, %L, %L)::text', 'clinica-b', 'e1170000-0000-0000-0000-00000000000b', pg_temp.fecha(3), 'd1170000-0000-0000-0000-0000000000b2')) like '[%'
  and pg_temp.anon(format('select reserva_horarios_libres(%L, %L, %L, %L)::text', 'clinica-a', 'e1170000-0000-0000-0000-00000000000a', pg_temp.fecha(3), 'd1170000-0000-0000-0000-0000000000b2')) like 'ERR|P0001|RESERVA_DATOS_INVALIDOS|%');

-- ============================================================ 6. anon no tiene otra puerta
select pg_temp.t('R21 anon NO puede leer ni escribir las tablas directamente (42501)',
  pg_temp.anon('select count(*)::text from solicitudes_cita') like 'ERR|42501|%'
  and pg_temp.anon('select count(*)::text from reserva_config') like 'ERR|42501|%'
  and pg_temp.anon('select count(*)::text from reserva_servicios') like 'ERR|42501|%'
  and pg_temp.anon($q$insert into solicitudes_cita (clinica_id, servicio_nombre, inicio, fin, nombre, correo, telefono) values ('c1170000-0000-0000-0000-00000000000a','x',now(),now()+interval '1 hour','x','x','x') returning 1$q$) like 'ERR|42501|%');
select pg_temp.t('R22 anon NO puede confirmar/rechazar ni usar las funciones internas',
  pg_temp.anon(format('select reserva_confirmar_solicitud(%L)::text', (select id from solicitudes_cita where correo = 'laura@correo.mx'))) like 'ERR|42501|%'
  and pg_temp.anon(format('select reserva_rechazar_solicitud(%L)::text', (select id from solicitudes_cita where correo = 'laura@correo.mx'))) like 'ERR|42501|%'
  and pg_temp.anon($q$select (fn_reserva_recurso_libre('c1170000-0000-0000-0000-00000000000a', null, now(), now() + interval '1 hour')).libre::text$q$) like 'ERR|42501|%'
  and pg_temp.anon($q$select fn_reserva_ip_hash()$q$) like 'ERR|42501|%'
  and pg_temp.anon($q$select fn_reserva_config_publica('clinica-a')::text$q$) like 'ERR|42501|%');

-- ============================================================ 7. Personal: quién ve qué
select pg_temp.t('R23 owner y recepción de A ven las solicitudes de A; el dentista A1 solo las suyas; el asistente ninguna',
  pg_temp.val(:OA, $q$select count(*)::text from solicitudes_cita where clinica_id = 'c1170000-0000-0000-0000-00000000000a'$q$) = '12'
  and pg_temp.val(:RA, $q$select count(*)::text from solicitudes_cita where clinica_id = 'c1170000-0000-0000-0000-00000000000a'$q$) = '12'
  and pg_temp.val(:DA1, 'select count(*)::text from solicitudes_cita where dentista_id <> auth.uid()') = '0'
  and pg_temp.val(:DA1, 'select count(*)::text from solicitudes_cita') <> '0'
  and pg_temp.val(:AA, 'select count(*)::text from solicitudes_cita') = '0');
select pg_temp.t('R24 AISLAMIENTO: el owner de B no ve solicitudes, configuración ni servicios de A (ni A los de B)',
  pg_temp.val(:OB, $q$select count(*)::text from solicitudes_cita where clinica_id = 'c1170000-0000-0000-0000-00000000000a'$q$) = '0'
  and pg_temp.val(:OB, $q$select count(*)::text from reserva_config where clinica_id = 'c1170000-0000-0000-0000-00000000000a'$q$) = '0'
  and pg_temp.val(:OB, $q$select count(*)::text from reserva_servicios where clinica_id = 'c1170000-0000-0000-0000-00000000000a'$q$) = '0'
  and pg_temp.val(:OA, $q$select count(*)::text from solicitudes_cita where clinica_id = 'c1170000-0000-0000-0000-00000000000b'$q$) = '0'
  and pg_temp.val(:OB, $q$select count(*)::text from solicitudes_cita where clinica_id = 'c1170000-0000-0000-0000-00000000000b'$q$) = '1');
select pg_temp.t('R25 AISLAMIENTO: el owner de B no puede modificar, borrar ni crear configuración/servicios de A',
  pg_temp.val(:OB, $q$with x as (update reserva_config set activa = false where clinica_id = 'c1170000-0000-0000-0000-00000000000a' returning 1) select count(*)::text from x$q$) = '0'
  and pg_temp.val(:OB, $q$with x as (delete from reserva_servicios where clinica_id = 'c1170000-0000-0000-0000-00000000000a' returning 1) select count(*)::text from x$q$) = '0'
  and pg_temp.val(:OB, $q$insert into reserva_servicios (clinica_id, nombre, duracion_min) values ('c1170000-0000-0000-0000-00000000000a', 'Intruso', 30) returning 1$q$) like 'ERR|42501|%'
  and (select activa from reserva_config where clinica_id = 'c1170000-0000-0000-0000-00000000000a'));
select pg_temp.t('R26 el owner de B no puede confirmar ni rechazar una solicitud de A (no la encuentra)',
  pg_temp.val(:OB, format('select reserva_confirmar_solicitud(%L)::text', (select id from solicitudes_cita where correo = 'laura@correo.mx'))) like 'ERR|P0001|RESERVA_SOLICITUD_NO_ENCONTRADA|%'
  and pg_temp.val(:OB, format('select reserva_rechazar_solicitud(%L)::text', (select id from solicitudes_cita where correo = 'laura@correo.mx'))) like 'ERR|P0001|RESERVA_SOLICITUD_NO_ENCONTRADA|%'
  and (select estado from solicitudes_cita where correo = 'laura@correo.mx') = 'pendiente_confirmar');
select pg_temp.t('R27 el dentista y el asistente no confirman (42501); el personal no escribe directo en solicitudes_cita',
  pg_temp.val(:DA1, format('select reserva_confirmar_solicitud(%L)::text', (select id from solicitudes_cita where correo = 'laura@correo.mx'))) like 'ERR|42501|%'
  and pg_temp.val(:AA, format('select reserva_rechazar_solicitud(%L)::text', (select id from solicitudes_cita where correo = 'laura@correo.mx'))) like 'ERR|42501|%'
  and pg_temp.val(:OA, $q$update solicitudes_cita set estado = 'confirmada' returning 1$q$) like 'ERR|42501|%');
select pg_temp.t('R28 solo el owner configura: recepción ve la configuración pero no la cambia',
  pg_temp.val(:RA, 'select slug from reserva_config') = 'clinica-a'
  and pg_temp.val(:RA, $q$with x as (update reserva_config set activa = false returning 1) select count(*)::text from x$q$) = '0'
  and pg_temp.val(:OA, $q$with x as (update reserva_config set intervalo_min = 15 returning 1) select count(*)::text from x$q$) = '1'
  and pg_temp.val(:OA, $q$insert into reserva_servicios (nombre, duracion_min) values ('Blanqueamiento', 90) returning (clinica_id = 'c1170000-0000-0000-0000-00000000000a')::text$q$) = 'true');
update reserva_config set intervalo_min = 30 where clinica_id = 'c1170000-0000-0000-0000-00000000000a';
select pg_temp.t('R29 validaciones de la configuración: slug inválido o repetido, zona horaria inexistente, horario al revés',
  pg_temp.val(:OA, $q$update reserva_config set slug = 'Con espacios!' returning 1$q$) like 'ERR|23514|%'
  and pg_temp.val(:OA, $q$update reserva_config set slug = 'clinica-b' returning 1$q$) like 'ERR|23505|%'
  and pg_temp.val(:OA, $q$update reserva_config set zona_horaria = 'Marte/Olympus' returning 1$q$) like 'ERR|23514|%'
  and pg_temp.val(:OA, $q$update reserva_config set hora_cierre = '08:00' returning 1$q$) like 'ERR|23514|%');

-- ============================================================ 8. Confirmar y rechazar
select set_config('t.cita1', pg_temp.val(:RA, format('select reserva_confirmar_solicitud(%L)::text', (select id from solicitudes_cita where correo = 'laura@correo.mx'))), true);
select pg_temp.t('R30 recepción confirma con paciente NUEVO: se crea el paciente (nombre, correo, teléfono) y la cita CONFIRMADA con su dentista',
  current_setting('t.cita1') ~ '^[0-9a-f-]{36}$'
  and (select c.estado = 'confirmada' and c.dentista_id = :DA1 and c.inicio = pg_temp.h(3,'10:00') and p.nombre_completo = 'Laura Gómez'
         and p.correo = 'laura@correo.mx' and p.clinica_id = 'c1170000-0000-0000-0000-00000000000a' and c.motivo_consulta = 'Limpieza dental' and c.tipo_consulta = 'primera_vez'
         from citas c join pacientes p on p.id = c.paciente_id where c.id = current_setting('t.cita1')::uuid)
  and (select estado = 'confirmada' and cita_id = current_setting('t.cita1')::uuid and resuelta_por = :RA and resuelta_en is not null
         from solicitudes_cita where correo = 'laura@correo.mx'));
select set_config('t.cita2', pg_temp.val(:OA, format('select reserva_confirmar_solicitud(%L, %L)::text', (select id from solicitudes_cita where correo = 'pedro@correo.mx'), 'b1170000-0000-0000-0000-00000000000a')), true);
select pg_temp.t('R31 el owner confirma vinculando un paciente EXISTENTE: no se duplica el paciente',
  (select paciente_id from citas where id = current_setting('t.cita2')::uuid) = 'b1170000-0000-0000-0000-00000000000a'
  and (select count(*) from pacientes where nombre_completo = 'Pedro Ruiz') = 0);
select pg_temp.t('R32 una solicitud ya atendida no se confirma dos veces; un paciente de otra clínica no se puede vincular',
  pg_temp.val(:OA, format('select reserva_confirmar_solicitud(%L)::text', (select id from solicitudes_cita where correo = 'laura@correo.mx'))) like 'ERR|P0001|RESERVA_SOLICITUD_RESUELTA|%'
  and pg_temp.val(:OA, format('select reserva_confirmar_solicitud(%L, %L)::text', (select id from solicitudes_cita where correo = 'repite@correo.mx' order by inicio limit 1), 'b1170000-0000-0000-0000-00000000000b')) like 'ERR|P0001|RESERVA_DATOS_INVALIDOS|%');
select pg_temp.t('R33 tras confirmar, la hora sigue ocupada por la cita (no se vuelve a ofrecer)', pg_temp.horas(pg_temp.libres(3)) = '');
select set_config('t.rech', coalesce(pg_temp.val(:RA, format('select reserva_rechazar_solicitud(%L, %L)::text', (select id from solicitudes_cita where correo = 'repite@correo.mx' and inicio = pg_temp.h(5,'09:00')), 'Sin disponibilidad del doctor')), 'ok'), true);
select pg_temp.t('R34 rechazar: queda rechazada con su motivo y la hora vuelve a ofrecerse',
  current_setting('t.rech') not like 'ERR|%'
  and (select estado = 'rechazada' and motivo_rechazo = 'Sin disponibilidad del doctor' from solicitudes_cita where correo = 'repite@correo.mx' and inicio = pg_temp.h(5,'09:00'))
  and pg_temp.horas(pg_temp.libres(5)) like '09:00,%');
-- Choque: alguien agenda a mano una cita encima del dentista de una solicitud pendiente.
insert into citas (paciente_id, dentista_id, inicio, fin, estado)
select 'b1170000-0000-0000-0000-00000000000a', dentista_id, inicio, fin, 'agendada' from solicitudes_cita where correo = 'repite@correo.mx' and inicio = pg_temp.h(5,'09:30');
select pg_temp.t('R35 si otra cita ya ocupa al dentista, confirmar da RESERVA_HORARIO_OCUPADO y la solicitud sigue pendiente (sin paciente huérfano)',
  pg_temp.val(:OA, format('select reserva_confirmar_solicitud(%L)::text', (select id from solicitudes_cita where correo = 'repite@correo.mx' and inicio = pg_temp.h(5,'09:30')))) like 'ERR|P0001|RESERVA_HORARIO_OCUPADO|%'
  and (select estado from solicitudes_cita where correo = 'repite@correo.mx' and inicio = pg_temp.h(5,'09:30')) = 'pendiente_confirmar'
  and (select count(*) from pacientes where nombre_completo = 'Laura Gómez') = 1);
update solicitudes_cita set inicio = now() - interval '2 hours', fin = now() - interval '1 hour' where correo = 'repite@correo.mx' and inicio = pg_temp.h(5,'10:00');
select pg_temp.t('R36 una solicitud cuyo horario ya pasó no se confirma (RESERVA_SOLICITUD_VENCIDA)',
  pg_temp.val(:OA, format('select reserva_confirmar_solicitud(%L)::text', (select id from solicitudes_cita where correo = 'repite@correo.mx' and fin < now()))) like 'ERR|P0001|RESERVA_SOLICITUD_VENCIDA|%');

-- ============================================================ 9. Plan y estructura
select pg_temp.t('R37 plan: reserva_en_linea en Profesional, Clínica y Empresarial (no en Esencial) y en el snapshot de la suscripción',
  (select array_agg(plan order by plan) from plan_funcionalidades where funcionalidad = 'reserva_en_linea' and habilitada) = '{clinica,empresarial,profesional}'
  and fn_funcionalidad_contratada('c1170000-0000-0000-0000-00000000000a', 'reserva_en_linea')
  and not fn_funcionalidad_contratada('c1170000-0000-0000-0000-00000000000e', 'reserva_en_linea'));
select pg_temp.t('R38 sin la funcionalidad, el owner no ve ni escribe su configuración (política plan_func_*)',
  pg_temp.val('a1170000-0000-0000-0000-000000000009', 'select count(*)::text from reserva_config') = '0'
  and pg_temp.val('a1170000-0000-0000-0000-000000000009', $q$insert into reserva_servicios (nombre, duracion_min) values ('X', 30) returning 1$q$) like 'ERR|42501|%');
select pg_temp.t('R39 las tres tablas tienen RLS, su política restrictiva sesion_activa_* y la de plan',
  (select count(*) from pg_class c where c.relname in ('reserva_config','reserva_servicios','solicitudes_cita') and c.relrowsecurity) = 3
  and (select count(*) from pg_policy p join pg_class c on c.oid = p.polrelid where c.relname in ('reserva_config','reserva_servicios','solicitudes_cita')
         and not p.polpermissive and (p.polname = 'sesion_activa_' || c.relname or p.polname = 'plan_func_' || c.relname)) = 6);
select pg_temp.t('R40 las funciones públicas son SECURITY DEFINER con search_path fijo; las internas no las ejecuta nadie de la API',
  (select bool_and(p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')) from pg_proc p
    where p.pronamespace = 'public'::regnamespace and (p.proname like 'reserva\_%' or p.proname like 'fn\_reserva\_%'))
  and (select bool_and(not has_function_privilege('anon', p.oid, 'EXECUTE') and not has_function_privilege('authenticated', p.oid, 'EXECUTE'))
         from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'fn\_reserva\_%'));

do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO 117: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 150), ' | ') from _res where not ok); end if;
end $$;
rollback;
