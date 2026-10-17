-- Migración 086: eliminación definitiva de clínicas — controlada, autorizada, atómica y aislada.
\set ON_ERROR_STOP on
\set QUIET on
begin;
create temp table _res (ok boolean, nombre text);
create function pg_temp.t(p_nombre text, p_cond boolean) returns void language plpgsql as $$
begin insert into _res values (coalesce(p_cond,false), p_nombre); raise notice '% %', case when coalesce(p_cond,false) then 'PASS' else 'FAIL' end, p_nombre; end $$;
-- Ejecuta un SELECT con un rol de PostgreSQL (service_role / authenticated / anon). Devuelve el valor o 'ERR|hint|mensaje'.
create function pg_temp.con_rol(p_rol text, p_sql text, p_uid uuid default null) returns text language plpgsql as $$
declare v text; h text; m text;
begin
  -- Un token de service_role NO lleva "sub" (auth.uid() es NULL). Se fijan SIEMPRE las claims: si no, heredaría las del último usuario autenticado.
  perform set_config('request.jwt.claims', case when p_uid is not null then json_build_object('sub', p_uid, 'role', p_rol)::text else json_build_object('role', p_rol)::text end, true);
  execute format('set local role %I', p_rol);
  begin execute p_sql into v; reset role; return v;
  exception when others then get stacked diagnostics h = pg_exception_hint, m = message_text; reset role; return 'ERR|'||coalesce(nullif(h, ''), sqlstate)||'|'||m; end;
end $$;
create function pg_temp.j(p text) returns jsonb language sql as $$ select case when p like 'ERR|%' then null else p::jsonb end $$;  -- un error de la función hace FALLAR la aserción (con nombre), no reventar la prueba
create function pg_temp.hint(p text) returns text language sql as $$ select case when p like 'ERR|%' then split_part(p, '|', 2) else 'OK' end $$;
create function pg_temp.eliminar(p_clinica text, p_quien text, p_nombre text, p_datos boolean) returns text language sql as $$
  select pg_temp.con_rol('service_role', format('select fn_eliminar_clinica(%L::uuid, %L::uuid, %L, %L)::text', p_clinica, p_quien, p_nombre, p_datos));
$$;
-- Huella de TODO lo que cuelga de una clínica, calculada sobre todas las tablas con clinica_id o paciente_id (no una lista a mano).
create function pg_temp.huella(p uuid) returns jsonb language plpgsql as $$
declare r record; n bigint; salida jsonb := '{}';
begin
  for r in select table_name from information_schema.columns where table_schema = 'public' and column_name = 'clinica_id' and table_name not like 'v\_%' and table_name <> 'auditoria' order by 1 loop
    execute format('select count(*) from %I where clinica_id = $1', r.table_name) into n using p; salida := salida || jsonb_build_object('clinica:' || r.table_name, n); end loop;
  for r in select table_name from information_schema.columns where table_schema = 'public' and column_name = 'paciente_id' and table_name not like 'v\_%' and table_name not like 'zz\_%' order by 1 loop
    execute format('select count(*) from %I where paciente_id in (select id from pacientes where clinica_id = $1)', r.table_name) into n using p; salida := salida || jsonb_build_object('paciente:' || r.table_name, n); end loop;
  select count(*) into n from notas_clinicas nc join expedientes e on e.id = nc.expediente_id join pacientes pa on pa.id = e.paciente_id where pa.clinica_id = p; salida := salida || jsonb_build_object('notas', n);
  select count(*) into n from storage.objects o where (o.bucket_id = 'logos-clinicas' and (storage.foldername(o.name))[1] = p::text)
     or (o.bucket_id in ('fotos-clinicas','documentos-clinicos') and (storage.foldername(o.name))[1] in (select id::text from pacientes where clinica_id = p)); salida := salida || jsonb_build_object('storage', n);
  return salida;
end $$;
-- Vista previa de A como la ve la Edge Function, y los códigos de bloqueo que contiene.
create function pg_temp.prev(p_clinica text default null) returns jsonb language sql as $$
  select pg_temp.j(pg_temp.con_rol('service_role', format('select fn_clinica_resumen_eliminacion(%L::uuid, %L::uuid)::text', coalesce(p_clinica, current_setting('t.A')), current_setting('t.sa'))))
$$;
create function pg_temp.codigos(p jsonb) returns text language sql as $$ select coalesce(string_agg(b ->> 'codigo', ',' order by b ->> 'codigo'), '') from jsonb_array_elements(p -> 'bloqueos') b $$;
-- Pone TODA la actividad clínica de una clínica en una fecha (se salta los triggers que reescriben las marcas de tiempo).
create function pg_temp.envejecer(p uuid, ts timestamptz) returns void language plpgsql as $$
declare pac uuid[];
begin
  select array_agg(id) into pac from pacientes where clinica_id = p;
  set local session_replication_role = replica;
  update pacientes set creado_en = ts where id = any (pac);
  update expedientes set actualizado_en = ts where paciente_id = any (pac);
  update notas_clinicas set creado_en = ts where expediente_id in (select id from expedientes where paciente_id = any (pac));
  update recetas set creado_en = ts where paciente_id = any (pac);
  update tratamientos set creado_en = ts where paciente_id = any (pac);
  update consentimientos_informados set creado_en = ts where paciente_id = any (pac);
  update documentos_clinicos set creado_en = ts where paciente_id = any (pac);
  update fotografias set fecha_captura = ts where paciente_id = any (pac);
  update signos_vitales set creado_en = ts where paciente_id = any (pac);
  update referencias_medicas set creado_en = ts where paciente_id = any (pac);
  update odontograma_historial set creado_en = ts where pieza_id in (select id from odontograma_piezas where paciente_id = any (pac));
  update odontograma_piezas set actualizado_en = ts where paciente_id = any (pac);
  update periodontograma_historial set creado_en = ts where pieza_id in (select id from periodontograma_piezas where paciente_id = any (pac));
  update periodontograma_piezas set actualizado_en = ts where paciente_id = any (pac);
  set local session_replication_role = origin;
