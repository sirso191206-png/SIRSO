-- 123: el superadmin ve y puede activar las funcionalidades nuevas en una clínica cuya suscripción no tiene fila para
-- ellas (clínica «vieja»). Una transacción con ROLLBACK.
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
  exception when others then reset role; return 'ERR|' || sqlstate; end;
end $$;
grant select on _res to authenticated;

insert into auth.users (id, email) values ('a1230000-0000-0000-0000-000000000001', 'sa123@x.mx'), ('a1230000-0000-0000-0000-000000000002', 'ow123@x.mx');
insert into clinicas (id, nombre) values ('c1230000-0000-0000-0000-0000000000aa', 'Plataforma 123'), ('c1230000-0000-0000-0000-0000000000bb', 'Betty 123');
select fn_asignar_plan_interno(null, 'c1230000-0000-0000-0000-0000000000aa', 'empresarial', 'mensual'),
       fn_asignar_plan_interno(null, 'c1230000-0000-0000-0000-0000000000bb', 'esencial', 'mensual');
insert into usuarios (id, clinica_id, nombre, correo, rol, es_super_admin) values
 ('a1230000-0000-0000-0000-000000000001', 'c1230000-0000-0000-0000-0000000000aa', 'Superadmin', 'sa123@x.mx', 'owner', true),
 ('a1230000-0000-0000-0000-000000000002', 'c1230000-0000-0000-0000-0000000000bb', 'Owner Betty', 'ow123@x.mx', 'owner', false);
-- Clínica vieja: sin filas de reserva ni inventario.
delete from suscripcion_funcionalidades where funcionalidad in ('reserva_en_linea', 'inventario')
  and suscripcion_id = fn_suscripcion_vigente('c1230000-0000-0000-0000-0000000000bb');
\set SA '\'a1230000-0000-0000-0000-000000000001\''
\set OW '\'a1230000-0000-0000-0000-000000000002\''

create temp table _panel as select pg_temp.val(:SA, $q$select sa_suscripcion_de_clinica('c1230000-0000-0000-0000-0000000000bb')::text$q$)::jsonb v;
select pg_temp.t('el panel del superadmin LISTA la reserva y el inventario aunque la suscripción no tenga fila (apagados)',
  (select count(*) from _panel, jsonb_array_elements(v->'vigente'->'funcionalidades') f
    where f->>'codigo' in ('reserva_en_linea', 'inventario') and (f->>'habilitada')::boolean = false) = 2);
select pg_temp.t('el panel lista todas las funcionalidades activas del catálogo',
  (select jsonb_array_length(v->'vigente'->'funcionalidades') from _panel) = (select count(*) from funcionalidades where activo));
select pg_temp.t('antes de activarla la clínica NO tiene reserva en línea',
  not fn_funcionalidad_contratada('c1230000-0000-0000-0000-0000000000bb', 'reserva_en_linea'));
select pg_temp.t('el superadmin la activa con «Ajustar condiciones»',
  pg_temp.val(:SA, $q$select sa_ajustar_condiciones_clinica('c1230000-0000-0000-0000-0000000000bb', null, '{"reserva_en_linea": true}'::jsonb)::text$q$) not like 'ERR|%');
select pg_temp.t('y desde ese momento la clínica SÍ tiene reserva en línea (el enlace público funciona)',
  fn_funcionalidad_contratada('c1230000-0000-0000-0000-0000000000bb', 'reserva_en_linea'));
select pg_temp.t('el inventario sigue apagado (solo se activó lo pedido)',
  not fn_funcionalidad_contratada('c1230000-0000-0000-0000-0000000000bb', 'inventario'));
select pg_temp.t('el propietario de la clínica NO puede ver ni ajustar el panel del superadmin',
  pg_temp.val(:OW, $q$select sa_suscripcion_de_clinica('c1230000-0000-0000-0000-0000000000bb')::text$q$) = 'ERR|42501'
  and pg_temp.val(:OW, $q$select sa_ajustar_condiciones_clinica('c1230000-0000-0000-0000-0000000000bb', null, '{"inventario": true}'::jsonb)::text$q$) like 'ERR|%');

select 'RESULTADO: ' || count(*) filter (where ok) || '/' || count(*) || ' pasaron' from _res;
rollback;
