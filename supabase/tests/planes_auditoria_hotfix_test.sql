-- Verificación compacta de los hotfix 076 y 077 (los ataques que se encontraron en la auditoría).
-- Corre sobre la base ya migrada (ver run_planes_tests.sh). Una transacción con ROLLBACK.
\set ON_ERROR_STOP on
\set QUIET on
begin;
create temp table _res (ok boolean, nombre text);
create function pg_temp.t(p_nombre text, p_cond boolean) returns void language plpgsql as $$
begin insert into _res values (coalesce(p_cond,false), p_nombre); raise notice '% %', case when coalesce(p_cond,false) then 'PASS' else 'FAIL' end, p_nombre; end $$;
create function pg_temp.como(p_rol text, p_uid uuid, p_sql text) returns text language plpgsql as $$
declare v_d text; v_m text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_rol)::text, true);
  execute format('set local role %I', p_rol);
  begin execute p_sql; reset role; return 'OK';
  exception when others then get stacked diagnostics v_d = pg_exception_detail, v_m = message_text; reset role; return 'ERR|'||sqlstate||'|'||coalesce(v_d,'')||'|'||v_m; end;
end $$;

insert into auth.users (id, email) select ('a9000000-0000-0000-0000-0000000000'||lpad(g::text,2,'0'))::uuid, 'u'||g||'@x.mx' from generate_series(1,6) g;
insert into clinicas (id, nombre) values ('c9000000-0000-0000-0000-0000000000ff', 'Plataforma');
insert into usuarios (id, clinica_id, nombre, correo, rol, es_super_admin) values ('a9000000-0000-0000-0000-000000000001','c9000000-0000-0000-0000-0000000000ff','Super','u1@x.mx','owner',true);
select fn_asignar_plan_interno('a9000000-0000-0000-0000-000000000001','c9000000-0000-0000-0000-0000000000ff','empresarial','anual');
select fn_crear_clinica_con_plan('a9000000-0000-0000-0000-000000000001','Clinica S','profesional','mensual');
select set_config('t.cs', (select id::text from clinicas where nombre='Clinica S'), false);
insert into usuarios (id, clinica_id, nombre, correo, rol) values
  ('a9000000-0000-0000-0000-000000000002', current_setting('t.cs')::uuid, 'Dueño', 'u2@x.mx', 'owner'),
  ('a9000000-0000-0000-0000-000000000003', current_setting('t.cs')::uuid, 'Dentista', 'u3@x.mx', 'dentista');

-- 077: nadie se hace superadmin por la API
select pg_temp.t('077-1 el OWNER no puede ponerse es_super_admin (UPDATE propio)',
  pg_temp.como('authenticated','a9000000-0000-0000-0000-000000000002', $q$update usuarios set es_super_admin = true where id = 'a9000000-0000-0000-0000-000000000002'$q$) like 'ERR|42501%'
  and not (select es_super_admin from usuarios where id = 'a9000000-0000-0000-0000-000000000002'));
select pg_temp.t('077-2 el OWNER no puede volver superadmin a otro usuario de su clínica',
  pg_temp.como('authenticated','a9000000-0000-0000-0000-000000000002', $q$update usuarios set es_super_admin = true where id = 'a9000000-0000-0000-0000-000000000003'$q$) like 'ERR|42501%');
select pg_temp.t('077-3 el OWNER no puede INSERTAR un usuario con es_super_admin = true',
  pg_temp.como('authenticated','a9000000-0000-0000-0000-000000000002', format($q$insert into usuarios (id,clinica_id,nombre,correo,rol,es_super_admin) values ('a9000000-0000-0000-0000-000000000004', %L,'X','u4@x.mx','dentista',true)$q$, current_setting('t.cs'))) like 'ERR|42501%');
select pg_temp.t('077-4 un DENTISTA tampoco',
  pg_temp.como('authenticated','a9000000-0000-0000-0000-000000000003', $q$update usuarios set es_super_admin = true where id = 'a9000000-0000-0000-0000-000000000003'$q$) like 'ERR|%'
  and not (select es_super_admin from usuarios where id = 'a9000000-0000-0000-0000-000000000003'));
select set_config('t.s5', pg_temp.como('service_role', null, $q$update usuarios set es_super_admin = true where id = 'a9000000-0000-0000-0000-000000000003'$q$), false);
select pg_temp.t('077-5 service_role SÍ puede (así se da de alta un superadmin)',
  current_setting('t.s5') = 'OK' and (select es_super_admin from usuarios where id = 'a9000000-0000-0000-0000-000000000003'));
update usuarios set es_super_admin = false where id = 'a9000000-0000-0000-0000-000000000003';
select set_config('t.s6', pg_temp.como('authenticated','a9000000-0000-0000-0000-000000000002', $q$update usuarios set rol='asistente', nombre='Renombrado' where id='a9000000-0000-0000-0000-000000000003'$q$), false);
select pg_temp.t('077-6 lo legítimo sigue funcionando: el owner cambia rol y nombre de un usuario de su clínica',
  current_setting('t.s6') = 'OK' and (select rol from usuarios where id='a9000000-0000-0000-0000-000000000003') = 'asistente');