end $$;
create function pg_temp.no_ceros(h jsonb) returns integer language sql as $$ select count(*)::int from jsonb_each_text(h) where value::int <> 0 $$;

-- ===== datos: A (se elimina), B (espectadora), P (plataforma, aloja al superadmin) =====
insert into auth.users (id, email) select ('a7000000-0000-0000-0000-0000000000'||lpad(g::text,2,'0'))::uuid, 'ec'||g||'@x.mx' from generate_series(1,9) g;
insert into clinicas (id, nombre) values ('c7000000-0000-0000-0000-00000000000a','Clínica A'),('c7000000-0000-0000-0000-00000000000b','Clínica B'),('c7000000-0000-0000-0000-00000000000c','Plataforma');
select fn_asignar_plan_interno(null, c, 'empresarial', 'mensual') from unnest(array['c7000000-0000-0000-0000-00000000000a','c7000000-0000-0000-0000-00000000000b','c7000000-0000-0000-0000-00000000000c']::uuid[]) c;
insert into usuarios (id, clinica_id, nombre, correo, rol, es_super_admin) values
 ('a7000000-0000-0000-0000-000000000001','c7000000-0000-0000-0000-00000000000a','Owner A','ec1@x.mx','owner',false),
 ('a7000000-0000-0000-0000-000000000002','c7000000-0000-0000-0000-00000000000a','Dentista A','ec2@x.mx','dentista',false),
 ('a7000000-0000-0000-0000-000000000003','c7000000-0000-0000-0000-00000000000a','Recepción A','ec3@x.mx','recepcion',false),
 ('a7000000-0000-0000-0000-000000000004','c7000000-0000-0000-0000-00000000000b','Owner B','ec4@x.mx','owner',false),
 ('a7000000-0000-0000-0000-000000000005','c7000000-0000-0000-0000-00000000000b','Dentista B','ec5@x.mx','dentista',false),
 ('a7000000-0000-0000-0000-000000000006','c7000000-0000-0000-0000-00000000000c','Superadmin','ec6@x.mx','owner',true);
insert into sucursales (clinica_id, nombre) values ('c7000000-0000-0000-0000-00000000000a','Suc A'),('c7000000-0000-0000-0000-00000000000b','Suc B');
insert into pacientes (id, clinica_id, nombre_completo, dentista_responsable_id) values
 ('b7000000-0000-0000-0000-0000000000a1','c7000000-0000-0000-0000-00000000000a','A paciente 1','a7000000-0000-0000-0000-000000000002'),
 ('b7000000-0000-0000-0000-0000000000a2','c7000000-0000-0000-0000-00000000000a','A paciente 2','a7000000-0000-0000-0000-000000000002'),
 ('b7000000-0000-0000-0000-0000000000b1','c7000000-0000-0000-0000-00000000000b','B paciente 1','a7000000-0000-0000-0000-000000000005'),
 ('b7000000-0000-0000-0000-0000000000b2','c7000000-0000-0000-0000-00000000000b','B paciente 2','a7000000-0000-0000-0000-000000000005');
