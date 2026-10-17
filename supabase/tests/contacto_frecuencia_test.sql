-- Migración 102: límite de FRECUENCIA del formulario de contacto público, aplicado en el servidor.
\set ON_ERROR_STOP off
create temp table _res (nombre text, ok boolean);
create function pg_temp.t(p_nombre text, p_ok boolean) returns void language plpgsql as $$ begin insert into _res values (p_nombre, coalesce(p_ok, false)); if not coalesce(p_ok, false) then raise notice 'FAIL %', p_nombre; end if; end $$;
create function pg_temp.anon(p_correo text) returns text language plpgsql as $$
declare v text; h text; m text;
begin
  perform set_config('request.jwt.claims', '', true); execute 'set local role anon';
  begin execute format('with x as (insert into mensajes_contacto (id, nombre, correo, mensaje) values (gen_random_uuid(), ''Ana'', %L, ''Hola'') returning 1) select count(*)::text from x', p_correo) into v; reset role; return v;
  exception when others then get stacked diagnostics h = pg_exception_hint, m = message_text; reset role; return 'ERR|' || coalesce(nullif(h, ''), sqlstate) || '|' || m; end;
end $$;
create function pg_temp.n(p_correo text, p_veces int) returns text language plpgsql as $$
declare r text; ultimo text := ''; i int; begin for i in 1..p_veces loop r := pg_temp.anon(p_correo); ultimo := r; end loop; return ultimo; end $$;
create function pg_temp.cfg(p_clave text, p_valor text) returns void language plpgsql as $$ begin delete from plataforma_config where clave = p_clave; if p_valor is not null then insert into plataforma_config (clave, valor) values (p_clave, p_valor); end if; end $$;
begin;
select set_config('t.a5', pg_temp.n('ana@x.mx', 5), false), set_config('t.a6', pg_temp.anon('ana@x.mx'), false), set_config('t.a7', pg_temp.anon('ANA@X.MX'), false), set_config('t.otro', pg_temp.anon('otra@x.mx'), false);
select pg_temp.t('R1 por omisión una misma persona (sin distinguir mayúsculas) puede enviar 5 mensajes por hora; el 6.º y uno con otras mayúsculas se rechazan (CONTACTO_DEMASIADOS_MENSAJES); otra persona sigue pudiendo',
  current_setting('t.a5') = '1' and current_setting('t.a6') like 'ERR|CONTACTO_DEMASIADOS_MENSAJES|%' and current_setting('t.a7') like 'ERR|CONTACTO_DEMASIADOS_MENSAJES|%' and current_setting('t.otro') = '1'
  and (select count(*) from mensajes_contacto where lower(correo) = 'ana@x.mx') = 5);
delete from mensajes_contacto;
insert into mensajes_contacto (id, nombre, correo, mensaje, creado_en) select gen_random_uuid(), 'Viejo', 'viejo@x.mx', 'antiguo', now() - interval '2 hours' from generate_series(1, 5);
select set_config('t.v', pg_temp.anon('viejo@x.mx'), false);
select pg_temp.t('R2 los mensajes de hace MÁS de una hora no cuentan: tras 5 mensajes antiguos, uno nuevo del mismo correo se acepta', current_setting('t.v') = '1');
delete from mensajes_contacto; select pg_temp.cfg('contacto_max_global_hora', '8');
select set_config('t.g', pg_temp.n('uno@x.mx', 3) || '|' || pg_temp.n('dos@x.mx', 3) || '|' || pg_temp.n('tres@x.mx', 2), false), set_config('t.g9', pg_temp.anon('cuatro@x.mx'), false);
select pg_temp.t('R3 el límite GLOBAL (configurable) bloquea a cualquier correo cuando se alcanza en la última hora: con 8, el mensaje 9 de un correo nuevo se rechaza',
  (select count(*) from mensajes_contacto) = 8 and current_setting('t.g9') like 'ERR|CONTACTO_DEMASIADOS_MENSAJES|%');
delete from mensajes_contacto; select pg_temp.cfg('contacto_max_global_hora', null); select pg_temp.cfg('contacto_max_por_correo_hora', '2');
select set_config('t.c2', pg_temp.n('c@x.mx', 2), false), set_config('t.c3', pg_temp.anon('c@x.mx'), false);
select pg_temp.t('R4 el límite por correo es configurable: con 2, el 3.º se rechaza', current_setting('t.c2') = '1' and current_setting('t.c3') like 'ERR|CONTACTO_DEMASIADOS_MENSAJES|%');
delete from mensajes_contacto; select pg_temp.cfg('contacto_max_por_correo_hora', 'abc'); select set_config('t.i5', pg_temp.n('i@x.mx', 5), false), set_config('t.i6', pg_temp.anon('i@x.mx'), false);
delete from mensajes_contacto; select pg_temp.cfg('contacto_max_por_correo_hora', '0'); select set_config('t.z5', pg_temp.n('z@x.mx', 5), false), set_config('t.z6', pg_temp.anon('z@x.mx'), false);
select pg_temp.t('R5 una configuración inválida (abc, 0) se IGNORA y rige el valor por omisión (5), no «sin límite» ni «bloqueado»', current_setting('t.i5') = '1' and current_setting('t.i6') like 'ERR|CONTACTO_%' and current_setting('t.z5') = '1' and current_setting('t.z6') like 'ERR|CONTACTO_%');
select pg_temp.cfg('contacto_max_por_correo_hora', null);
select pg_temp.t('R6 estructura: las funciones no son invocables por usuarios, el disparador y los dos índices existen, y el límite de TAMAÑO de la 099 sigue vigente',
  not has_function_privilege('anon', 'fn_limitar_frecuencia_contacto()', 'EXECUTE') and not has_function_privilege('authenticated', 'fn_config_limite(text,integer)', 'EXECUTE')
  and exists (select 1 from pg_trigger where tgname = 'trg_limitar_frecuencia_contacto' and not tgisinternal) and (select count(*) from pg_indexes where tablename = 'mensajes_contacto' and indexname like 'idx_mensajes_contacto_%') = 2
  and pg_temp.anon('largo@x.mx') = '1' and exists (select 1 from pg_constraint where conname = 'mensajes_contacto_mensaje_longitud'));
do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO 102: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 100), ' | ') from _res where not ok); end if;
end $$;
rollback;
