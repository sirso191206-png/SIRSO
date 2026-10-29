-- 119: recepción ve apellidos, sexo y tutor; puede registrar el tutor de un menor; lo clínico sigue cerrado. Precios y
-- costos no negativos. Una transacción con ROLLBACK.
\set ON_ERROR_STOP on
\set QUIET on
begin;
create temp table _res (ok boolean, nombre text);
create function pg_temp.t(p_nombre text, p_cond boolean) returns void language plpgsql as $$
begin insert into _res values (coalesce(p_cond,false), p_nombre); raise notice '% %', case when coalesce(p_cond,false) then 'PASS' else 'FAIL' end, p_nombre; end $$;
create function pg_temp.val(p_uid uuid, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin execute p_sql into v; reset role; return v;
  exception when others then reset role; return 'ERR|'||sqlstate||'|'||sqlerrm; end;
end $$;
grant select on _res to authenticated;

insert into auth.users (id, email) select ('a1190000-0000-0000-0000-0000000000'||lpad(g::text,2,'0'))::uuid, 'r'||g||'@x.mx' from generate_series(1,4) g;
insert into clinicas (id, nombre) values ('c1190000-0000-0000-0000-00000000000a', 'Clínica 119');
select fn_asignar_plan_interno(null, 'c1190000-0000-0000-0000-00000000000a', 'empresarial', 'mensual');
insert into usuarios (id, clinica_id, nombre, correo, rol) values
 ('a1190000-0000-0000-0000-000000000001', 'c1190000-0000-0000-0000-00000000000a', 'Owner', 'r1@x.mx', 'owner'),
 ('a1190000-0000-0000-0000-000000000002', 'c1190000-0000-0000-0000-00000000000a', 'Dentista', 'r2@x.mx', 'dentista'),
 ('a1190000-0000-0000-0000-000000000003', 'c1190000-0000-0000-0000-00000000000a', 'Recepción', 'r3@x.mx', 'recepcion'),
 ('a1190000-0000-0000-0000-000000000004', 'c1190000-0000-0000-0000-00000000000a', 'Asistente', 'r4@x.mx', 'asistente');
insert into pacientes (id, clinica_id, nombre_completo, primer_apellido, segundo_apellido, sexo, curp, dentista_responsable_id, fecha_nacimiento)
values ('b1190000-0000-0000-0000-000000000001', 'c1190000-0000-0000-0000-00000000000a', 'Diego', 'Martínez', 'Luna', 'M', 'MALD150312HDFRNG09',
        'a1190000-0000-0000-0000-000000000002', '2015-03-12');

\set RE '\'a1190000-0000-0000-0000-000000000003\''
\set AS '\'a1190000-0000-0000-0000-000000000004\''
\set PAC '\'b1190000-0000-0000-0000-000000000001\''

select pg_temp.t('recepción ve primer y segundo apellido en v_pacientes_seguro',
  pg_temp.val(:RE, $q$select primer_apellido||' '||segundo_apellido from v_pacientes_seguro where id = 'b1190000-0000-0000-0000-000000000001'$q$) = 'Martínez Luna');
select pg_temp.t('recepción ve el sexo', pg_temp.val(:RE, $q$select sexo from v_pacientes_seguro where id = 'b1190000-0000-0000-0000-000000000001'$q$) = 'M');
select pg_temp.t('recepción sigue SIN ver la CURP', pg_temp.val(:RE, $q$select coalesce(curp, 'oculta') from v_pacientes_seguro where id = 'b1190000-0000-0000-0000-000000000001'$q$) = 'oculta');
select pg_temp.t('un asistente no asignado sigue sin ver los apellidos',
  pg_temp.val(:AS, $q$select coalesce(primer_apellido, 'oculto') from v_pacientes_seguro where id = 'b1190000-0000-0000-0000-000000000001'$q$) in ('oculto') or
  pg_temp.val(:AS, $q$select count(*)::text from v_pacientes_seguro where id = 'b1190000-0000-0000-0000-000000000001'$q$) = '0');

select pg_temp.t('recepción registra el tutor de un menor',
  pg_temp.val(:RE, $q$update pacientes set tutor_legal = '{"nombre":"Patricia Luna","parentesco":"Madre","telefono":"5512345678"}' where id = 'b1190000-0000-0000-0000-000000000001' returning tutor_legal->>'nombre'$q$) = 'Patricia Luna');
select pg_temp.t('recepción ve el tutor registrado',
  pg_temp.val(:RE, $q$select tutor_legal->>'parentesco' from v_pacientes_seguro where id = 'b1190000-0000-0000-0000-000000000001'$q$) = 'Madre');
select pg_temp.t('recepción sigue sin poder cambiar datos no administrativos (estado civil)',
  pg_temp.val(:RE, $q$update pacientes set estado_civil = 'casado' where id = 'b1190000-0000-0000-0000-000000000001' returning 'ok'$q$) like 'ERR|%');
select pg_temp.t('un asistente sigue sin poder cambiar el tutor',
  pg_temp.val(:AS, $q$update pacientes set tutor_legal = '{"nombre":"X"}' where id = 'b1190000-0000-0000-0000-000000000001' returning 'ok'$q$) is distinct from 'ok');

select pg_temp.t('el catálogo rechaza un precio negativo', pg_temp.val('a1190000-0000-0000-0000-000000000001',
  $q$insert into catalogo_tratamientos (clinica_id, nombre, precio) values ('c1190000-0000-0000-0000-00000000000a', 'Limpieza', -100) returning 'ok'$q$) like 'ERR|23514%');
select pg_temp.t('un tratamiento rechaza un costo negativo', pg_temp.val('a1190000-0000-0000-0000-000000000002',
  $q$insert into tratamientos (paciente_id, descripcion, costo) values ('b1190000-0000-0000-0000-000000000001', 'Resina', -1) returning 'ok'$q$) like 'ERR|23514%');
select pg_temp.t('precio 0 sí se acepta (cortesía)', pg_temp.val('a1190000-0000-0000-0000-000000000001',
  $q$insert into catalogo_tratamientos (clinica_id, nombre, precio) values ('c1190000-0000-0000-0000-00000000000a', 'Valoración', 0) returning 'ok'$q$) = 'ok');

do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO 119: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 150), ' | ') from _res where not ok); end if;
end $$;
rollback;