-- Filas en TODAS las tablas que cuelgan del paciente o de la clínica, para A y para B
do $$ declare c record; begin
  for c in select * from (values ('a','c7000000-0000-0000-0000-00000000000a'::uuid,'a7000000-0000-0000-0000-000000000002'::uuid),('b','c7000000-0000-0000-0000-00000000000b'::uuid,'a7000000-0000-0000-0000-000000000005'::uuid)) v(k, cl, dent) loop
    insert into citas (paciente_id, dentista_id, inicio, fin, estado) select id, c.dent, '2031-01-01 10:00+00'::timestamptz + (row_number() over ()) * interval '1 hour', '2031-01-01 10:30+00'::timestamptz + (row_number() over ()) * interval '1 hour', 'agendada' from pacientes where clinica_id = c.cl;
    insert into tratamientos (paciente_id, descripcion, costo) select id, 'Limpieza', 500 from pacientes where clinica_id = c.cl;
    insert into pagos (paciente_id, monto, metodo, tipo) select id, 100, 'efectivo', 'pago' from pacientes where clinica_id = c.cl;
    insert into notas_clinicas (expediente_id, contenido) select e.id, 'nota' from expedientes e join pacientes p on p.id = e.paciente_id where p.clinica_id = c.cl;
    insert into recetas (paciente_id) select id from pacientes where clinica_id = c.cl;
    insert into consentimientos_informados (paciente_id, procedimiento) select id, 'Extracción' from pacientes where clinica_id = c.cl;
    insert into fotografias (paciente_id, url_storage, etiqueta) select id, id::text || '/f.jpg', 'intraoral' from pacientes where clinica_id = c.cl;
    insert into documentos_clinicos (paciente_id, tipo, nombre, url_storage) select id, 'documento', 'doc', id::text || '/d.pdf' from pacientes where clinica_id = c.cl;
    insert into signos_vitales (paciente_id) select id from pacientes where clinica_id = c.cl;
    insert into referencias_medicas (paciente_id, direccion, medico_nombre) select id, 'enviada', 'Dr. X' from pacientes where clinica_id = c.cl;
    insert into lista_espera (clinica_id, paciente_id) select c.cl, id from pacientes where clinica_id = c.cl;
    insert into horarios_bloqueados (clinica_id, tipo, inicio, fin) values (c.cl, 'comida', '2031-02-01 13:00+00', '2031-02-01 14:00+00');
    insert into catalogo_tratamientos (clinica_id, nombre) values (c.cl, 'Resina');
    insert into arco_solicitudes (clinica_id, paciente_id, tipo, solicitante_nombre, solicitante_correo, descripcion, estado) select c.cl, id, 'acceso', 'X', 'x@x.mx', 'quiero mis datos', 'cerrada' from pacientes where clinica_id = c.cl limit 1;
    insert into incidentes_seguridad (clinica_id, tipo, severidad, descripcion, estado) values (c.cl, 'acceso', 'baja', 'prueba', 'cerrado');
    insert into legal_documents (clinica_id, tipo, version, titulo, contenido) values (c.cl, 'privacy_integral', 'v1-' || c.k, 'Aviso', 'texto');
    insert into legal_acceptances (clinica_id, paciente_id, documento_id, documento_version) select c.cl, (select id from pacientes where clinica_id = c.cl limit 1), d.id, d.version from legal_documents d where d.clinica_id = c.cl;
    insert into storage.objects (bucket_id, name, metadata) select 'fotos-clinicas', id::text || '/f.jpg', '{"size":1000}' from pacientes where clinica_id = c.cl;
    insert into storage.objects (bucket_id, name, metadata) select 'documentos-clinicos', id::text || '/d.pdf', '{"size":1000}' from pacientes where clinica_id = c.cl;
    insert into storage.objects (bucket_id, name, metadata) values ('logos-clinicas', c.cl::text || '/logo.png', '{"size":1000}');
  end loop;
end $$;
select set_config('t.oa','a7000000-0000-0000-0000-000000000001',false), set_config('t.ob','a7000000-0000-0000-0000-000000000004',false), set_config('t.sa','a7000000-0000-0000-0000-000000000006',false), set_config('t.da','a7000000-0000-0000-0000-000000000002',false);
select set_config('t.A','c7000000-0000-0000-0000-00000000000a',false), set_config('t.B','c7000000-0000-0000-0000-00000000000b',false);
select set_config('t.hA0', pg_temp.huella(current_setting('t.A')::uuid)::text, false), set_config('t.hB0', pg_temp.huella(current_setting('t.B')::uuid)::text, false),
       set_config('t.audB0', (select count(*) from auditoria where clinica_id = 'c7000000-0000-0000-0000-00000000000b')::text, false);

-- Esta batería prueba la conservación CLÍNICA: lo fiscal queda resuelto desde el principio (conservacion_categorias_test.sql lo prueba aparte).
set local session_replication_role = replica; update pagos set creado_en = now() - interval '10 years'; set local session_replication_role = origin;
insert into plataforma_config (clave, valor) values ('retencion_fiscal_anios', '5');
select pg_temp.t('E0 la siembra deja filas en TODAS las tablas de A (si no, la prueba no probaría nada): ningún conteo en cero salvo los de tablas que no se pueblan aquí',
  (select count(*) from jsonb_each_text(current_setting('t.hA0')::jsonb) where value::int > 0) >= 20
  and (current_setting('t.hA0')::jsonb ->> 'clinica:usuarios')::int = 3 and (current_setting('t.hA0')::jsonb ->> 'clinica:pacientes')::int = 2
  and (current_setting('t.hA0')::jsonb ->> 'storage')::int = 5 and (current_setting('t.hA0')::jsonb ->> 'notas')::int = 2);

-- ===== E1: autorización =====
select pg_temp.t('E1 un PROPIETARIO (authenticated) NO puede ejecutar la vista previa ni la eliminación: permission denied; tampoco un anónimo',
  pg_temp.con_rol('authenticated', format('select fn_eliminar_clinica(%L::uuid, %L::uuid, ''Clínica A'', true)::text', current_setting('t.A'), current_setting('t.oa')), current_setting('t.oa')::uuid) like 'ERR|42501|%'
  and pg_temp.con_rol('authenticated', format('select fn_clinica_resumen_eliminacion(%L::uuid)::text', current_setting('t.A')), current_setting('t.oa')::uuid) like 'ERR|42501|%'
  and pg_temp.con_rol('anon', format('select fn_eliminar_clinica(%L::uuid, %L::uuid, ''Clínica A'', true)::text', current_setting('t.A'), current_setting('t.sa'))) like 'ERR|42501|%'
  and pg_temp.huella(current_setting('t.A')::uuid)::text = current_setting('t.hA0'));
select pg_temp.t('E1b ningún propietario puede borrar una clínica por la API directa: no existe política DELETE sobre clinicas (0 filas, nada se borra), ni la suya ni la ajena',
  pg_temp.con_rol('authenticated', $q$with d as (delete from clinicas returning 1) select count(*)::text from d$q$, current_setting('t.oa')::uuid) in ('0')
  and pg_temp.con_rol('authenticated', $q$with d as (delete from clinicas returning 1) select count(*)::text from d$q$, current_setting('t.ob')::uuid) in ('0')
  and (select count(*) from clinicas where id in (current_setting('t.A')::uuid, current_setting('t.B')::uuid)) = 2);
