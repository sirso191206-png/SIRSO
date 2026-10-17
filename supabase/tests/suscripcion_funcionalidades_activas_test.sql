-- Migración 113: sa_suscripcion_de_clinica solo devuelve funcionalidades ACTIVAS (el panel del superadmin ya no reenvía «roles» desactivado).
-- Sin -v fase usa «despues» (con la 113). Con -v fase=antes reproduce el fallo previo (base sin la 113).
\set ON_ERROR_STOP on
\set QUIET on
begin;
create temp table _res (ok boolean, nombre text);
create function pg_temp.t(p_nombre text, p_cond boolean) returns void language plpgsql as $$
begin insert into _res values (coalesce(p_cond,false), p_nombre); raise notice '% %', case when coalesce(p_cond,false) then 'PASS' else 'FAIL' end, p_nombre; end $$;
-- Ejecuta p_sql como el usuario indicado (rol authenticated) y devuelve el valor o 'ERR|sqlstate|mensaje'
create function pg_temp.val(p_uid uuid, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin execute p_sql into v; reset role; return v;
  exception when others then reset role; return 'ERR|' || sqlstate || '|' || sqlerrm; end;
end $$;

insert into auth.users (id, email) select ('a9000000-0000-0000-0000-0000000000'||lpad(g::text,2,'0'))::uuid, 'sus_'||g||'@x.mx' from generate_series(1,3) g;
insert into clinicas (id, nombre) values ('c9000000-0000-0000-0000-00000000000a','Plataforma'),('c9000000-0000-0000-0000-00000000000b','Clínica X');
select fn_asignar_plan_interno(null, c, 'empresarial', 'mensual') from unnest(array['c9000000-0000-0000-0000-00000000000a','c9000000-0000-0000-0000-00000000000b']::uuid[]) c;
insert into usuarios (id, clinica_id, nombre, correo, rol, es_super_admin) values
 ('a9000000-0000-0000-0000-000000000001','c9000000-0000-0000-0000-00000000000a','Superadmin','sus_1@x.mx','owner',true),
 ('a9000000-0000-0000-0000-000000000002','c9000000-0000-0000-0000-00000000000b','Owner X','sus_2@x.mx','owner',false);
-- Reproduce producción: la suscripción vigente de X conserva filas de funcionalidades que la 082 desactivó en el catálogo
insert into suscripcion_funcionalidades (suscripcion_id, funcionalidad, habilitada)
select fn_suscripcion_vigente('c9000000-0000-0000-0000-00000000000b'), c, true from unnest(array['roles','administracion_avanzada']) c
on conflict (suscripcion_id, funcionalidad) do update set habilitada = true;
select pg_temp.t('escenario: roles desactivado en el catálogo y presente en la suscripción de X',
  (select not activo from funcionalidades where codigo = 'roles')
  and exists (select 1 from suscripcion_funcionalidades where suscripcion_id = fn_suscripcion_vigente('c9000000-0000-0000-0000-00000000000b') and funcionalidad = 'roles'));

-- Lo que hace el panel (PanelSuscripcionClinica.jsx:191): todas las funcionalidades NO núcleo que devuelve sa_suscripcion_de_clinica → mapa codigo:habilitada
create temp table _vista as select pg_temp.val('a9000000-0000-0000-0000-000000000001', $q$select sa_suscripcion_de_clinica('c9000000-0000-0000-0000-00000000000b')::text$q$)::jsonb v;
create temp table _mapa as select coalesce(jsonb_object_agg(f->>'codigo', (f->>'habilitada')::boolean), '{}'::jsonb) m
  from _vista, jsonb_array_elements(v->'vigente'->'funcionalidades') f where not (f->>'nucleo')::boolean;
create temp table _ajuste as select pg_temp.val('a9000000-0000-0000-0000-000000000001',
  format('select sa_ajustar_condiciones_clinica(%L, null, %L::jsonb)::text', 'c9000000-0000-0000-0000-00000000000b', (select m from _mapa))) r;

\if :{?fase}
\else
\set fase despues
\endif
select :'fase' = 'antes' as es_antes \gset
\if :es_antes
select pg_temp.t('ANTES (sin parche): la vista devuelve roles', (select (select m from _mapa) ? 'roles'));
select pg_temp.t('ANTES (sin parche): el ajuste desde el panel se rechaza con «roles … desactivada» (reproduce el fallo)', (select r like 'ERR|P0001|La funcionalidad "%" no existe o está desactivada.' from _ajuste));
\else
select pg_temp.t('la vista ya NO devuelve funcionalidades desactivadas (roles, administracion_avanzada)', (select not ((select m from _mapa) ? 'roles') and not ((select m from _mapa) ? 'administracion_avanzada')));
select pg_temp.t('la vista sigue devolviendo todas las funcionalidades ACTIVAS de la suscripción',
  (select jsonb_array_length(v->'vigente'->'funcionalidades') from _vista) =
  (select count(*) from suscripcion_funcionalidades sf join funcionalidades f on f.codigo = sf.funcionalidad where sf.suscripcion_id = fn_suscripcion_vigente('c9000000-0000-0000-0000-00000000000b') and f.activo));
select pg_temp.t('el ajuste desde el panel ahora se aplica (sin error)', (select r not like 'ERR|%' from _ajuste));
create temp table _k as select e.key k from _mapa, jsonb_each(m) e where e.value = 'true'::jsonb order by e.key limit 1;
create temp table _r2 as select pg_temp.val('a9000000-0000-0000-0000-000000000001', format('select sa_ajustar_condiciones_clinica(%L, null, %L::jsonb)::text', 'c9000000-0000-0000-0000-00000000000b', jsonb_build_object((select k from _k), false))) r;
-- (comprobación en una sentencia APARTE: la instantánea de una sentencia no ve lo que escribe la función llamada dentro de ella)
select pg_temp.t('desactivar una funcionalidad activa no núcleo (tomada de la propia vista) sí se aplica',
  (select k from _k) is not null and (select r not like 'ERR|%' from _r2)
  and (select not habilitada from suscripcion_funcionalidades where suscripcion_id = fn_suscripcion_vigente('c9000000-0000-0000-0000-00000000000b') and funcionalidad = (select k from _k)));
select pg_temp.t('la fila de roles en la suscripción NO se tocó (sigue habilitada=true: no se modifican datos)',
  (select habilitada from suscripcion_funcionalidades where suscripcion_id = fn_suscripcion_vigente('c9000000-0000-0000-0000-00000000000b') and funcionalidad = 'roles'));
select pg_temp.t('la validación del RPC se mantiene: enviar roles explícitamente sigue rechazándose',
  pg_temp.val('a9000000-0000-0000-0000-000000000001', format('select sa_ajustar_condiciones_clinica(%L, null, %L::jsonb)::text', 'c9000000-0000-0000-0000-00000000000b', '{"roles": true}')) like 'ERR|P0001|La funcionalidad "roles"%');
select pg_temp.t('un owner (no superadmin) sigue sin poder leer la vista (42501)',
  pg_temp.val('a9000000-0000-0000-0000-000000000002', $q$select sa_suscripcion_de_clinica('c9000000-0000-0000-0000-00000000000b')::text$q$) like 'ERR|42501|%');
select pg_temp.t('mi_suscripcion (vista de la clínica) sin cambios: tampoco muestra roles',
  not (pg_temp.val('a9000000-0000-0000-0000-000000000002', 'select mi_suscripcion()::text')::jsonb -> 'funcionalidades') @> '[{"codigo": "roles"}]');
\endif

do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO 113: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 150), ' | ') from _res where not ok); end if;
end $$;
rollback;
