-- 121 + 122: datos privados por columna, CURP de pacientes, saldo con cargos reales, teléfonos, búsqueda sin acentos y
-- planes públicos. Todo contra PostgreSQL real con los roles authenticated/anon y RLS. Una transacción con ROLLBACK.
\set ON_ERROR_STOP on
\set QUIET on
begin;
create temp table _res (ok boolean, nombre text);
create function pg_temp.t(p_nombre text, p_cond boolean) returns void language plpgsql as $$
begin insert into _res values (coalesce(p_cond,false), p_nombre); raise notice '% %', case when coalesce(p_cond,false) then 'PASS' else 'FAIL' end, p_nombre; end $$;
-- Ejecuta como un usuario autenticado y devuelve el primer valor (o ERR|sqlstate).
create function pg_temp.como(p_uid uuid, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin execute p_sql into v; reset role; return coalesce(v, 'NULL');
  exception when others then reset role; return 'ERR|'||sqlstate; end;
end $$;
create function pg_temp.anon(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin execute p_sql into v; reset role; return coalesce(v, 'NULL');
  exception when others then reset role; return 'ERR|'||sqlstate; end;
end $$;
grant select on _res to authenticated, anon;

insert into auth.users (id, email) select ('a1210000-0000-0000-0000-0000000000'||lpad(g::text,2,'0'))::uuid, 'p'||g||'@x.mx' from generate_series(1,5) g;
insert into clinicas (id, nombre) values ('c1210000-0000-0000-0000-00000000000a', 'Clínica 121'), ('c1210000-0000-0000-0000-00000000000b', 'Otra 121');
select fn_asignar_plan_interno(null, 'c1210000-0000-0000-0000-00000000000a', 'empresarial', 'mensual'), fn_asignar_plan_interno(null, 'c1210000-0000-0000-0000-00000000000b', 'empresarial', 'mensual');
insert into usuarios (id, clinica_id, nombre, correo, rol, curp, rfc, firma_png) values
 ('a1210000-0000-0000-0000-000000000001', 'c1210000-0000-0000-0000-00000000000a', 'Owner', 'p1@x.mx', 'owner', 'OWNC800101HDFXXX01', 'OWNC800101AB1', 'data:image/png;base64,AAAA'),
 ('a1210000-0000-0000-0000-000000000002', 'c1210000-0000-0000-0000-00000000000a', 'Dentista', 'p2@x.mx', 'dentista', 'DENT800101HDFXXX02', 'DENT800101AB2', 'data:image/png;base64,BBBB'),
 ('a1210000-0000-0000-0000-000000000003', 'c1210000-0000-0000-0000-00000000000a', 'Recepción', 'p3@x.mx', 'recepcion', 'RECE800101MDFXXX03', 'RECE800101AB3', null),
 ('a1210000-0000-0000-0000-000000000004', 'c1210000-0000-0000-0000-00000000000a', 'Asistente', 'p4@x.mx', 'asistente', null, null, null),
 ('a1210000-0000-0000-0000-000000000005', 'c1210000-0000-0000-0000-00000000000b', 'Owner B', 'p5@x.mx', 'owner', null, 'OWNB800101AB5', null);
\set OW '\'a1210000-0000-0000-0000-000000000001\''
\set DE '\'a1210000-0000-0000-0000-000000000002\''
\set RE '\'a1210000-0000-0000-0000-000000000003\''
\set AS '\'a1210000-0000-0000-0000-000000000004\''
\set OB '\'a1210000-0000-0000-0000-000000000005\''
insert into pacientes (id, clinica_id, nombre_completo, primer_apellido, curp, dentista_responsable_id, telefono, tutor_legal)
values ('b1210000-0000-0000-0000-000000000001', 'c1210000-0000-0000-0000-00000000000a', 'José García', 'Rodríguez', 'GARJ900101HDFXXX09',
        'a1210000-0000-0000-0000-000000000002', '55 1234 5678', '{"nombre":"Mamá","telefono":"55-8765-4321"}');

-- ===== Privacidad del equipo (121) =====
select pg_temp.t('recepción NO lee CURP, RFC ni firma de compañeros (permiso por columna)',
  pg_temp.como(:RE, $q$select curp from usuarios where id = 'a1210000-0000-0000-0000-000000000002'$q$) = 'ERR|42501'
  and pg_temp.como(:RE, $q$select rfc from usuarios where id = 'a1210000-0000-0000-0000-000000000002'$q$) = 'ERR|42501'
  and pg_temp.como(:RE, $q$select firma_png from usuarios where id = 'a1210000-0000-0000-0000-000000000002'$q$) = 'ERR|42501');
select pg_temp.t('ni filtrando por la columna (select id where rfc = …) ni con select *',
  pg_temp.como(:RE, $q$select id::text from usuarios where rfc = 'DENT800101AB2'$q$) = 'ERR|42501'
  and pg_temp.como(:RE, $q$select count(*)::text from (select * from usuarios) x$q$) = 'ERR|42501');
select pg_temp.t('el dentista tampoco lee los datos privados de compañeros',
  pg_temp.como(:DE, $q$select rfc from usuarios where id = 'a1210000-0000-0000-0000-000000000001'$q$) = 'ERR|42501');
select pg_temp.t('recepción sigue leyendo lo necesario del equipo (nombre, rol, cédula)',
  pg_temp.como(:RE, $q$select string_agg(nombre, ',' order by nombre) from usuarios$q$) = 'Asistente,Dentista,Owner,Recepción');
select pg_temp.t('cada quien ve SU propia CURP/RFC/firma con mi_perfil_privado()',
  pg_temp.como(:DE, $q$select rfc || '|' || (firma_png is not null)::text from mi_perfil_privado()$q$) = 'DENT800101AB2|true'
  and pg_temp.como(:RE, $q$select count(*)::text from mi_perfil_privado()$q$) = '1');
select pg_temp.t('el propietario recibe RFC/CURP de SU equipo (no la firma) con datos_privados_equipo()',
  pg_temp.como(:OW, $q$select count(*)::text from datos_privados_equipo()$q$) = '4'
  and pg_temp.como(:OW, $q$select rfc from datos_privados_equipo() where id = 'a1210000-0000-0000-0000-000000000003'$q$) = 'RECE800101AB3');
select pg_temp.t('datos_privados_equipo() no devuelve nada a recepción, dentista ni asistente',
  pg_temp.como(:RE, $q$select count(*)::text from datos_privados_equipo()$q$) = '0'
  and pg_temp.como(:DE, $q$select count(*)::text from datos_privados_equipo()$q$) = '0'
  and pg_temp.como(:AS, $q$select count(*)::text from datos_privados_equipo()$q$) = '0');
select pg_temp.t('el propietario de OTRA clínica no recibe datos de esta',
  pg_temp.como(:OB, $q$select count(*)::text from datos_privados_equipo() where id = 'a1210000-0000-0000-0000-000000000002'$q$) = '0');
select pg_temp.t('anon no puede usar las funciones privadas',
  pg_temp.anon($q$select count(*)::text from mi_perfil_privado()$q$) = 'ERR|42501'
  and pg_temp.anon($q$select count(*)::text from datos_privados_equipo()$q$) = 'ERR|42501');

-- ===== CURP de pacientes (121) =====
select pg_temp.t('recepción NO lee la CURP en la tabla pacientes ni puede filtrar por ella',
  pg_temp.como(:RE, $q$select curp from pacientes where id = 'b1210000-0000-0000-0000-000000000001'$q$) = 'ERR|42501'
  and pg_temp.como(:RE, $q$select id::text from pacientes where curp = 'GARJ900101HDFXXX09'$q$) = 'ERR|42501');
select pg_temp.t('en v_pacientes_seguro recepción ve la CURP vacía; el owner y el dentista asignado la ven',
  pg_temp.como(:RE, $q$select curp from v_pacientes_seguro where id = 'b1210000-0000-0000-0000-000000000001'$q$) = 'NULL'
  and pg_temp.como(:OW, $q$select curp from v_pacientes_seguro where id = 'b1210000-0000-0000-0000-000000000001'$q$) = 'GARJ900101HDFXXX09'
  and pg_temp.como(:DE, $q$select curp from v_pacientes_seguro where id = 'b1210000-0000-0000-0000-000000000001'$q$) = 'GARJ900101HDFXXX09');
select pg_temp.t('recepción NO puede modificar la CURP (ni escribiéndola directo)',
  pg_temp.como(:RE, $q$update pacientes set curp = 'XXXX900101HDFXXX01' where id = 'b1210000-0000-0000-0000-000000000001' returning 'ok'$q$) like 'ERR|%'
  and (select curp from pacientes where id = 'b1210000-0000-0000-0000-000000000001') = 'GARJ900101HDFXXX09');
select pg_temp.t('recepción sigue editando datos administrativos (teléfono) del paciente',
  pg_temp.como(:RE, $q$update pacientes set correo = 'jose@x.mx' where id = 'b1210000-0000-0000-0000-000000000001' returning 'ok'$q$) = 'ok');
select pg_temp.t('recepción puede saber si ya existe un paciente con una CURP (sin recibir la CURP)',
  pg_temp.como(:RE, $q$select nombre_completo from fn_paciente_por_curp('garj900101hdfxxx09')$q$) = 'José García');
select pg_temp.t('la búsqueda por CURP no cruza clínicas',
  pg_temp.como(:OB, $q$select count(*)::text from fn_paciente_por_curp('GARJ900101HDFXXX09')$q$) = '0');
select pg_temp.t('recepción puede dar de alta un paciente CON CURP (captura inicial)',
  pg_temp.como(:RE, $q$insert into pacientes (clinica_id, nombre_completo, curp) values ('c1210000-0000-0000-0000-00000000000a', 'Nuevo', 'NUEV900101HDFXXX01') returning 'ok'$q$) = 'ok');
select pg_temp.t('el owner edita la CURP con normalidad',
  pg_temp.como(:OW, $q$update pacientes set curp = 'GARJ900101HDFXXX10' where id = 'b1210000-0000-0000-0000-000000000001' returning 'ok'$q$) = 'ok');

-- ===== Saldo (122) =====
insert into tratamientos (paciente_id, descripcion, costo, descuento, estado) values
  ('b1210000-0000-0000-0000-000000000001', 'Planeado', 1000, 0, 'planeado'),
  ('b1210000-0000-0000-0000-000000000001', 'Cancelado', 700, 0, 'cancelado');
select pg_temp.t('solo planeados y cancelados: SIN deuda; lo planeado sale como presupuesto',
  (select total_tratamientos = 0 and saldo = 0 and total_presupuestado = 1000 from v_saldo_pacientes where paciente_id = 'b1210000-0000-0000-0000-000000000001'));
insert into tratamientos (paciente_id, descripcion, costo, descuento, estado) values
  ('b1210000-0000-0000-0000-000000000001', 'Aceptado', 1000, 100, 'aceptado'),
  ('b1210000-0000-0000-0000-000000000001', 'Realizado', 500, 0, 'completado');
select pg_temp.t('aceptado y realizado SÍ son cargo, con su descuento: 900 + 500 = 1400',
  (select total_tratamientos = 1400 and saldo = 1400 from v_saldo_pacientes where paciente_id = 'b1210000-0000-0000-0000-000000000001'));
insert into pagos (paciente_id, monto, metodo, tipo) values ('b1210000-0000-0000-0000-000000000001', 400, 'efectivo', 'pago');
select pg_temp.t('pago parcial reduce el saldo (1400 − 400 = 1000)',
  (select saldo = 1000 and total_pagado = 400 from v_saldo_pacientes where paciente_id = 'b1210000-0000-0000-0000-000000000001'));
insert into pagos (paciente_id, monto, metodo, tipo) values ('b1210000-0000-0000-0000-000000000001', 1000, 'tarjeta', 'pago');
select pg_temp.t('pago completo deja el saldo en 0',
  (select saldo = 0 from v_saldo_pacientes where paciente_id = 'b1210000-0000-0000-0000-000000000001'));
update pagos set anulado_en = now(), motivo_anulacion = 'error' where monto = 1000 and paciente_id = 'b1210000-0000-0000-0000-000000000001';
select pg_temp.t('un pago anulado deja de contar (vuelve a deber 1000)',
  (select saldo = 1000 from v_saldo_pacientes where paciente_id = 'b1210000-0000-0000-0000-000000000001'));
update tratamientos set estado = 'aceptado' where descripcion = 'Planeado' and paciente_id = 'b1210000-0000-0000-0000-000000000001';
select pg_temp.t('al ACEPTAR lo planeado se vuelve cargo (saldo 2000, presupuesto 0)',
  (select saldo = 2000 and total_presupuestado = 0 from v_saldo_pacientes where paciente_id = 'b1210000-0000-0000-0000-000000000001'));
select pg_temp.t('ningún registro histórico cambió: los tratamientos y pagos siguen igual (solo cambia el cálculo)',
  (select count(*) = 4 from tratamientos where paciente_id = 'b1210000-0000-0000-0000-000000000001')
  and (select count(*) = 2 from pagos where paciente_id = 'b1210000-0000-0000-0000-000000000001'));
select pg_temp.t('recepción ve el saldo (vista con los permisos de quien consulta)',
  pg_temp.como(:RE, $q$select saldo::int::text from v_saldo_pacientes where paciente_id = 'b1210000-0000-0000-0000-000000000001'$q$) = '2000');

-- ===== Teléfonos (122) =====
select pg_temp.t('normaliza separadores y conserva el prefijo internacional',
  fn_normalizar_telefono('55 1234 5678') = '5512345678'
  and fn_normalizar_telefono('+52 (55) 1234-5678') = '+525512345678'
  and fn_normalizar_telefono('+1 415.555.0100') = '+14155550100');
select pg_temp.t('lo ambiguo no se toca: letras, extensiones, muy corto o muy largo',
  fn_normalizar_telefono('55-12ab') = '55-12ab' and fn_normalizar_telefono('55 1234 5678 ext 12') = '55 1234 5678 ext 12'
  and fn_normalizar_telefono('1234') = '1234' and fn_normalizar_telefono('1234567890123456') = '1234567890123456');
select pg_temp.t('al guardar se normaliza (también dentro del tutor)',
  (select telefono = '5512345678' and tutor_legal->>'telefono' = '5587654321' from pacientes where id = 'b1210000-0000-0000-0000-000000000001'));
select pg_temp.t('recepción edita el teléfono y queda normalizado',
  pg_temp.como(:RE, $q$update pacientes set telefono = '+44 20 7946 0958' where id = 'b1210000-0000-0000-0000-000000000001' returning telefono$q$) = '+442079460958');
insert into pacientes (clinica_id, nombre_completo, telefono) values ('c1210000-0000-0000-0000-00000000000a', 'Teléfono raro', '55-12ab');
select pg_temp.t('lo ambiguo aparece en v_telefonos_por_revisar para el owner (y no para otra clínica)',
  pg_temp.como(:OW, $q$select count(*)::text from v_telefonos_por_revisar where valor = '55-12ab'$q$) = '1'
  and pg_temp.como(:OB, $q$select count(*)::text from v_telefonos_por_revisar where valor = '55-12ab'$q$) = '0');

-- ===== Búsqueda sin acentos (122) =====
select pg_temp.t('«jose garcia rodriguez» encuentra a «José García Rodríguez» (busqueda generada, el original no cambia)',
  (select nombre_completo = 'José García' and busqueda like '%jose garcia rodriguez%' from pacientes where id = 'b1210000-0000-0000-0000-000000000001'));
select pg_temp.t('recepción busca sin acentos en v_pacientes_seguro',
  pg_temp.como(:RE, $q$select nombre_completo from v_pacientes_seguro where busqueda ilike '%rodriguez%'$q$) = 'José García');
select pg_temp.t('con o sin acentos da el mismo resultado',
  pg_temp.como(:OW, $q$select count(*)::text from v_pacientes_seguro where busqueda ilike '%' || fn_sin_acentos('GARCÍA') || '%'$q$)
  = pg_temp.como(:OW, $q$select count(*)::text from v_pacientes_seguro where busqueda ilike '%garcia%'$q$));
select pg_temp.t('la búsqueda no cruza clínicas',
  pg_temp.como(:OB, $q$select count(*)::text from v_pacientes_seguro where busqueda ilike '%garcia%'$q$) = '0');

-- ===== Planes públicos (122) =====
select pg_temp.t('anon ve los planes activos y visibles con precio y funcionalidades',
  pg_temp.anon($q$select count(*)::text from planes_publicos() where precio_mensual > 0 and cardinality(funcionalidades) > 0$q$)::int >= 1);
select pg_temp.t('anon sigue sin acceso a planes_catalogo (ids de Stripe, configuración)',
  pg_temp.anon($q$select count(*)::text from planes_catalogo$q$) like 'ERR|%');

do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO 121-122: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 150), ' | ') from _res where not ok); end if;
end $$;
rollback;