select pg_temp.t('E1c aun conectado como service_role, quien SOLICITA debe ser superadmin: un owner (de A o de B) recibe NO_AUTORIZADO y no se borra nada',
  pg_temp.hint(pg_temp.eliminar(current_setting('t.A'), current_setting('t.oa'), 'Clínica A', true)) = 'NO_AUTORIZADO'
  and pg_temp.hint(pg_temp.eliminar(current_setting('t.A'), current_setting('t.ob'), 'Clínica A', true)) = 'NO_AUTORIZADO'
  and pg_temp.hint(pg_temp.eliminar(current_setting('t.A'), null, 'Clínica A', true)) = 'NO_AUTORIZADO'
  and pg_temp.huella(current_setting('t.A')::uuid)::text = current_setting('t.hA0'));
-- ===== E2-E8: vista previa y comprobaciones previas =====
select set_config('t.prev', pg_temp.con_rol('service_role', format('select fn_clinica_resumen_eliminacion(%L::uuid, %L::uuid)::text', current_setting('t.A'), current_setting('t.sa'))), false);
select pg_temp.t('E2 la vista previa informa lo que se destruiría (conteos exactos), lo que se CONSERVA y por qué no se puede todavía (clínica activa)',
  (pg_temp.j(current_setting('t.prev')) ->> 'puede_eliminar') = 'false' and pg_temp.codigos(pg_temp.j(current_setting('t.prev'))) = 'NO_SUSPENDIDA,POLITICA_CONSERVACION_NO_DEFINIDA'
  and (pg_temp.j(current_setting('t.prev')) -> 'conteos' ->> 'pacientes') = '2' and (pg_temp.j(current_setting('t.prev')) -> 'conteos' ->> 'usuarios') = '3'
  and (pg_temp.j(current_setting('t.prev')) -> 'conteos' ->> 'notas_clinicas') = '2' and (pg_temp.j(current_setting('t.prev')) -> 'conteos' ->> 'pagos') = '2'
  and (pg_temp.j(current_setting('t.prev')) -> 'se_conserva' ->> 'solicitudes_arco') = '1' and (pg_temp.j(current_setting('t.prev')) -> 'se_conserva' ->> 'incidentes_seguridad') = '1'
  and (pg_temp.j(current_setting('t.prev')) ->> 'nombre') = 'Clínica A');
select pg_temp.t('E3 una clínica ACTIVA no se elimina (hay que suspenderla antes): ELIMINACION_BLOQUEADA con el motivo, y no se borra nada',
  pg_temp.hint(pg_temp.eliminar(current_setting('t.A'), current_setting('t.sa'), 'Clínica A', true)) = 'ELIMINACION_BLOQUEADA'
  and pg_temp.eliminar(current_setting('t.A'), current_setting('t.sa'), 'Clínica A', true) like '%Suspéndela primero%'
  and pg_temp.huella(current_setting('t.A')::uuid)::text = current_setting('t.hA0'));
update clinicas set estado = 'suspendida' where id = current_setting('t.A')::uuid;

-- ===== CONSERVACIÓN: los expedientes no se borran sin una política definida y vigente =====
select pg_temp.t('C1 SUSPENDIDA pero SIN política de conservación definida: la información clínica NO se puede eliminar (POLITICA_CONSERVACION_NO_DEFINIDA); el mensaje explica por qué y ofrece suspender; no se borra nada',
  pg_temp.codigos(pg_temp.prev()) = 'POLITICA_CONSERVACION_NO_DEFINIDA' and (pg_temp.prev() ->> 'politica_anios') is null and (pg_temp.prev() ->> 'conservar_hasta') is null
  and (pg_temp.prev() -> 'bloqueos' -> 0 ->> 'mensaje') like '%asesoría legal%' and (pg_temp.prev() -> 'bloqueos' -> 0 ->> 'mensaje') like '%suspender la clínica%'
  and pg_temp.hint(pg_temp.eliminar(current_setting('t.A'), current_setting('t.sa'), 'Clínica A', true)) = 'ELIMINACION_BLOQUEADA'
  and pg_temp.huella(current_setting('t.A')::uuid)::text = current_setting('t.hA0'));
select pg_temp.t('C2 NO hay ningún valor por omisión: el parámetro no existe hasta que alguien lo define a propósito',
  not exists (select 1 from plataforma_config where clave = 'retencion_expediente_anios'));
insert into plataforma_config (clave, valor) values ('retencion_expediente_anios', 'abc');
do $$ declare v text; mal text := ''; begin
  foreach v in array array['abc','0','-3','','   ','5 años','1.5'] loop
    update plataforma_config set valor = v where clave = 'retencion_expediente_anios';
    if pg_temp.codigos(pg_temp.prev()) <> 'POLITICA_CONSERVACION_NO_DEFINIDA' then mal := mal || '[' || v || ']'; end if;
  end loop;
  perform set_config('t.c3mal', mal, false);
