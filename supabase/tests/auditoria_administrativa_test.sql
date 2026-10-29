-- 120: auditoría de acciones administrativas y menos permisos para el rol anónimo. Una transacción con ROLLBACK.
\set ON_ERROR_STOP on
\set QUIET on
begin;
create temp table _res (ok boolean, nombre text);
create function pg_temp.t(p_nombre text, p_cond boolean) returns void language plpgsql as $$
begin insert into _res values (coalesce(p_cond,false), p_nombre); raise notice '% %', case when coalesce(p_cond,false) then 'PASS' else 'FAIL' end, p_nombre; end $$;
create function pg_temp.como(p_uid uuid, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin execute p_sql into v; reset role; return coalesce(v, 'ok');
  exception when others then reset role; return 'ERR|'||sqlstate; end;
end $$;
create function pg_temp.anon(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin execute p_sql into v; reset role; return coalesce(v, 'ok');
  exception when others then reset role; return 'ERR|'||sqlstate; end;
end $$;
grant select on _res to authenticated, anon;

insert into auth.users (id, email) values ('a1200000-0000-0000-0000-000000000001', 'o120@x.mx');
insert into clinicas (id, nombre) values ('c1200000-0000-0000-0000-00000000000a', 'Clínica 120');
select fn_asignar_plan_interno(null, 'c1200000-0000-0000-0000-00000000000a', 'empresarial', 'mensual');
insert into usuarios (id, clinica_id, nombre, correo, rol) values
 ('a1200000-0000-0000-0000-000000000001', 'c1200000-0000-0000-0000-00000000000a', 'Owner 120', 'o120@x.mx', 'owner');

\set OW '\'a1200000-0000-0000-0000-000000000001\''

select pg_temp.como(:OW, $q$insert into catalogo_tratamientos (clinica_id, nombre, precio) values ('c1200000-0000-0000-0000-00000000000a', 'Resina', 900) returning 'ok'$q$);
select pg_temp.t('alta en el catálogo queda en la auditoría de SU clínica, con quién la hizo',
  exists (select 1 from auditoria where accion = 'crear_catalogo_tratamientos' and usuario_id = 'a1200000-0000-0000-0000-000000000001' and clinica_id = 'c1200000-0000-0000-0000-00000000000a'));
select pg_temp.como(:OW, $q$update catalogo_tratamientos set precio = 950 where nombre = 'Resina' returning 'ok'$q$);
select pg_temp.t('cambio de precio queda auditado', exists (select 1 from auditoria where accion = 'editar_catalogo_tratamientos' and (detalle->>'precio')::numeric = 950));
select pg_temp.t('un UPDATE sin cambios no se audita',
  (select count(*) from auditoria where accion = 'editar_catalogo_tratamientos') = 1
  and pg_temp.como(:OW, $q$update catalogo_tratamientos set precio = 950 where nombre = 'Resina' returning 'ok'$q$) = 'ok'
  and (select count(*) from auditoria where accion = 'editar_catalogo_tratamientos') = 1);
select pg_temp.como(:OW, $q$update clinicas set rfc = 'ABC010203XY1' where id = 'c1200000-0000-0000-0000-00000000000a' returning 'ok'$q$);
select pg_temp.t('cambio de los datos de la clínica (RFC) queda auditado', exists (select 1 from auditoria where accion = 'editar_clinicas' and detalle->>'rfc' = 'ABC010203XY1'));
update clinicas set siguiente_folio_paciente = coalesce(siguiente_folio_paciente, 0) + 1 where id = 'c1200000-0000-0000-0000-00000000000a';
select pg_temp.t('lo que hace el sistema (folios, sin usuario) no se audita',
  (select count(*) from auditoria where accion = 'editar_clinicas') = 1);
select pg_temp.como(:OW, $q$insert into reserva_config (clinica_id, activa, slug) values ('c1200000-0000-0000-0000-00000000000a', true, 'clinica-ciento-veinte') returning 'ok'$q$);
select pg_temp.t('reserva_config (sin columna id) se audita con la clínica como registro',
  exists (select 1 from auditoria where accion = 'crear_reserva_config' and entidad_id = 'c1200000-0000-0000-0000-00000000000a'));
select pg_temp.t('el owner ve esas filas en su auditoría',
  pg_temp.como(:OW, $q$select count(*)::text from auditoria where entidad in ('catalogo_tratamientos', 'clinicas', 'reserva_config')$q$)::int >= 4);

select pg_temp.t('anon ya no puede leer pacientes', pg_temp.anon($q$select count(*)::text from pacientes$q$) = 'ERR|42501');
select pg_temp.t('anon ya no puede leer usuarios', pg_temp.anon($q$select count(*)::text from usuarios$q$) = 'ERR|42501');
select pg_temp.t('anon ya no puede leer v_pacientes_seguro', pg_temp.anon($q$select count(*)::text from v_pacientes_seguro$q$) = 'ERR|42501');
select pg_temp.t('anon sigue leyendo los documentos legales', pg_temp.anon($q$select count(*)::text from legal_documents$q$) not like 'ERR|%');
select pg_temp.t('anon conserva INSERT en arco_solicitudes y mensajes_contacto',
  has_table_privilege('anon', 'arco_solicitudes', 'insert') and has_table_privilege('anon', 'mensajes_contacto', 'insert'));
select pg_temp.t('anon ya no puede insertar pacientes', not has_table_privilege('anon', 'pacientes', 'insert'));

do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO 120: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 150), ' | ') from _res where not ok); end if;
end $$;
rollback;
