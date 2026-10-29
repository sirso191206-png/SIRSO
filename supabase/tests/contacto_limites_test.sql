-- Migración 099: límites de tamaño del formulario de contacto público (anónimo). Solo toca filas NUEVAS.
\set ON_ERROR_STOP off
create temp table _res (nombre text, ok boolean);
create function pg_temp.t(p_nombre text, p_ok boolean) returns void language plpgsql as $$ begin insert into _res values (p_nombre, coalesce(p_ok, false)); if not coalesce(p_ok, false) then raise notice 'FAIL %', p_nombre; end if; end $$;
-- Ejecuta como ANÓNIMO. Un INSERT se envuelve en un CTE con RETURNING para poder leer el resultado (devuelve '1' o 'ERR|sqlstate|mensaje'); un SELECT se pasa tal cual.
create function pg_temp.anon(p_sql text) returns text language plpgsql as $$
declare v text; m text;
begin
  perform set_config('request.jwt.claims', '', true); execute 'set local role anon';
  begin
    if p_sql ~* '^\s*insert' then execute 'with x as (' || p_sql || ' returning 1) select count(*)::text from x' into v; else execute p_sql into v; end if;
    reset role; return v;
  exception when others then get stacked diagnostics m = message_text; reset role; return 'ERR|' || sqlstate || '|' || m; end;
end $$;
begin;
-- Una fila ANTIGUA y desmesurada, de antes de que existieran los límites: se quita la restricción, se inserta y se vuelve a añadir como NOT VALID (el escenario real).
alter table mensajes_contacto drop constraint mensajes_contacto_mensaje_longitud;
insert into mensajes_contacto (id, nombre, correo, mensaje) values ('c0000000-0000-0000-0000-000000000001', 'Antiguo', 'a@x.mx', repeat('x', 20000));
alter table mensajes_contacto add constraint mensajes_contacto_mensaje_longitud check (char_length(mensaje) between 1 and 5000) not valid;
select set_config('t.ok', pg_temp.anon($q$insert into mensajes_contacto (id, nombre, correo, mensaje) values (gen_random_uuid(), 'Ana', 'ana@x.mx', 'Hola, quisiera información.')$q$), false);
select set_config('t.largo', pg_temp.anon($q$insert into mensajes_contacto (id, nombre, correo, mensaje) values (gen_random_uuid(), 'Ana', 'ana@x.mx', repeat('x', 5001))$q$), false);
select set_config('t.limite', pg_temp.anon($q$insert into mensajes_contacto (id, nombre, correo, mensaje) values (gen_random_uuid(), repeat('n', 120), repeat('c', 254), repeat('m', 5000))$q$), false);
select set_config('t.nombre', pg_temp.anon($q$insert into mensajes_contacto (id, nombre, correo, mensaje) values (gen_random_uuid(), repeat('n', 121), 'a@x.mx', 'hola')$q$), false);
select set_config('t.correo', pg_temp.anon($q$insert into mensajes_contacto (id, nombre, correo, mensaje) values (gen_random_uuid(), 'Ana', repeat('c', 255), 'hola')$q$), false);
select set_config('t.vacio', pg_temp.anon($q$insert into mensajes_contacto (id, nombre, correo, mensaje) values (gen_random_uuid(), 'Ana', 'a@x.mx', '')$q$), false);
select pg_temp.t('K1 un mensaje normal de una persona ANÓNIMA se guarda; el máximo exacto (120/254/5000) también', current_setting('t.ok') = '1' and current_setting('t.limite') = '1');
select pg_temp.t('K2 un mensaje de 5,001 caracteres, un nombre de 121, un correo de 255 y un mensaje vacío se RECHAZAN (23514, restricción de longitud)',
  current_setting('t.largo') like 'ERR|23514|%mensajes_contacto_mensaje_longitud%' and current_setting('t.nombre') like 'ERR|23514|%mensajes_contacto_nombre_longitud%'
  and current_setting('t.correo') like 'ERR|23514|%mensajes_contacto_correo_longitud%' and current_setting('t.vacio') like 'ERR|23514|%');
select pg_temp.t('K3 las filas EXISTENTES no se revisan ni se tocan (la restricción es NOT VALID): la fila antigua de 20,000 caracteres sigue ahí y las tres restricciones están sin validar',
  (select char_length(mensaje) = 20000 from mensajes_contacto where id = 'c0000000-0000-0000-0000-000000000001')
  and (select bool_and(not convalidated) from pg_constraint where conrelid = 'public.mensajes_contacto'::regclass and conname like 'mensajes_contacto_%_longitud'));
select pg_temp.t('K4 las tres restricciones existen y el SELECT sigue reservado al superadministrador (un anónimo no lee mensajes ajenos)',
  (select count(*) from pg_constraint where conrelid = 'public.mensajes_contacto'::regclass and conname like 'mensajes_contacto_%_longitud') = 3
  and (pg_temp.anon($q$select count(*)::text from mensajes_contacto$q$) = '0'
       -- desde la 120 el rol anónimo ni siquiera tiene SELECT (más estricto que 0 filas)
       or pg_temp.anon($q$select count(*)::text from mensajes_contacto$q$) like 'ERR|42501%'));
do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO 099: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 100), ' | ') from _res where not ok); end if;
end $$;
rollback;
