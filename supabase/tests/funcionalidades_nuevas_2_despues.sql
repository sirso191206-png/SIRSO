-- 123, paso 2/2 (se corre DESPUÉS de aplicar la 123 sobre la base del paso 1). Con -v fase=rollback revisa el rollback.
\set ON_ERROR_STOP on
\set QUIET on
create temp table _res (ok boolean, nombre text);
create function pg_temp.t(p_nombre text, p_cond boolean) returns void language plpgsql as $$
begin insert into _res values (coalesce(p_cond,false), p_nombre); raise notice '% %', case when coalesce(p_cond,false) then 'PASS' else 'FAIL' end, p_nombre; end $$;
create function pg_temp.f(p_clinica text, p_codigo text) returns text language sql as $$
  select coalesce((select habilitada::text from suscripcion_funcionalidades where suscripcion_id = fn_suscripcion_vigente(p_clinica::uuid) and funcionalidad = p_codigo), 'sin fila') $$;
\set E '\'c1230000-0000-0000-0000-00000000000e\''
\set P '\'c1230000-0000-0000-0000-00000000000c\''
\set M '\'c1230000-0000-0000-0000-00000000000d\''
\if :{?fase}
select pg_temp.t('rollback: las filas que agregó la 123 se quitan',
  pg_temp.f(:E, 'reserva_en_linea') = 'sin fila' and pg_temp.f(:P, 'inventario') = 'sin fila' and pg_temp.f(:M, 'inventario') = 'sin fila');
select pg_temp.t('rollback: lo ajustado a mano antes de la 123 se conserva', pg_temp.f(:M, 'reserva_en_linea') = 'false');
select pg_temp.t('rollback: la tabla de registro desaparece', to_regclass('suscripcion_funcionalidades_123') is null);
select 'RESULTADO 123 (rollback): ' || count(*) filter (where ok) || '/' || count(*) || ' pasaron' from _res;
\else
select pg_temp.t('Esencial: recibe reserva e inventario APAGADOS (su plan no los incluye)',
  pg_temp.f(:E, 'reserva_en_linea') = 'false' and pg_temp.f(:E, 'inventario') = 'false');
select pg_temp.t('Profesional: recibe reserva e inventario ENCENDIDOS (su plan los incluye)',
  pg_temp.f(:P, 'reserva_en_linea') = 'true' and pg_temp.f(:P, 'inventario') = 'true');
select pg_temp.t('lo que el superadmin ya había ajustado a mano NO se pisa (reserva apagada)', pg_temp.f(:M, 'reserva_en_linea') = 'false');
select pg_temp.t('y a esa misma clínica sí se le agrega lo que le faltaba (inventario)', pg_temp.f(:M, 'inventario') = 'true');
select pg_temp.t('ninguna suscripción vigente se queda sin fila para una funcionalidad activa',
  not exists (select 1 from suscripciones s cross join funcionalidades f where s.estado <> 'reemplazada' and f.activo
    and not exists (select 1 from suscripcion_funcionalidades sf where sf.suscripcion_id = s.id and sf.funcionalidad = f.codigo)));
select pg_temp.t('el registro guarda exactamente lo agregado (5 filas de estas clínicas)',
  (select count(*) from suscripcion_funcionalidades_123 where suscripcion_id in (select fn_suscripcion_vigente(c::uuid) from unnest(array[:E, :P, :M]) c)) = 5);
select pg_temp.t('el registro no es legible desde la app',
  not has_table_privilege('authenticated', 'suscripcion_funcionalidades_123', 'select') and not has_table_privilege('anon', 'suscripcion_funcionalidades_123', 'select'));
select 'RESULTADO 123 (backfill): ' || count(*) filter (where ok) || '/' || count(*) || ' pasaron' from _res;
\endif
