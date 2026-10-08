-- Migración 083: ranking de tratamientos con período, estado y odontólogo; aislado por RLS.
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
  exception when others then reset role; return 'ERR|'||sqlstate; end;
end $$;
-- "descripcion=cantidad,descripcion=cantidad" en el orden devuelto
create function pg_temp.rank(p_uid uuid, p_args text default '') returns text language sql as $$
  select pg_temp.val(p_uid, format('select coalesce(string_agg(descripcion||''=''||cantidad, '','' order by cantidad desc, descripcion), ''(vacío)'') from fn_tratamientos_mas_realizados(%s)', p_args))
$$;

insert into auth.users (id, email) select ('a3000000-0000-0000-0000-0000000000'||lpad(g::text,2,'0'))::uuid, 'u'||g||'@x.mx' from generate_series(1,5) g;
insert into clinicas (id, nombre) values ('c3000000-0000-0000-0000-00000000000a','A'),('c3000000-0000-0000-0000-00000000000b','B');
select fn_asignar_plan_interno(null, c, 'empresarial', 'mensual') from unnest(array['c3000000-0000-0000-0000-00000000000a','c3000000-0000-0000-0000-00000000000b']::uuid[]) c;
insert into usuarios (id, clinica_id, nombre, correo, rol) values
 ('a3000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-00000000000a','Owner A','u1@x.mx','owner'),
 ('a3000000-0000-0000-0000-000000000002','c3000000-0000-0000-0000-00000000000a','Dentista 1','u2@x.mx','dentista'),
 ('a3000000-0000-0000-0000-000000000003','c3000000-0000-0000-0000-00000000000a','Dentista 2','u3@x.mx','dentista'),
 ('a3000000-0000-0000-0000-000000000004','c3000000-0000-0000-0000-00000000000b','Owner B','u4@x.mx','owner');
insert into pacientes (id, clinica_id, nombre_completo, dentista_responsable_id) values
 ('b3000000-0000-0000-0000-00000000000a','c3000000-0000-0000-0000-00000000000a','Paciente A','a3000000-0000-0000-0000-000000000002'),
 ('b3000000-0000-0000-0000-00000000000b','c3000000-0000-0000-0000-00000000000b','Paciente B',null);
-- Clínica A: Limpieza ×3 (2 completados y 1 planeado), Resina ×2, Corona ×1. Fechas repartidas.
insert into tratamientos (paciente_id, descripcion, costo, estado, dentista_id, creado_en) values
 ('b3000000-0000-0000-0000-00000000000a','Limpieza',100,'completado','a3000000-0000-0000-0000-000000000002','2026-10-05 10:00+00'),
 ('b3000000-0000-0000-0000-00000000000a','Limpieza',100,'completado','a3000000-0000-0000-0000-000000000003','2026-09-10 10:00+00'),
 ('b3000000-0000-0000-0000-00000000000a','Limpieza',100,'planeado',  'a3000000-0000-0000-0000-000000000002','2026-06-01 10:00+00'),
 ('b3000000-0000-0000-0000-00000000000a','Resina',200,'en_progreso', 'a3000000-0000-0000-0000-000000000002','2026-10-06 10:00+00'),
 ('b3000000-0000-0000-0000-00000000000a','Resina',200,'cancelado',   'a3000000-0000-0000-0000-000000000003','2026-08-15 10:00+00'),
 ('b3000000-0000-0000-0000-00000000000a','Corona',900,'aceptado',    'a3000000-0000-0000-0000-000000000003','2026-10-02 10:00+00');
-- Clínica B: Limpieza ×10 (no debe mezclarse nunca con la de A)
insert into tratamientos (paciente_id, descripcion, costo, estado, creado_en)
  select 'b3000000-0000-0000-0000-00000000000b', 'Limpieza', 100, 'completado', '2026-10-03 10:00+00' from generate_series(1,10);
select set_config('t.oa','a3000000-0000-0000-0000-000000000001',false), set_config('t.d1','a3000000-0000-0000-0000-000000000002',false),
       set_config('t.ob','a3000000-0000-0000-0000-000000000004',false), set_config('t.d2','a3000000-0000-0000-0000-000000000003',false);

select pg_temp.t('R1 sin filtros: ranking de la clínica A (Limpieza 3, Resina 2, Corona 1) — NO suma los 10 de la clínica B',
  pg_temp.rank(current_setting('t.oa')::uuid) = 'Limpieza=3,Resina=2,Corona=1');