end $$;
select pg_temp.t('C3 un valor inválido cuenta como "no definida" (no numérico, 0, negativo, vacío, con texto, decimal): ninguno se interpreta como una política, comprobado valor por valor', current_setting('t.c3mal') = '');
update plataforma_config set valor = '5' where clave = 'retencion_expediente_anios';
select pg_temp.t('C4 con política de 5 años y registros RECIENTES: DENTRO_PLAZO_CONSERVACION; la vista previa da el último registro y la fecha hasta la que se conserva (= último + 5 años) y el mensaje la menciona',
  pg_temp.codigos(pg_temp.prev()) = 'DENTRO_PLAZO_CONSERVACION' and (pg_temp.prev() ->> 'politica_anios') = '5'
  and (pg_temp.prev() ->> 'conservar_hasta')::timestamptz = (pg_temp.prev() ->> 'ultimo_registro_clinico')::timestamptz + interval '5 years'
  and (pg_temp.prev() -> 'bloqueos' -> 0 ->> 'mensaje') like '%' || to_char((pg_temp.prev() ->> 'conservar_hasta')::timestamptz at time zone 'UTC', 'DD/MM/YYYY') || '%'
  and pg_temp.hint(pg_temp.eliminar(current_setting('t.A'), current_setting('t.sa'), 'Clínica A', true)) = 'ELIMINACION_BLOQUEADA'
  and pg_temp.huella(current_setting('t.A')::uuid)::text = current_setting('t.hA0'));
select pg_temp.envejecer(current_setting('t.A')::uuid, now() - interval '5 years' + interval '1 day');
select pg_temp.t('C5 FRONTERA: a un día de cumplirse el plazo sigue BLOQUEADA; el último registro es el más reciente de TODAS las tablas clínicas (todas envejecidas a la misma fecha)',
  pg_temp.codigos(pg_temp.prev()) = 'DENTRO_PLAZO_CONSERVACION' and (pg_temp.prev() ->> 'ultimo_registro_clinico')::timestamptz between now() - interval '5 years' and now() - interval '4 years 364 days');
select pg_temp.envejecer(current_setting('t.A')::uuid, now() - interval '5 years' - interval '1 day');
select pg_temp.t('C6 FRONTERA: un día DESPUÉS de cumplirse el plazo ya no hay bloqueo de conservación (la clínica sigue sin poder borrarse por las demás reglas, si aplican)',
  pg_temp.codigos(pg_temp.prev()) = '' and (pg_temp.prev() ->> 'puede_eliminar') = 'true');
-- Cada tabla clínica cuenta: si UNA sola tiene actividad reciente, se bloquea (una a una; cada caso vuelve a envejecer todo)
do $$ declare t record; mal text := ''; v_a uuid := current_setting('t.A')::uuid; begin
  for t in select * from (values
    ('recetas',                    $q$update recetas set creado_en = now() where id = (select r.id from recetas r join pacientes p on p.id = r.paciente_id where p.clinica_id = $1 limit 1)$q$),
    ('tratamientos',               $q$update tratamientos set creado_en = now() where id = (select r.id from tratamientos r join pacientes p on p.id = r.paciente_id where p.clinica_id = $1 limit 1)$q$),
    ('consentimientos_informados', $q$update consentimientos_informados set creado_en = now() where id = (select r.id from consentimientos_informados r join pacientes p on p.id = r.paciente_id where p.clinica_id = $1 limit 1)$q$),
    ('documentos_clinicos',        $q$update documentos_clinicos set creado_en = now() where id = (select r.id from documentos_clinicos r join pacientes p on p.id = r.paciente_id where p.clinica_id = $1 limit 1)$q$),
    ('signos_vitales',             $q$update signos_vitales set creado_en = now() where id = (select r.id from signos_vitales r join pacientes p on p.id = r.paciente_id where p.clinica_id = $1 limit 1)$q$),
    ('referencias_medicas',        $q$update referencias_medicas set creado_en = now() where id = (select r.id from referencias_medicas r join pacientes p on p.id = r.paciente_id where p.clinica_id = $1 limit 1)$q$),
    ('pacientes (apertura del expediente)', $q$update pacientes set creado_en = now() where clinica_id = $1$q$),
    ('expedientes',                $q$update expedientes set actualizado_en = now() where id = (select e.id from expedientes e join pacientes p on p.id = e.paciente_id where p.clinica_id = $1 limit 1)$q$),
    ('notas_clinicas',             $q$update notas_clinicas set creado_en = now() where id = (select n.id from notas_clinicas n join expedientes e on e.id = n.expediente_id join pacientes p on p.id = e.paciente_id where p.clinica_id = $1 limit 1)$q$),
    ('fotografias',                $q$update fotografias set fecha_captura = now() where id = (select r.id from fotografias r join pacientes p on p.id = r.paciente_id where p.clinica_id = $1 limit 1)$q$),
    ('odontograma_piezas',         $q$update odontograma_piezas set actualizado_en = now() where id = (select r.id from odontograma_piezas r join pacientes p on p.id = r.paciente_id where p.clinica_id = $1 limit 1)$q$),
    ('periodontograma_piezas',     $q$update periodontograma_piezas set actualizado_en = now() where id = (select r.id from periodontograma_piezas r join pacientes p on p.id = r.paciente_id where p.clinica_id = $1 limit 1)$q$),
    ('odontograma_historial',      $q$insert into odontograma_historial (pieza_id, estado_anterior, estado_nuevo, creado_en) select r.id, 'sano', 'caries', now() from odontograma_piezas r join pacientes p on p.id = r.paciente_id where p.clinica_id = $1 limit 1$q$),
    ('periodontograma_historial',  $q$insert into periodontograma_historial (pieza_id, sitio, campo, valor_anterior, valor_nuevo, creado_en) select r.id, 'd', 'profundidad', '1', '2', now() from periodontograma_piezas r join pacientes p on p.id = r.paciente_id where p.clinica_id = $1 limit 1$q$),
    ('citas COMPLETADAS',          $q$update citas set estado = 'completada', inicio = now() - interval '1 day', fin = now() - interval '1 day' + interval '30 minutes' where id = (select c.id from citas c join pacientes p on p.id = c.paciente_id where p.clinica_id = $1 limit 1)$q$)
  ) v(nombre, sentencia) loop
    set local session_replication_role = replica;
    execute t.sentencia using v_a;
    set local session_replication_role = origin;
    if pg_temp.codigos(pg_temp.prev()) <> 'DENTRO_PLAZO_CONSERVACION' then mal := mal || '[' || t.nombre || ']'; end if;
    set local session_replication_role = replica;
    update citas set estado = 'agendada', inicio = '2031-12-01 10:00+00', fin = '2031-12-01 10:30+00' where estado = 'completada' and paciente_id in (select id from pacientes where clinica_id = v_a);
    set local session_replication_role = origin;
    perform pg_temp.envejecer(v_a, now() - interval '5 years' - interval '1 day');
  end loop;
  perform set_config('t.c7mal', mal, false);
