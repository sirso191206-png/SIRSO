-- Migración 084: el propietario puede ejercer como dentista (marca usuarios.ejerce_como_dentista).
\set ON_ERROR_STOP on
\set QUIET on
begin;
create temp table _res (ok boolean, nombre text);
create function pg_temp.t(p_nombre text, p_cond boolean) returns void language plpgsql as $$
begin insert into _res values (coalesce(p_cond,false), p_nombre); raise notice '% %', case when coalesce(p_cond,false) then 'PASS' else 'FAIL' end, p_nombre; end $$;
-- Ejecuta p_sql como ese usuario. 'OK:n' o 'ERR|sqlstate|mensaje'
create function pg_temp.como(p_uid uuid, p_sql text) returns text language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin execute p_sql; get diagnostics n = row_count; reset role; return 'OK:'||n;
  exception when others then reset role; return 'ERR|'||sqlstate||'|'||sqlerrm; end;
end $$;
create function pg_temp.val(p_uid uuid, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin execute p_sql into v; reset role; return v;
  exception when others then reset role; return 'ERR|'||sqlstate; end;
end $$;

create function pg_temp.do_falla(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'sin error'; exception when others then return sqlstate; end $$;
insert into auth.users (id, email) select ('a5000000-0000-0000-0000-0000000000'||lpad(g::text,2,'0'))::uuid, 'od'||g||'@x.mx' from generate_series(1,8) g;
insert into clinicas (id, nombre) values ('c5000000-0000-0000-0000-00000000000a','A'),('c5000000-0000-0000-0000-00000000000b','B');
select fn_asignar_plan_interno(null, c, 'empresarial', 'mensual') from unnest(array['c5000000-0000-0000-0000-00000000000a','c5000000-0000-0000-0000-00000000000b']::uuid[]) c;
insert into usuarios (id, clinica_id, nombre, correo, rol) values
 ('a5000000-0000-0000-0000-000000000001','c5000000-0000-0000-0000-00000000000a','Owner A','od1@x.mx','owner'),
 ('a5000000-0000-0000-0000-000000000002','c5000000-0000-0000-0000-00000000000a','Dentista A','od2@x.mx','dentista'),
 ('a5000000-0000-0000-0000-000000000003','c5000000-0000-0000-0000-00000000000a','Asistente A','od3@x.mx','asistente'),
 ('a5000000-0000-0000-0000-000000000004','c5000000-0000-0000-0000-00000000000a','Recepción A','od4@x.mx','recepcion'),
 ('a5000000-0000-0000-0000-000000000005','c5000000-0000-0000-0000-00000000000b','Owner B','od5@x.mx','owner'),
 ('a5000000-0000-0000-0000-000000000006','c5000000-0000-0000-0000-00000000000a','Segundo owner A','od6@x.mx','owner');
insert into pacientes (id, clinica_id, nombre_completo) values
 ('b5000000-0000-0000-0000-00000000000a','c5000000-0000-0000-0000-00000000000a','Paciente A1'),
 ('b5000000-0000-0000-0000-00000000000b','c5000000-0000-0000-0000-00000000000a','Paciente A2'),
 ('b5000000-0000-0000-0000-00000000000c','c5000000-0000-0000-0000-00000000000b','Paciente B1');
select set_config('t.oa','a5000000-0000-0000-0000-000000000001',false), set_config('t.da','a5000000-0000-0000-0000-000000000002',false),
       set_config('t.as','a5000000-0000-0000-0000-000000000003',false), set_config('t.re','a5000000-0000-0000-0000-000000000004',false),
       set_config('t.ob','a5000000-0000-0000-0000-000000000005',false), set_config('t.oa2','a5000000-0000-0000-0000-000000000006',false);
create function pg_temp.resp(p_pac text) returns text language sql as $$ select coalesce(dentista_responsable_id::text, 'NULL') from pacientes where id = p_pac::uuid $$;

select pg_temp.t('O1 por omisión NADIE tiene la marca (el dueño que no atiende pacientes no se mezcla en las listas)',
  not exists (select 1 from usuarios where ejerce_como_dentista));
select pg_temp.t('O2 SIN la marca, un owner NO puede asignarse como responsable (la base rechaza, como antes)',
  pg_temp.como(current_setting('t.oa')::uuid, format('update pacientes set dentista_responsable_id = %L where id = %L', current_setting('t.oa'), 'b5000000-0000-0000-0000-00000000000a')) like 'ERR|P0001|El odontólogo responsable debe ser un dentista%'
  and pg_temp.resp('b5000000-0000-0000-0000-00000000000a') = 'NULL');
select pg_temp.t('O3 sin la marca, un owner tampoco puede CREAR un paciente asignado a sí mismo',
  pg_temp.como(current_setting('t.oa')::uuid, format('insert into pacientes (clinica_id, nombre_completo, dentista_responsable_id) values (%L, ''X'', %L)', 'c5000000-0000-0000-0000-00000000000a', current_setting('t.oa'))) like 'ERR|P0001|%');

-- El propio owner se marca
select set_config('t.r4', pg_temp.como(current_setting('t.oa')::uuid, format('update usuarios set ejerce_como_dentista = true where id = %L', current_setting('t.oa'))), false);
select pg_temp.t('O4 el propio owner puede marcarse como dentista (su fila)',
  current_setting('t.r4') = 'OK:1' and (select ejerce_como_dentista from usuarios where id = current_setting('t.oa')::uuid));
select pg_temp.t('O5 con la marca, el owner SÍ puede asignarse como responsable de un paciente existente',
  pg_temp.como(current_setting('t.oa')::uuid, format('update pacientes set dentista_responsable_id = %L where id = %L', current_setting('t.oa'), 'b5000000-0000-0000-0000-00000000000a')) = 'OK:1'
  and pg_temp.resp('b5000000-0000-0000-0000-00000000000a') = current_setting('t.oa'));
select pg_temp.t('O6 con la marca, el owner SÍ puede crear un paciente asignado a sí mismo',
  pg_temp.como(current_setting('t.oa')::uuid, format('insert into pacientes (id, clinica_id, nombre_completo, dentista_responsable_id) values (%L, %L, ''Creado por el owner-dentista'', %L)', 'b5000000-0000-0000-0000-0000000000dd', 'c5000000-0000-0000-0000-00000000000a', current_setting('t.oa'))) = 'OK:1'
  and pg_temp.resp('b5000000-0000-0000-0000-0000000000dd') = current_setting('t.oa'));
select pg_temp.t('O7 el owner marcado sigue viendo TODOS los pacientes de su clínica (no se vuelve "solo los suyos") y ninguno de B',
  pg_temp.val(current_setting('t.oa')::uuid, 'select count(*)::text from pacientes') = '3'
  and pg_temp.val(current_setting('t.oa')::uuid, $q$select count(*)::text from pacientes where clinica_id = 'c5000000-0000-0000-0000-00000000000b'$q$) = '0');

-- Aislamiento entre clínicas
select pg_temp.t('O8 un owner marcado de OTRA clínica no se puede asignar a un paciente de ésta',
  pg_temp.como(current_setting('t.ob')::uuid, format('update usuarios set ejerce_como_dentista = true where id = %L', current_setting('t.ob'))) = 'OK:1'
  and pg_temp.como(current_setting('t.oa')::uuid, format('update pacientes set dentista_responsable_id = %L where id = %L', current_setting('t.ob'), 'b5000000-0000-0000-0000-00000000000b')) like 'ERR|P0001|%'
  and pg_temp.resp('b5000000-0000-0000-0000-00000000000b') = 'NULL');
select pg_temp.t('O9 el owner de A no puede marcar ni desmarcar a un usuario de B (la política de usuarios no se lo permite: 0 filas)',
  pg_temp.como(current_setting('t.oa')::uuid, format('update usuarios set ejerce_como_dentista = false where id = %L', current_setting('t.ob'))) = 'OK:0'
  and (select ejerce_como_dentista from usuarios where id = current_setting('t.ob')::uuid));

-- Nadie más se puede marcar
select pg_temp.t('O10 un DENTISTA no puede marcarse (la restricción lo impide: solo un propietario puede ejercer como dentista por esta vía)',
  pg_temp.como(current_setting('t.da')::uuid, format('update usuarios set ejerce_como_dentista = true where id = %L', current_setting('t.da'))) like 'ERR|23514|%');
select pg_temp.t('O11 un ASISTENTE y RECEPCIÓN tampoco',
  pg_temp.como(current_setting('t.as')::uuid, format('update usuarios set ejerce_como_dentista = true where id = %L', current_setting('t.as'))) like 'ERR|23514|%'
  and pg_temp.como(current_setting('t.re')::uuid, format('update usuarios set ejerce_como_dentista = true where id = %L', current_setting('t.re'))) like 'ERR|23514|%');
select pg_temp.t('O12 un dentista no puede marcar a OTRO usuario (no tiene política de actualización sobre los demás: 0 filas)',
  pg_temp.como(current_setting('t.da')::uuid, format('update usuarios set ejerce_como_dentista = true where id = %L', current_setting('t.oa2'))) = 'OK:0'
  and not (select ejerce_como_dentista from usuarios where id = current_setting('t.oa2')::uuid));
select pg_temp.t('O13 ni siquiera un owner puede marcar a un dentista/asistente de su clínica (la restricción lo impide)',
  pg_temp.como(current_setting('t.oa')::uuid, format('update usuarios set ejerce_como_dentista = true where id = %L', current_setting('t.da'))) like 'ERR|23514|%'
  and pg_temp.como(current_setting('t.oa')::uuid, format('update usuarios set ejerce_como_dentista = true where id = %L', current_setting('t.as'))) like 'ERR|23514|%');
select pg_temp.t('O14 no se puede cambiar de rol a un owner marcado sin quitarle antes la marca (la restricción lo impide)',
  (select count(*) from usuarios where ejerce_como_dentista and id = current_setting('t.oa')::uuid) = 1
  and (pg_temp.do_falla('update usuarios set rol = ''dentista'' where id = ''' || current_setting('t.oa') || '''') = '23514'));

-- Regresión: lo de antes sigue igual
select pg_temp.t('O15 un dentista sigue autoasignándose al crear un paciente (aunque mande a otro) — regresión',
  pg_temp.como(current_setting('t.da')::uuid, format('insert into pacientes (id, clinica_id, nombre_completo, dentista_responsable_id) values (%L, %L, ''De dentista'', %L)', 'b5000000-0000-0000-0000-0000000000d1', 'c5000000-0000-0000-0000-00000000000a', current_setting('t.oa'))) = 'OK:1'
  and pg_temp.resp('b5000000-0000-0000-0000-0000000000d1') = current_setting('t.da'));
select pg_temp.t('O16 recepción sigue sin decidir el responsable (queda sin asignar) — regresión',
  pg_temp.como(current_setting('t.re')::uuid, format('insert into pacientes (id, clinica_id, nombre_completo, dentista_responsable_id) values (%L, %L, ''De recepción'', %L)', 'b5000000-0000-0000-0000-0000000000d2', 'c5000000-0000-0000-0000-00000000000a', current_setting('t.da'))) = 'OK:1'
  and pg_temp.resp('b5000000-0000-0000-0000-0000000000d2') = 'NULL');
select set_config('t.r17', pg_temp.como(current_setting('t.da')::uuid, format('update pacientes set dentista_responsable_id = null where id = %L', 'b5000000-0000-0000-0000-0000000000d1')), false);
select pg_temp.t('O17 solo el owner reasigna: un dentista (aun sobre SU paciente) y recepción siguen rechazados — regresión',
  current_setting('t.r17') like 'ERR|P0001|Solo el owner%'
  and pg_temp.como(current_setting('t.re')::uuid, format('update pacientes set dentista_responsable_id = %L where id = %L', current_setting('t.da'), 'b5000000-0000-0000-0000-00000000000b')) like 'ERR|%'
  and pg_temp.resp('b5000000-0000-0000-0000-0000000000d1') = current_setting('t.da'));
select pg_temp.t('O18 el owner sigue pudiendo asignar a un dentista normal y dejar "sin asignar" — regresión',
  pg_temp.como(current_setting('t.oa')::uuid, format('update pacientes set dentista_responsable_id = %L where id = %L', current_setting('t.da'), 'b5000000-0000-0000-0000-00000000000b')) = 'OK:1'
  and pg_temp.como(current_setting('t.oa')::uuid, format('update pacientes set dentista_responsable_id = null where id = %L', 'b5000000-0000-0000-0000-00000000000b')) = 'OK:1'
  and pg_temp.resp('b5000000-0000-0000-0000-00000000000b') = 'NULL');

-- Asistentes y auditoría
select set_config('t.r19', pg_temp.como(current_setting('t.oa')::uuid, format('insert into asistente_dentista_asignaciones (clinica_id, asistente_id, dentista_id) values (%L, %L, %L)', 'c5000000-0000-0000-0000-00000000000a', current_setting('t.as'), current_setting('t.oa'))), false);
select pg_temp.t('O19 el owner puede vincular un asistente con un owner-dentista, y el asistente ve SUS pacientes (y no los de otros)',
  current_setting('t.r19') = 'OK:1'
  and pg_temp.val(current_setting('t.as')::uuid, format('select auth_paciente_asignado(%L)::text', 'b5000000-0000-0000-0000-00000000000a')) = 'true'
  and pg_temp.val(current_setting('t.as')::uuid, format('select auth_paciente_asignado(%L)::text', 'b5000000-0000-0000-0000-0000000000d1')) = 'false');
select pg_temp.t('O19b NO se puede vincular a un asistente con un owner SIN la marca, ni con un dentista de otra clínica, y solo el owner escribe',
  pg_temp.como(current_setting('t.oa')::uuid, format('insert into asistente_dentista_asignaciones (clinica_id, asistente_id, dentista_id) values (%L, %L, %L)', 'c5000000-0000-0000-0000-00000000000a', current_setting('t.as'), current_setting('t.oa2'))) like 'ERR|42501|%'
  and pg_temp.como(current_setting('t.oa')::uuid, format('insert into asistente_dentista_asignaciones (clinica_id, asistente_id, dentista_id) values (%L, %L, %L)', 'c5000000-0000-0000-0000-00000000000a', current_setting('t.as'), current_setting('t.ob'))) like 'ERR|42501|%'
  and pg_temp.como(current_setting('t.da')::uuid, format('insert into asistente_dentista_asignaciones (clinica_id, asistente_id, dentista_id) values (%L, %L, %L)', 'c5000000-0000-0000-0000-00000000000a', current_setting('t.as'), current_setting('t.da'))) like 'ERR|42501|%');
select pg_temp.t('O19c vincular a un asistente con un dentista normal sigue funcionando — regresión',
  pg_temp.como(current_setting('t.oa')::uuid, format('insert into asistente_dentista_asignaciones (clinica_id, asistente_id, dentista_id) values (%L, %L, %L)', 'c5000000-0000-0000-0000-00000000000a', current_setting('t.as'), current_setting('t.da'))) = 'OK:1');
create temp table _aud as select count(*) n from auditoria where entidad = 'usuarios';
select set_config('t.r20', pg_temp.como(current_setting('t.oa2')::uuid, format('update usuarios set ejerce_como_dentista = true where id = %L', current_setting('t.oa2'))), false);
select pg_temp.t('O20 marcar o desmarcar queda en la auditoría',
  current_setting('t.r20') = 'OK:1' and (select count(*) from auditoria where entidad = 'usuarios') > (select n from _aud));

-- Desmarcar
select pg_temp.t('O21 al desmarcarse, el owner deja de poder ser asignado, pero lo ya asignado se conserva y sigue visible',
  pg_temp.como(current_setting('t.oa')::uuid, format('update usuarios set ejerce_como_dentista = false where id = %L', current_setting('t.oa'))) = 'OK:1'
  and pg_temp.como(current_setting('t.oa')::uuid, format('update pacientes set dentista_responsable_id = %L where id = %L', current_setting('t.oa'), 'b5000000-0000-0000-0000-00000000000b')) like 'ERR|P0001|%'
  and pg_temp.resp('b5000000-0000-0000-0000-00000000000a') = current_setting('t.oa')
  and pg_temp.val(current_setting('t.oa')::uuid, 'select count(*)::text from pacientes') = '5');
select pg_temp.t('O22 la función auxiliar solo es ejecutable por usuarios autenticados (no por anónimos)',
  not has_function_privilege('anon', 'fn_es_dentista_de_clinica(uuid,uuid)', 'EXECUTE') and has_function_privilege('authenticated', 'fn_es_dentista_de_clinica(uuid,uuid)', 'EXECUTE'));
select pg_temp.t('O23 la lista de dentistas que usa la interfaz (dentistas activos + owners marcados) es exacta',
  (select string_agg(nombre, ',' order by nombre) from usuarios where clinica_id = 'c5000000-0000-0000-0000-00000000000a' and activo
     and (rol = 'dentista' or (rol = 'owner' and ejerce_como_dentista))) = 'Dentista A,Segundo owner A');

do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO 084: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 150), ' | ') from _res where not ok); end if;
end $$;
rollback;
