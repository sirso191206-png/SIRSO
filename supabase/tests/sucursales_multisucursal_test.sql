-- Regla de sucursales (migración 079): sin "multisucursal" no se crea ninguna; con ella manda el límite.
\set ON_ERROR_STOP on
\set QUIET on
begin;
create temp table _res (ok boolean, nombre text);
create function pg_temp.t(p_nombre text, p_cond boolean) returns void language plpgsql as $$
begin insert into _res values (coalesce(p_cond,false), p_nombre); raise notice '% %', case when coalesce(p_cond,false) then 'PASS' else 'FAIL' end, p_nombre; end $$;
create function pg_temp.como(p_uid uuid, p_sql text) returns text language plpgsql as $$
declare v_d text; v_h text; v_m text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin execute p_sql; reset role; return 'OK';
  exception when others then get stacked diagnostics v_d = pg_exception_detail, v_h = pg_exception_hint, v_m = message_text;
    reset role; return 'ERR|'||sqlstate||'|'||coalesce(v_d,'')||'|'||coalesce(v_h,'');
  end;
end $$;
create function pg_temp.nueva(p_n int, p_plan text) returns uuid language plpgsql as $$
declare v_cl uuid := ('c7000000-0000-0000-0000-0000000000'||lpad(p_n::text,2,'0'))::uuid; v_u uuid := ('a7000000-0000-0000-0000-0000000000'||lpad(p_n::text,2,'0'))::uuid;
begin
  insert into clinicas (id, nombre) values (v_cl, 'Clínica '||p_n);
  if p_plan is not null then perform fn_asignar_plan_interno(null, v_cl, p_plan, 'mensual'); end if;
  insert into auth.users (id, email) values (v_u, 'd'||p_n||'@x.mx');
  insert into usuarios (id, clinica_id, nombre, correo, rol) values (v_u, v_cl, 'Dueño '||p_n, 'd'||p_n||'@x.mx', 'owner');
  return v_cl;
end $$;
create function pg_temp.alta(p_n int, p_nombre text) returns text language sql as $$
  select pg_temp.como(('a7000000-0000-0000-0000-0000000000'||lpad(p_n::text,2,'0'))::uuid,
    format($q$insert into sucursales (clinica_id, nombre) values (auth_clinica_id(), %L)$q$, p_nombre))
$$;
create function pg_temp.cuantas(p_n int) returns bigint language sql as $$
  select count(*) from sucursales where clinica_id = ('c7000000-0000-0000-0000-0000000000'||lpad(p_n::text,2,'0'))::uuid
$$;

select pg_temp.nueva(1,'esencial'), pg_temp.nueva(2,'profesional'), pg_temp.nueva(3,'clinica'), pg_temp.nueva(4,'empresarial');

select set_config('t.e1', pg_temp.alta(1,'Matriz'), false);
select pg_temp.t('S1 ESENCIAL: un dueño NO puede crear ni la primera sucursal (PT403 / FEATURE_NOT_AVAILABLE / multisucursal) y no queda ninguna',
  current_setting('t.e1') = 'ERR|PT403|FEATURE_NOT_AVAILABLE|multisucursal' and pg_temp.cuantas(1) = 0);
select set_config('t.p1', pg_temp.alta(2,'Matriz'), false), set_config('t.p2', pg_temp.alta(2,'Segunda'), false);
select pg_temp.t('S2 PROFESIONAL (migración 080: incluye multisucursal con límite 1): puede crear UNA sucursal y la 2.ª se rechaza por límite (PT402)',
  current_setting('t.p1') = 'OK' and current_setting('t.p2') = 'ERR|PT402|PLAN_LIMIT_REACHED|sucursales' and pg_temp.cuantas(2) = 1);
select set_config('t.c1', pg_temp.alta(3,'Matriz'), false), set_config('t.c2', pg_temp.alta(3,'Segunda'), false), set_config('t.c3', pg_temp.alta(3,'Tercera'), false), set_config('t.c4', pg_temp.alta(3,'Cuarta'), false);
select pg_temp.t('S3 CLÍNICA (multisucursal, límite 3): entran 3 y la 4.ª se rechaza con PT402 / sucursales; nada se borra',
  current_setting('t.c1') = 'OK' and current_setting('t.c2') = 'OK' and current_setting('t.c3') = 'OK'
  and current_setting('t.c4') = 'ERR|PT402|PLAN_LIMIT_REACHED|sucursales' and pg_temp.cuantas(3) = 3);
select pg_temp.alta(4,'S'||g) from generate_series(1,6) g;
select pg_temp.t('S4 EMPRESARIAL (sin límite): crea todas las que quiera', pg_temp.cuantas(4) = 6);