-- 076: una clínica nunca existe sin suscripción
select pg_temp.t('076-1 un owner NO puede crear una clínica por la API',
  pg_temp.como('authenticated','a9000000-0000-0000-0000-000000000002', $q$insert into clinicas (nombre) values ('Pirata')$q$) like 'ERR|42501%');
do $$ declare v text; begin
  insert into clinicas (id, nombre) values ('c9000000-0000-0000-0000-00000000dead','Huérfana');
  begin set constraints trg_clinica_requiere_suscripcion immediate; v := 'OK';
  exception when others then get stacked diagnostics v = pg_exception_detail; v := sqlstate||'|'||v; end;
  perform set_config('t.c2', v, false);
end $$;
select pg_temp.t('076-2 un INSERT directo en clinicas SIN suscripción es rechazado por la base (al cerrar la transacción)',
  current_setting('t.c2') = 'P0001|CLINICA_REQUIERE_SUSCRIPCION');
set constraints trg_clinica_requiere_suscripcion deferred;
delete from clinicas where id = 'c9000000-0000-0000-0000-00000000dead';
select pg_temp.t('076-3 el alta atómica deja suscripción vigente, plan, modalidad, precio, fecha, estado, creador y snapshot',
  exists (select 1 from suscripciones s where s.clinica_id = current_setting('t.cs')::uuid and s.estado='activa' and s.plan='profesional' and s.modalidad='mensual'
          and s.precio_contratado is not null and s.fecha_inicio is not null and s.creado_por = 'a9000000-0000-0000-0000-000000000001' and s.origen='alta')
  and exists (select 1 from suscripcion_limites l join suscripciones s on s.id=l.suscripcion_id where s.clinica_id=current_setting('t.cs')::uuid)
  and (select count(*) from suscripcion_funcionalidades sf join suscripciones s on s.id=sf.suscripcion_id where s.clinica_id=current_setting('t.cs')::uuid) = (select count(*) from funcionalidades where activo));
select pg_temp.t('076-4 fn_crear_clinica_con_plan: rechazada para owner, dentista y superadmin (solo service_role)',
  pg_temp.como('authenticated','a9000000-0000-0000-0000-000000000002', $q$select fn_crear_clinica_con_plan(null,'X','esencial','mensual')$q$) like 'ERR|42501%'
  and pg_temp.como('authenticated','a9000000-0000-0000-0000-000000000001', $q$select fn_crear_clinica_con_plan(null,'X','esencial','mensual')$q$) like 'ERR|42501%'
  and pg_temp.como('service_role', null, $q$select fn_crear_clinica_con_plan(null,'Via service','esencial','anual')$q$) = 'OK');
select pg_temp.t('076-5 es atómico: plan inexistente o modalidad inválida no dejan ninguna clínica a medias',
  pg_temp.como('service_role', null, $q$select fn_crear_clinica_con_plan(null,'Fantasma 1','no_existe','mensual')$q$) like 'ERR|%'
  and pg_temp.como('service_role', null, $q$select fn_crear_clinica_con_plan(null,'Fantasma 2','esencial','semanal')$q$) like 'ERR|%'
  and not exists (select 1 from clinicas where nombre like 'Fantasma%'));
set local session_replication_role = replica;
insert into clinicas (id, nombre, estado) values ('c9000000-0000-0000-0000-0000000000a1','Heredada huérfana','suspendida');
set local session_replication_role = origin;
do $$ declare v text; begin
  begin update clinicas set estado='activa' where id='c9000000-0000-0000-0000-0000000000a1';
        set constraints trg_clinica_requiere_suscripcion immediate; v := 'OK';
  exception when others then get stacked diagnostics v = pg_exception_detail; v := sqlstate||'|'||v; end;
  perform set_config('t.c6', v, false);
end $$;
set constraints trg_clinica_requiere_suscripcion deferred;
update clinicas set estado='suspendida' where id='c9000000-0000-0000-0000-0000000000a1';
select pg_temp.t('076-6 una clínica heredada sin suscripción no se puede REACTIVAR hasta regularizarla',
  current_setting('t.c6') = 'P0001|CLINICA_REQUIERE_SUSCRIPCION');
select set_config('t.c7', pg_temp.como('authenticated','a9000000-0000-0000-0000-000000000001', $q$select sa_asignar_plan_clinica('c9000000-0000-0000-0000-0000000000a1','esencial','mensual')$q$), false);
update clinicas set estado='activa' where id='c9000000-0000-0000-0000-0000000000a1';
set constraints trg_clinica_requiere_suscripcion immediate;
select pg_temp.t('076-7 la regularización es una acción explícita del superadmin (sa_asignar_plan_clinica); después ya se puede reactivar',
  current_setting('t.c7') = 'OK');

do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO HOTFIX: % pasaron, % fallaron (de %)', v_o, v_f, v_o+v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(nombre,' | ') from _res where not ok); end if;
end $$;
rollback;