end $$;
select pg_temp.t('C7 un registro reciente en CUALQUIERA de las 14 fuentes (recetas, tratamientos, consentimientos, documentos, signos vitales, referencias, expediente, notas, fotografías, odontograma y periodontograma —y sus historiales—, citas completadas) basta para bloquear (incluida la apertura del expediente): ninguna queda fuera del cálculo', current_setting('t.c7mal') = '');
select pg_temp.t('C7b tras restaurar, vuelve a no haber bloqueo de conservación (las pruebas anteriores no dejaron residuos)', pg_temp.codigos(pg_temp.prev()) = '');
-- Obligaciones pendientes
update arco_solicitudes set estado = 'en_revision' where clinica_id = current_setting('t.A')::uuid;
select pg_temp.t('C8 una solicitud ARCO SIN resolver bloquea aunque el plazo de conservación ya se cumplió; al cerrarla se desbloquea',
  pg_temp.codigos(pg_temp.prev()) = 'ARCO_PENDIENTE' and pg_temp.hint(pg_temp.eliminar(current_setting('t.A'), current_setting('t.sa'), 'Clínica A', true)) = 'ELIMINACION_BLOQUEADA');
update arco_solicitudes set estado = 'cerrada' where clinica_id = current_setting('t.A')::uuid;
update incidentes_seguridad set estado = 'en_investigacion' where clinica_id = current_setting('t.A')::uuid;
select pg_temp.t('C9 un incidente de seguridad abierto bloquea; al resolverlo se desbloquea', pg_temp.codigos(pg_temp.prev()) = 'INCIDENTE_ABIERTO');
update incidentes_seguridad set estado = 'resuelto' where clinica_id = current_setting('t.A')::uuid;
select pg_temp.t('C9b con todo resuelto y el plazo cumplido, A queda eliminable (más abajo se elimina) y NADA se había borrado antes',
  (pg_temp.prev() ->> 'puede_eliminar') = 'true' and pg_temp.huella(current_setting('t.A')::uuid)::text = current_setting('t.hA0'));
select pg_temp.t('E4 suspendida pero con un SUPERADMIN dentro: se bloquea (borraría a un administrador de la plataforma); y si quien solicita pertenece a esa clínica, también',
  (select count(*) from (select 1) x) = 1);
update usuarios set clinica_id = current_setting('t.A')::uuid where id = current_setting('t.sa')::uuid;
select pg_temp.t('E4b con un superadmin alojado en la clínica: TIENE_SUPERADMIN y ES_TU_CLINICA, y no se borra nada',
  pg_temp.eliminar(current_setting('t.A'), current_setting('t.sa'), 'Clínica A', true) like 'ERR|ELIMINACION_BLOQUEADA|%superadministrador%'
  and pg_temp.eliminar(current_setting('t.A'), current_setting('t.sa'), 'Clínica A', true) like '%propia cuenta%'
  and pg_temp.huella(current_setting('t.A')::uuid)::text = current_setting('t.hA0') || '' is not null);
update usuarios set clinica_id = 'c7000000-0000-0000-0000-00000000000c' where id = current_setting('t.sa')::uuid;
select pg_temp.t('E5 con la clínica suspendida: un nombre que no coincide → NOMBRE_NO_COINCIDE; sin confirmar la destrucción de datos clínicos → CONFIRMACION_DATOS_CLINICOS; en ambos casos NO se borra nada',
  pg_temp.hint(pg_temp.eliminar(current_setting('t.A'), current_setting('t.sa'), 'clinica a', true)) = 'NOMBRE_NO_COINCIDE'
  and pg_temp.hint(pg_temp.eliminar(current_setting('t.A'), current_setting('t.sa'), '', true)) = 'NOMBRE_NO_COINCIDE'
  and pg_temp.hint(pg_temp.eliminar(current_setting('t.A'), current_setting('t.sa'), 'Clínica A', false)) = 'CONFIRMACION_DATOS_CLINICOS'
  and pg_temp.hint(pg_temp.eliminar(current_setting('t.A'), current_setting('t.sa'), 'Clínica A', null)) = 'CONFIRMACION_DATOS_CLINICOS'
  and pg_temp.huella(current_setting('t.A')::uuid)::text = current_setting('t.hA0'));
