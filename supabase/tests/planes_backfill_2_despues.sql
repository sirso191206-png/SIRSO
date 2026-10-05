-- Paso 2/2: verificaciones DESPUÉS de aplicar 075 sobre esas clínicas.
\set ON_ERROR_STOP on
\set QUIET on
begin;
create temp table _res (ok boolean, nombre text);
create function pg_temp.t(p_nombre text, p_cond boolean) returns void language plpgsql as $$
begin insert into _res values (coalesce(p_cond,false), p_nombre); raise notice '% %', case when coalesce(p_cond,false) then 'PASS' else 'FAIL' end, p_nombre; end $$;
create function pg_temp.como(p_uid uuid, p_sql text) returns text language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(p_uid::text,''), true); set local role authenticated;
  begin execute p_sql; reset role; return 'OK'; exception when others then reset role; return 'ERR|'||sqlstate||'|'||sqlerrm; end; end $$;

select pg_temp.t('M1 TODA clínica heredada tiene exactamente UNA suscripción vigente (origen "migracion")',
  (select count(*) from clinicas c where id::text like 'c1000000%'
     and (select count(*) from suscripciones s where s.clinica_id = c.id and s.estado <> 'reemplazada' and s.origen = 'migracion') = 1) = 4);
select pg_temp.t('M2 L1 "basico" pasó a "esencial" en la clínica y en su suscripción',
  (select plan from clinicas where id = 'c1000000-0000-0000-0000-000000000001') = 'esencial'
  and (select plan from suscripciones where clinica_id = 'c1000000-0000-0000-0000-000000000001') = 'esencial');
select pg_temp.t('M3 L1 conserva SUS topes: 10 pacientes y 2 usuarios (no los del plan nuevo: 500 y 1)',
  fn_limite_efectivo('c1000000-0000-0000-0000-000000000001', 'pacientes') = 10
  and fn_limite_efectivo('c1000000-0000-0000-0000-000000000001', 'usuarios') = 2);
select pg_temp.t('M4 L2 profesional sin topes sigue SIN topes de pacientes/usuarios (NULL = ilimitado, como antes)',
  fn_limite_efectivo('c1000000-0000-0000-0000-000000000002', 'pacientes') is null
  and fn_limite_efectivo('c1000000-0000-0000-0000-000000000002', 'usuarios') is null);
select pg_temp.t('M5 L2 conserva 2 sucursales y 3 sesiones (valores VIEJOS del catálogo, no los nuevos 1 sucursal)',
  fn_limite_efectivo('c1000000-0000-0000-0000-000000000002', 'sucursales') = 2
  and fn_limite_efectivo('c1000000-0000-0000-0000-000000000002', 'sesiones') = 3);
select pg_temp.t('M6 L3 suspendida sigue suspendida, con su override de 7 sesiones y sus fechas',
  (select estado from suscripciones where clinica_id = 'c1000000-0000-0000-0000-000000000003' and estado <> 'reemplazada') = 'suspendida'
  and fn_limite_efectivo('c1000000-0000-0000-0000-000000000003', 'sesiones') = 7
  and (select fecha_inicio from suscripciones where clinica_id = 'c1000000-0000-0000-0000-000000000003' and estado <> 'reemplazada') = date '2025-03-01'
  and (select fecha_fin from suscripciones where clinica_id = 'c1000000-0000-0000-0000-000000000003' and estado <> 'reemplazada') = date '2026-03-01');
select pg_temp.t('M7 L4 empresarial conserva sus 25 sesiones de antes (el catálogo nuevo dice ilimitado, pero ella no cambia sola)',
  fn_limite_efectivo('c1000000-0000-0000-0000-000000000004', 'sesiones') = 25);
select pg_temp.t('M8 NADIE pierde funcionalidades: todas las clínicas heredadas conservan TODAS las funcionalidades activas',
  (select count(*) from clinicas c where c.id::text like 'c1000000%'
     and (select count(*) from suscripcion_funcionalidades sf join suscripciones s on s.id = sf.suscripcion_id
          where s.clinica_id = c.id and s.estado <> 'reemplazada' and sf.habilitada) = (select count(*) from funcionalidades where activo)) = 4
  and fn_funcionalidad_contratada('c1000000-0000-0000-0000-000000000001', 'periodontograma')
  and fn_funcionalidad_contratada('c1000000-0000-0000-0000-000000000001', 'odontograma_3d'));
select set_config('t.m9', pg_temp.como('a1000000-0000-0000-0000-000000000001'::uuid, $q$insert into pacientes (nombre_completo) values ('Nuevo post-migración')$q$), false);
select pg_temp.t('M9 la clínica heredada sigue operando: su dueño crea un paciente nuevo y conserva los 4 que ya tenía',
  current_setting('t.m9') = 'OK'
  and (select count(*) from pacientes where clinica_id = 'c1000000-0000-0000-0000-000000000001') = 5);
select set_config('t.m10', pg_temp.como('a1000000-0000-0000-0000-000000000001'::uuid, (select string_agg('insert into pacientes (nombre_completo) values (''x' || g || ''');', ' ') from generate_series(1, 6) g)), false);
select pg_temp.t('M10 y SU tope de 10 sigue aplicándose: con 5 pacientes, 6 altas más se rechazan (no se volvió ilimitado ni de 500)',
  current_setting('t.m10') like 'ERR|PT402%'
  and (select count(*) from pacientes where clinica_id = 'c1000000-0000-0000-0000-000000000001') = 5);
select pg_temp.t('M11 el panel de la clínica heredada muestra su plan, topes y uso reales',
  (pg_temp.como('a1000000-0000-0000-0000-000000000002'::uuid, $q$select mi_suscripcion()$q$)) = 'OK');
select pg_temp.t('M12 el catálogo nuevo quedó con los valores iniciales pedidos',
  (select precio_mensual from planes_catalogo where plan = 'profesional') = 999
  and (select limite_sucursales from planes_catalogo where plan = 'clinica') = 3);
select pg_temp.t('M13 "basico" ya no existe en el catálogo ni en ninguna clínica',
  not exists (select 1 from planes_catalogo where plan = 'basico') and not exists (select 1 from clinicas where plan = 'basico'));

do $$
declare v_fail int;
begin
  select count(*) filter (where not ok) into v_fail from _res;
  raise notice 'RESULTADO migración: % pasaron, % fallaron', (select count(*) filter (where ok) from _res), v_fail;
  if v_fail > 0 then raise exception 'FALLARON: %', (select string_agg(nombre, ' | ') from _res where not ok); end if;
end $$;
rollback;