select pg_temp.t('R2 la clínica B ve SOLO lo suyo (Limpieza 10)', pg_temp.rank(current_setting('t.ob')::uuid) = 'Limpieza=10');
select pg_temp.t('R3 por ESTADO: solo completados → Limpieza 2; sin coincidencias → vacío',
  pg_temp.rank(current_setting('t.oa')::uuid, 'p_estado => ''completado''') = 'Limpieza=2'
  and pg_temp.rank(current_setting('t.oa')::uuid, 'p_estado => ''pausado''') = '(vacío)');
select pg_temp.t('R4 por PERÍODO: el rango es [desde, hasta): octubre 2026 → Limpieza 1, Resina 1, Corona 1; el 1 de nov no entra',
  pg_temp.rank(current_setting('t.oa')::uuid, 'p_desde => ''2026-10-01'', p_hasta => ''2026-11-01''') = 'Corona=1,Limpieza=1,Resina=1'
  and pg_temp.rank(current_setting('t.oa')::uuid, 'p_desde => ''2026-10-06 10:00+00'', p_hasta => ''2026-10-06 10:00+00''') = '(vacío)'
  and pg_temp.rank(current_setting('t.oa')::uuid, 'p_desde => ''2026-10-06 10:00+00''') like '%Resina=1%');
select pg_temp.t('R5 por ODONTÓLOGO: dentista 1 → Limpieza 2 y Resina 1; dentista 2 → Limpieza 1, Resina 1, Corona 1',
  pg_temp.rank(current_setting('t.oa')::uuid, format('p_dentista => %L', current_setting('t.d1'))) = 'Limpieza=2,Resina=1'
  and pg_temp.rank(current_setting('t.oa')::uuid, format('p_dentista => %L', current_setting('t.d2'))) = 'Corona=1,Limpieza=1,Resina=1');
select pg_temp.t('R6 los filtros se combinan (completados de septiembre a octubre del dentista 2 → Limpieza 1)',
  pg_temp.rank(current_setting('t.oa')::uuid, format('p_estado => ''completado'', p_dentista => %L, p_desde => ''2026-09-01'', p_hasta => ''2026-11-01''', current_setting('t.d2'))) = 'Limpieza=1');
select pg_temp.t('R7 el límite se respeta y se acota a 1–50 (0 y negativo → 1; 1000 → 50 como máximo)',
  pg_temp.rank(current_setting('t.oa')::uuid, 'p_limite => 2') = 'Limpieza=3,Resina=2'
  and pg_temp.rank(current_setting('t.oa')::uuid, 'p_limite => 0') = 'Limpieza=3'
  and pg_temp.rank(current_setting('t.oa')::uuid, 'p_limite => -4') = 'Limpieza=3'
  and pg_temp.val(current_setting('t.oa')::uuid, 'select count(*)::text from fn_tratamientos_mas_realizados(1000)') = '3'
  and pg_temp.rank(current_setting('t.oa')::uuid, 'p_limite => null') = 'Limpieza=3,Resina=2,Corona=1');
select pg_temp.t('R8 la firma vieja desapareció (no hay dos funciones candidatas) y la llamada antigua con solo p_limite sigue funcionando',
  (select count(*) from pg_proc where proname = 'fn_tratamientos_mas_realizados') = 1
  and pg_temp.rank(current_setting('t.oa')::uuid, '3') = 'Limpieza=3,Resina=2,Corona=1');
select pg_temp.t('R9 un DENTISTA solo cuenta lo que RLS le deja ver (su paciente asignado); no se salta el aislamiento',
  pg_temp.rank(current_setting('t.d1')::uuid) = 'Limpieza=3,Resina=2,Corona=1'
  and pg_temp.val(current_setting('t.d2')::uuid, 'select count(*)::text from fn_tratamientos_mas_realizados()') = '0');
select pg_temp.t('R10 la función es SECURITY INVOKER (el aislamiento lo da RLS, no este código) y no es ejecutable por anónimos',
  not (select prosecdef from pg_proc where proname = 'fn_tratamientos_mas_realizados')
  and not has_function_privilege('anon', 'fn_tratamientos_mas_realizados(integer,timestamptz,timestamptz,text,uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'fn_tratamientos_mas_realizados(integer,timestamptz,timestamptz,text,uuid)', 'EXECUTE'));
select pg_temp.t('R11 un filtro de dentista de OTRA clínica no revela nada (RLS ya la oculta)',
  pg_temp.rank(current_setting('t.ob')::uuid, format('p_dentista => %L', current_setting('t.d1'))) = '(vacío)');

do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO 083: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 150), ' | ') from _res where not ok); end if;
end $$;
rollback;