select pg_temp.t('S2b el catálogo lo refleja: Profesional incluye multisucursal (tope 1) y Esencial NO; quedó auditado',
  exists (select 1 from plan_funcionalidades where plan='profesional' and funcionalidad='multisucursal' and habilitada)
  and not exists (select 1 from plan_funcionalidades where plan='esencial' and funcionalidad='multisucursal' and habilitada)
  and (select limite_sucursales from planes_catalogo where plan='profesional') = 1
  and exists (select 1 from auditoria where accion='editar_funcionalidades_plan' and detalle->>'origen' = 'migración 080'));

-- Dar la funcionalidad a un Esencial (acción explícita del superadmin) le abre la puerta, con su límite
insert into auth.users (id, email) values ('a7000000-0000-0000-0000-0000000000ff','sa@x.mx');
insert into clinicas (id, nombre) values ('c7000000-0000-0000-0000-0000000000ff','Plataforma');
insert into usuarios (id, clinica_id, nombre, correo, rol, es_super_admin) values ('a7000000-0000-0000-0000-0000000000ff','c7000000-0000-0000-0000-0000000000ff','SA','sa@x.mx','owner',true);
select fn_asignar_plan_interno(null,'c7000000-0000-0000-0000-0000000000ff','empresarial','anual');
select pg_temp.como('a7000000-0000-0000-0000-0000000000ff', $q$select sa_ajustar_condiciones_clinica('c7000000-0000-0000-0000-000000000001','{"max_sucursales":1}','{"multisucursal":true}')$q$);
select set_config('t.x1', pg_temp.alta(1,'Matriz'), false), set_config('t.x2', pg_temp.alta(1,'Segunda'), false);
select pg_temp.t('S5 al activarle multisucursal (con límite 1) al Esencial, entra la 1.ª y la 2.ª se rechaza por límite (PT402)',
  current_setting('t.x1') = 'OK' and current_setting('t.x2') = 'ERR|PT402|PLAN_LIMIT_REACHED|sucursales' and pg_temp.cuantas(1) = 1);

-- Reactivar una sucursal ya existente (regla conservada para no dejar a nadie sin la suya)
select pg_temp.nueva(5,'esencial');
insert into sucursales (clinica_id, nombre, activa) values ('c7000000-0000-0000-0000-000000000005','Vieja', false);
select set_config('t.r1', pg_temp.como('a7000000-0000-0000-0000-000000000005', $q$update sucursales set activa = true where nombre = 'Vieja'$q$), false);
select pg_temp.t('S6 un Esencial que ya tenía UNA sucursal desactivada puede reactivarla (regla conservada)',
  current_setting('t.r1') = 'OK' and (select activa from sucursales where nombre = 'Vieja'));
select pg_temp.nueva(6,'esencial');
set local session_replication_role = replica;   -- dato heredado: una sucursal activa que ya existía antes de la regla
insert into sucursales (clinica_id, nombre, activa) values ('c7000000-0000-0000-0000-000000000006','A', true), ('c7000000-0000-0000-0000-000000000006','B', false);
set local session_replication_role = origin;
select set_config('t.r2', pg_temp.como('a7000000-0000-0000-0000-000000000006', $q$update sucursales set activa = true where nombre = 'B'$q$), false);
select pg_temp.t('S7 ...pero NO una segunda activa: reactivar B con A activa se rechaza (PT403)',
  current_setting('t.r2') like 'ERR|PT403|%' and not (select activa from sucursales where nombre = 'B'));
select set_config('t.r3', pg_temp.como('a7000000-0000-0000-0000-000000000006', $q$update sucursales set nombre = 'A renombrada' where nombre = 'A'$q$), false);
select pg_temp.t('S8 editar una sucursal existente (nombre) sigue funcionando en un plan sin multisucursal',
  current_setting('t.r3') = 'OK' and exists (select 1 from sucursales where nombre = 'A renombrada'));

-- Clínica heredada (snapshot con todas las funcionalidades) y clínica sin suscripción: no se rompen
select pg_temp.nueva(7, null);
select set_config('t.h1', pg_temp.alta(7,'Heredada'), false);
select pg_temp.t('S9 una clínica sin suscripción (heredada sin regularizar) sigue pudiendo crear sucursales: no se le quita nada de golpe',
  current_setting('t.h1') = 'OK' and pg_temp.cuantas(7) = 1);

do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO SUCURSALES: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(nombre, ' | ') from _res where not ok); end if;
end $$;
rollback;