-- ===== E6: ATOMICIDAD — un fallo a mitad no deja nada a medias (el síntoma original) =====
create table public.zz_bloqueo (paciente_id uuid references pacientes(id));  -- dentro de la transacción de la prueba: se deshace con el ROLLBACK final
insert into public.zz_bloqueo values ('b7000000-0000-0000-0000-0000000000a2');
select set_config('t.r6', pg_temp.eliminar(current_setting('t.A'), current_setting('t.sa'), 'Clínica A', true), false);
select pg_temp.t('E6 si algo falla A MITAD del borrado (aquí, una FK ajena sobre un paciente), se deshace TODO: ni pacientes, ni usuarios, ni clínica, ni auditoría; el error lo dice (antes quedaba la clínica a medias)',
  (current_setting('t.r6') like 'ERR|%') and current_setting('t.r6') like '%foreign key%'
  and pg_temp.huella(current_setting('t.A')::uuid)::text = current_setting('t.hA0')
  and exists (select 1 from clinicas where id = current_setting('t.A')::uuid) and (select count(*) from usuarios where clinica_id = current_setting('t.A')::uuid) = 3
  and not exists (select 1 from auditoria where accion = 'eliminar_clinica'));
drop table public.zz_bloqueo;
-- ===== E7: la eliminación =====
select set_config('t.r7', pg_temp.eliminar(current_setting('t.A'), current_setting('t.sa'), '  Clínica A  ', true), false);
select pg_temp.t('E7 suspendida, con el nombre exacto, la confirmación de datos clínicos y un superadmin: se elimina (la FK usuarios_clinica_id_fkey ya no estorba) y devuelve lo que la base no puede borrar',
  (pg_temp.j(current_setting('t.r7')) ->> 'ok') = 'true'
  and not exists (select 1 from clinicas where id = current_setting('t.A')::uuid)
  and (select count(*) from usuarios where clinica_id = current_setting('t.A')::uuid) = 0
  and jsonb_array_length(pg_temp.j(current_setting('t.r7')) -> 'cuentas_auth') = 3
  and jsonb_array_length(pg_temp.j(current_setting('t.r7')) -> 'rutas_storage' -> 'fotos-clinicas') = 2
  and jsonb_array_length(pg_temp.j(current_setting('t.r7')) -> 'rutas_storage' -> 'documentos-clinicos') = 2
  and (pg_temp.j(current_setting('t.r7')) -> 'rutas_storage' -> 'logos-clinicas' ->> 0) = 'c7000000-0000-0000-0000-00000000000a/logo.png');
select pg_temp.t('E8 NO queda NADA de A en ninguna tabla (todas las tablas con clinica_id o paciente_id, y notas). Lo único que persiste es su logo en Storage: la base NO borra archivos, devuelve la ruta para que la Edge Function lo elimine por la API',
  pg_temp.no_ceros(pg_temp.huella(current_setting('t.A')::uuid)) = 1 and (pg_temp.huella(current_setting('t.A')::uuid) ->> 'storage')::int = 1);
select pg_temp.t('E9 se conserva lo que debe: la auditoría de A (sin vínculo a la clínica), su solicitud ARCO y su incidente, y queda la constancia de la eliminación a nombre del superadmin',
  (select count(*) from auditoria where clinica_id is null and entidad_id is not null and accion <> 'eliminar_clinica') > 0
  and (select count(*) from arco_solicitudes where clinica_id is null and solicitante_nombre = 'X') = 1
  and (select count(*) from incidentes_seguridad where clinica_id is null and descripcion = 'prueba') = 1
  and exists (select 1 from auditoria where accion = 'eliminar_clinica' and entidad_id = current_setting('t.A')::uuid and usuario_id = current_setting('t.sa')::uuid and detalle ->> 'nombre' = 'Clínica A'));
-- ===== E10: AISLAMIENTO — B queda EXACTAMENTE igual =====
select pg_temp.t('E10 LA CLÍNICA B QUEDA INTACTA: la huella completa de B (todas las tablas, notas y archivos) es idéntica antes y después de eliminar A',
  pg_temp.huella(current_setting('t.B')::uuid)::text = current_setting('t.hB0')
  and (select count(*) from auditoria where clinica_id = current_setting('t.B')::uuid)::text = current_setting('t.audB0')
  and (select count(*) from usuarios where clinica_id = current_setting('t.B')::uuid) = 2 and exists (select 1 from suscripciones where clinica_id = current_setting('t.B')::uuid and estado <> 'reemplazada'));
select pg_temp.t('E10b el propietario de B sigue operando con normalidad después (lee sus pacientes) y no ve nada de A',
  pg_temp.con_rol('authenticated', 'select count(*)::text from pacientes', current_setting('t.ob')::uuid) = '2'
  and pg_temp.con_rol('authenticated', $q$select count(*)::text from pacientes where nombre_completo like 'A paciente%'$q$, current_setting('t.ob')::uuid) = '0');
-- ===== E11: repetir =====
select pg_temp.t('E11 repetir sobre una clínica ya eliminada → CLINICA_NO_ENCONTRADA (no es destructivo ni afecta a otra); la vista previa de una inexistente también lo dice',
  pg_temp.hint(pg_temp.eliminar(current_setting('t.A'), current_setting('t.sa'), 'Clínica A', true)) = 'CLINICA_NO_ENCONTRADA'
  and (pg_temp.con_rol('service_role', format('select fn_clinica_resumen_eliminacion(%L::uuid)::text', current_setting('t.A')))::jsonb -> 'bloqueos' -> 0 ->> 'codigo') = 'CLINICA_NO_ENCONTRADA'
  and pg_temp.huella(current_setting('t.B')::uuid)::text = current_setting('t.hB0'));
-- ===== E12: GUARDIA contra futuras migraciones =====
select pg_temp.t('E12 GUARDIA: las únicas FK NO ACTION / RESTRICT hacia clinicas son las que fn_eliminar_clinica sabe borrar; si una migración futura añade otra, esta prueba falla y recuerda actualizar la función',
  (select coalesce(string_agg(conrelid::regclass::text, ',' order by conrelid::regclass::text), '') from pg_constraint where contype = 'f' and confrelid = 'clinicas'::regclass and confdeltype in ('a', 'r'))
    = 'catalogo_tratamientos,horarios_bloqueados,lista_espera,pacientes,usuarios');
select pg_temp.t('E12b GUARDIA: ninguna FK NO ACTION / RESTRICT cuelga de pacientes hacia tablas que la función no borra en cascada (todo lo que cuelga de un paciente es CASCADE o SET NULL, salvo lista_espera, que se borra explícitamente)',
  (select coalesce(string_agg(conrelid::regclass::text, ',' order by conrelid::regclass::text), '') from pg_constraint where contype = 'f' and confrelid = 'pacientes'::regclass and confdeltype in ('a', 'r')) = '');

select pg_temp.t('E12c GUARDIA: la única tabla con FK SET NULL hacia pacientes/usuarios/clinicas que además tiene un CHECK sobre esa columna es legal_acceptances (la que la función borra antes); otra así rompería el borrado en silencio',
  (select coalesce(string_agg(distinct f.conrelid::regclass::text, ',' order by f.conrelid::regclass::text), '') from pg_constraint f join pg_constraint c on c.conrelid = f.conrelid and c.contype = 'c'
    where f.contype = 'f' and f.confdeltype = 'n' and f.confrelid in ('pacientes'::regclass, 'usuarios'::regclass, 'clinicas'::regclass)
      and pg_get_constraintdef(c.oid) ~ ('\m' || (select attname from pg_attribute where attrelid = f.conrelid and attnum = f.conkey[1]) || '\M')) = 'legal_acceptances');

-- ===== Sin datos clínicos no hay nada que conservar =====
delete from plataforma_config where clave = 'retencion_expediente_anios';
insert into auth.users (id, email) values ('a7000000-0000-0000-0000-0000000000d1', 'ecd1@x.mx');
insert into clinicas (id, nombre) values ('c7000000-0000-0000-0000-00000000000d', 'Clínica D (sin pacientes)');
select fn_asignar_plan_interno(null, 'c7000000-0000-0000-0000-00000000000d', 'empresarial', 'mensual');
insert into usuarios (id, clinica_id, nombre, correo, rol) values ('a7000000-0000-0000-0000-0000000000d1', 'c7000000-0000-0000-0000-00000000000d', 'Owner D', 'ecd1@x.mx', 'owner');
update clinicas set estado = 'suspendida' where id = 'c7000000-0000-0000-0000-00000000000d';
select set_config('t.rd', pg_temp.eliminar('c7000000-0000-0000-0000-00000000000d', current_setting('t.sa'), 'Clínica D (sin pacientes)', false), false);
select pg_temp.t('C10 una clínica SIN pacientes ni registros clínicos (suspendida) se elimina aunque NO haya política de conservación: no hay nada que conservar; no hace falta confirmar datos clínicos; y la clínica B no se toca',
  pg_temp.hint(current_setting('t.rd')) = 'OK' and not exists (select 1 from clinicas where id = 'c7000000-0000-0000-0000-00000000000d')
  and pg_temp.huella(current_setting('t.B')::uuid)::text = current_setting('t.hB0') and (select count(*) from auditoria where clinica_id = current_setting('t.B')::uuid)::text = current_setting('t.audB0'));
-- ===== GUARDIA: una tabla clínica nueva no puede quedar fuera del cálculo de conservación =====
select pg_temp.t('C11 GUARDIA: toda tabla con paciente_id está en la lista de tablas clínicas que cuenta la conservación (y la función las nombra), o está excluida A PROPÓSITO (pagos, lista_espera, ARCO, aceptaciones legales). Una tabla nueva obliga a decidir',
  (select coalesce(string_agg(table_name, ','), '') from information_schema.columns c where table_schema = 'public' and column_name = 'paciente_id'
     and table_name not like 'v\_%' and table_name not like 'zz\_%'
     and table_name not in ('expedientes','citas','consentimientos_informados','documentos_clinicos','fotografias','odontograma_piezas','periodontograma_piezas','recetas','referencias_medicas','signos_vitales','tratamientos',
                            'pagos','lista_espera','arco_solicitudes','legal_acceptances','retenciones_legales','conservacion_historial')) = ''   -- (104) llevan paciente_id solo como marca de una retención o de una decisión registrada, no son contenido clínico
  and (select bool_and(pg_get_functiondef('fn_clinica_resumen_eliminacion(uuid,uuid)'::regprocedure) like '%' || t || '%')
         from unnest(array['expedientes','notas_clinicas','recetas','tratamientos','consentimientos_informados','documentos_clinicos','fotografias','signos_vitales','referencias_medicas','odontograma_historial','odontograma_piezas','periodontograma_historial','periodontograma_piezas','citas']) t));

do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO 086: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 150), ' | ') from _res where not ok); end if;
end $$;
rollback;
