-- Migración 089: conservación POR CATEGORÍAS (clínica, fiscal, contractual), fechas por fuente, fronteras, y trazabilidad de la limpieza.
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
create function pg_temp.envejecer_vieja(p uuid, ts timestamptz) returns void language plpgsql as $$
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


create function pg_temp.politica(p_clave text, p_valor text) returns void language plpgsql as $$ begin
  if p_valor is null then delete from plataforma_config where clave = p_clave;
  else insert into plataforma_config (clave, valor) values (p_clave, p_valor) on conflict (clave) do update set valor = excluded.valor; end if; end $$;
-- Pone TODA la actividad clínica de una clínica en `ts` y reinicia las citas completadas (se salta los triggers que reescriben marcas de tiempo).
create function pg_temp.envejecer(p uuid, ts timestamptz) returns void language plpgsql as $$
declare pac uuid[];
begin
  select array_agg(id) into pac from pacientes where clinica_id = p;
  set local session_replication_role = replica;
  update pacientes set creado_en = ts, archivado_en = null where id = any (pac);
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
  update citas set estado = 'agendada', inicio = '2035-01-01 10:00+00', fin = '2035-01-01 10:30+00' where paciente_id = any (pac);
  set local session_replication_role = origin;
end $$;
create function pg_temp.envejecer_fiscal(p uuid, ts timestamptz) returns void language plpgsql as $$
begin set local session_replication_role = replica;
  update pagos set creado_en = ts, anulado_en = null where paciente_id in (select id from pacientes where clinica_id = p);
  set local session_replication_role = origin; end $$;
create function pg_temp.envejecer_contractual(p uuid, ts timestamptz) returns void language plpgsql as $$
begin set local session_replication_role = replica;
  update suscripciones set created_at = ts, updated_at = ts, fecha_fin = null where clinica_id = p;
  update legal_acceptances set aceptado_en = ts where clinica_id = p;
  set local session_replication_role = origin; end $$;
create function pg_temp.todo_viejo(p uuid) returns void language plpgsql as $$
begin perform pg_temp.envejecer(p, now() - interval '20 years'); perform pg_temp.envejecer_fiscal(p, now() - interval '20 years'); perform pg_temp.envejecer_contractual(p, now() - interval '20 years'); end $$;

-- ===== datos: X (se elimina), Y (espectadora), Z (sin pacientes), P (plataforma, aloja al superadmin) =====
insert into auth.users (id, email) select ('a5000000-0000-0000-0000-0000000000'||lpad(g::text,2,'0'))::uuid, 'cg'||g||'@x.mx' from generate_series(1,8) g;
insert into clinicas (id, nombre) values ('c5000000-0000-0000-0000-00000000000a','Clínica X'),('c5000000-0000-0000-0000-00000000000b','Clínica Y'),('c5000000-0000-0000-0000-00000000000c','Plataforma'),('c5000000-0000-0000-0000-00000000000d','Clínica Z (sin pacientes)');
select fn_asignar_plan_interno(null, c, 'empresarial', 'mensual') from unnest(array['c5000000-0000-0000-0000-00000000000a','c5000000-0000-0000-0000-00000000000b','c5000000-0000-0000-0000-00000000000c','c5000000-0000-0000-0000-00000000000d']::uuid[]) c;
insert into usuarios (id, clinica_id, nombre, correo, rol, es_super_admin) values
 ('a5000000-0000-0000-0000-000000000001','c5000000-0000-0000-0000-00000000000a','Owner X','cg1@x.mx','owner',false),
 ('a5000000-0000-0000-0000-000000000002','c5000000-0000-0000-0000-00000000000a','Dentista X','cg2@x.mx','dentista',false),
 ('a5000000-0000-0000-0000-000000000003','c5000000-0000-0000-0000-00000000000b','Owner Y','cg3@x.mx','owner',false),
 ('a5000000-0000-0000-0000-000000000004','c5000000-0000-0000-0000-00000000000c','Superadmin','cg4@x.mx','owner',true),
 ('a5000000-0000-0000-0000-000000000005','c5000000-0000-0000-0000-00000000000d','Owner Z','cg5@x.mx','owner',false);
insert into pacientes (id, clinica_id, nombre_completo, dentista_responsable_id) values
 ('b5000000-0000-0000-0000-0000000000a1','c5000000-0000-0000-0000-00000000000a','Paciente X','a5000000-0000-0000-0000-000000000002'),
 ('b5000000-0000-0000-0000-0000000000b1','c5000000-0000-0000-0000-00000000000b','Paciente Y',null);
do $$ declare c record; begin
  for c in select * from (values ('x','c5000000-0000-0000-0000-00000000000a'::uuid),('y','c5000000-0000-0000-0000-00000000000b'::uuid)) v(k, cl) loop
    insert into citas (paciente_id, inicio, fin, estado) select id, '2035-01-01 10:00+00', '2035-01-01 10:30+00', 'agendada' from pacientes where clinica_id = c.cl;
    insert into tratamientos (paciente_id, descripcion, costo) select id, 'Limpieza', 500 from pacientes where clinica_id = c.cl;
    insert into pagos (paciente_id, monto, metodo, tipo) select id, 100, 'efectivo', 'pago' from pacientes where clinica_id = c.cl;
    insert into notas_clinicas (expediente_id, contenido) select e.id, 'nota' from expedientes e join pacientes p on p.id = e.paciente_id where p.clinica_id = c.cl;
    insert into recetas (paciente_id) select id from pacientes where clinica_id = c.cl;
    insert into consentimientos_informados (paciente_id, procedimiento) select id, 'Extracción' from pacientes where clinica_id = c.cl;
    insert into fotografias (paciente_id, url_storage, etiqueta) select id, id::text || '/f.jpg', 'intraoral' from pacientes where clinica_id = c.cl;
    insert into documentos_clinicos (paciente_id, tipo, nombre, url_storage) select id, 'documento', 'doc', id::text || '/d.pdf' from pacientes where clinica_id = c.cl;
    insert into signos_vitales (paciente_id) select id from pacientes where clinica_id = c.cl;
    insert into referencias_medicas (paciente_id, direccion, medico_nombre) select id, 'enviada', 'Dr. X' from pacientes where clinica_id = c.cl;
    insert into odontograma_historial (pieza_id, estado_anterior, estado_nuevo) select r.id, 'sano', 'caries' from odontograma_piezas r join pacientes p on p.id = r.paciente_id where p.clinica_id = c.cl limit 1;
    insert into periodontograma_historial (pieza_id, sitio, campo, valor_anterior, valor_nuevo) select r.id, 'd', 'profundidad', '1', '2' from periodontograma_piezas r join pacientes p on p.id = r.paciente_id where p.clinica_id = c.cl limit 1;
    insert into legal_documents (clinica_id, tipo, version, titulo, contenido) values (c.cl, 'privacy_integral', 'v1-' || c.k, 'Aviso', 'texto');
    insert into legal_acceptances (clinica_id, paciente_id, documento_id, documento_version) select c.cl, (select id from pacientes where clinica_id = c.cl limit 1), d.id, d.version from legal_documents d where d.clinica_id = c.cl;
    insert into storage.objects (bucket_id, name, metadata) select 'fotos-clinicas', id::text || '/f.jpg', '{"size":1}' from pacientes where clinica_id = c.cl;
    insert into storage.objects (bucket_id, name, metadata) select 'documentos-clinicos', id::text || '/d.pdf', '{"size":1}' from pacientes where clinica_id = c.cl;
    insert into storage.objects (bucket_id, name, metadata) values ('logos-clinicas', c.cl::text || '/logo.png', '{"size":1}');
  end loop;
  insert into arco_solicitudes (clinica_id, tipo, solicitante_nombre, solicitante_correo, descripcion, estado) values ('c5000000-0000-0000-0000-00000000000a', 'acceso', 'X', 'x@x.mx', 'datos', 'cerrada');
  insert into incidentes_seguridad (clinica_id, tipo, severidad, descripcion, estado) values ('c5000000-0000-0000-0000-00000000000a', 'acceso', 'baja', 'prueba', 'cerrado');
end $$;
select set_config('t.X','c5000000-0000-0000-0000-00000000000a',false), set_config('t.Y','c5000000-0000-0000-0000-00000000000b',false), set_config('t.Z','c5000000-0000-0000-0000-00000000000d',false), set_config('t.A','c5000000-0000-0000-0000-00000000000a',false),
       set_config('t.sa','a5000000-0000-0000-0000-000000000004',false), set_config('t.ox','a5000000-0000-0000-0000-000000000001',false), set_config('t.oy','a5000000-0000-0000-0000-000000000003',false);
select set_config('t.hY0', pg_temp.huella(current_setting('t.Y')::uuid)::text, false), set_config('t.audY0', (select count(*) from auditoria where clinica_id = 'c5000000-0000-0000-0000-00000000000b')::text, false);
update clinicas set estado = 'suspendida' where id in ('c5000000-0000-0000-0000-00000000000a', 'c5000000-0000-0000-0000-00000000000d');
select pg_temp.todo_viejo(current_setting('t.X')::uuid);
create function pg_temp.codigos_x() returns text language sql as $$ select pg_temp.codigos(pg_temp.prev(current_setting('t.X'))) $$;
select pg_temp.t('R0 la siembra: X tiene filas en TODAS las fuentes (si no, no probaría nada) y todo está viejo (sin políticas, solo bloquea la falta de política)',
  (select count(*) from jsonb_each_text(pg_temp.huella(current_setting('t.X')::uuid)) where value::int > 0) >= 16 and pg_temp.codigos_x() = 'POLITICA_CONSERVACION_NO_DEFINIDA,POLITICA_FISCAL_NO_DEFINIDA');

-- ===== R7: política CLÍNICA inexistente / inválida / válida =====
do $$ declare v text; mal text := ''; r jsonb; begin
  perform pg_temp.politica('retencion_fiscal_anios', '5'); perform pg_temp.politica('retencion_expediente_anios', null);
  r := pg_temp.prev(current_setting('t.X'));
  if pg_temp.codigos(r) <> 'POLITICA_CONSERVACION_NO_DEFINIDA' then mal := mal || '[ausente]'; end if;
  foreach v in array array['', '   ', '0', '-3', '1.5', 'abc', '5 años', '9999', '+5', '5,0'] loop
    perform pg_temp.politica('retencion_expediente_anios', v);
    if pg_temp.codigos(pg_temp.prev(current_setting('t.X'))) <> 'POLITICA_CONSERVACION_NO_DEFINIDA' or (pg_temp.prev(current_setting('t.X')) ->> 'politica_anios') is not null then mal := mal || '[' || quote_literal(v) || ']'; end if;
  end loop;
  perform set_config('t.r7mal', mal, false);
end $$;
select pg_temp.t('R7 una política clínica AUSENTE, vacía, de espacios, 0, negativa, decimal, con texto, de más de 3 cifras, con signo o con coma NO es una política: bloquea con POLITICA_CONSERVACION_NO_DEFINIDA (la fila no puede ser NULL: la columna es NOT NULL)', current_setting('t.r7mal') = '');
do $$ declare v record; mal text := ''; r jsonb; esperado text; begin
  for v in select * from (values ('5', 5), ('05', 5), (' 7 ', 7), ('1', 1), ('100', 100), ('999', 999)) x(texto, anios) loop
    perform pg_temp.politica('retencion_expediente_anios', v.texto);
    r := pg_temp.prev(current_setting('t.X'));
    -- los datos de X tienen 20 años: una política de 100 o 999 años SÍ los retiene todavía
    esperado := case when v.anios > 20 then 'DENTRO_PLAZO_CONSERVACION' else '' end;
    if (r ->> 'politica_anios')::int <> v.anios or pg_temp.codigos(r) <> esperado then mal := mal || '[' || quote_literal(v.texto) || ']'; end if;
  end loop;
  perform set_config('t.r7bmal', mal, false);
end $$;
select pg_temp.t('R7b los valores válidos (entero positivo de 1 a 3 cifras, con espacios o ceros a la izquierda) se interpretan exactamente como esos años: 1-7 años ya vencieron para datos de 20 años; 100 y 999 todavía los retienen', current_setting('t.r7bmal') = '');
select pg_temp.politica('retencion_expediente_anios', '5');

-- ===== R1-R5: cada fuente aporta SU fecha (se comprueba la fecha exacta, no solo que bloquee) =====
do $$ declare t record; mal text := ''; v_x uuid := current_setting('t.X')::uuid; ts timestamptz; i int := 0; r jsonb; begin
  for t in select * from (values
    ('pacientes.creado_en (apertura)',        'update pacientes set creado_en = $2 where clinica_id = $1'),
    ('pacientes.archivado_en (cierre)',       'update pacientes set archivado_en = $2 where clinica_id = $1'),
    ('expedientes.actualizado_en',            'update expedientes set actualizado_en = $2 where paciente_id in (select id from pacientes where clinica_id = $1)'),
    ('notas_clinicas.creado_en',              'update notas_clinicas set creado_en = $2 where expediente_id in (select e.id from expedientes e join pacientes p on p.id = e.paciente_id where p.clinica_id = $1)'),
    ('recetas.creado_en',                     'update recetas set creado_en = $2 where paciente_id in (select id from pacientes where clinica_id = $1)'),
    ('tratamientos.creado_en',                'update tratamientos set creado_en = $2 where paciente_id in (select id from pacientes where clinica_id = $1)'),
    ('consentimientos_informados.creado_en',  'update consentimientos_informados set creado_en = $2 where paciente_id in (select id from pacientes where clinica_id = $1)'),
    ('documentos_clinicos.creado_en',         'update documentos_clinicos set creado_en = $2 where paciente_id in (select id from pacientes where clinica_id = $1)'),
    ('fotografias.fecha_captura',             'update fotografias set fecha_captura = $2 where paciente_id in (select id from pacientes where clinica_id = $1)'),
    ('signos_vitales.creado_en',              'update signos_vitales set creado_en = $2 where paciente_id in (select id from pacientes where clinica_id = $1)'),
    ('referencias_medicas.creado_en',         'update referencias_medicas set creado_en = $2 where paciente_id in (select id from pacientes where clinica_id = $1)'),
    ('odontograma_historial.creado_en',       'update odontograma_historial set creado_en = $2 where pieza_id in (select r.id from odontograma_piezas r join pacientes p on p.id = r.paciente_id where p.clinica_id = $1)'),
    ('odontograma_piezas.actualizado_en',     'update odontograma_piezas set actualizado_en = $2 where paciente_id in (select id from pacientes where clinica_id = $1)'),
    ('periodontograma_historial.creado_en',   'update periodontograma_historial set creado_en = $2 where pieza_id in (select r.id from periodontograma_piezas r join pacientes p on p.id = r.paciente_id where p.clinica_id = $1)'),
    ('periodontograma_piezas.actualizado_en', 'update periodontograma_piezas set actualizado_en = $2 where paciente_id in (select id from pacientes where clinica_id = $1)'),
    ('citas.inicio (solo COMPLETADAS)',       'update citas set estado = ''completada'', inicio = $2, fin = $2 + interval ''30 minutes'' where paciente_id in (select id from pacientes where clinica_id = $1)')) v(fuente, sentencia) loop
    i := i + 1; ts := date_trunc('day', now()) - ((200 + i) || ' days')::interval;
    perform pg_temp.envejecer(v_x, now() - interval '20 years');
    set local session_replication_role = replica; execute t.sentencia using v_x, ts; set local session_replication_role = origin;
    r := pg_temp.prev(v_x::text);
    if (r ->> 'ultimo_registro_clinico')::timestamptz <> ts or (r ->> 'conservar_hasta')::timestamptz <> ts + interval '5 years' or (r -> 'conservacion' -> 'clinico' ->> 'ultimo_registro')::timestamptz <> ts
       or pg_temp.codigos(r) <> 'DENTRO_PLAZO_CONSERVACION' then mal := mal || '[' || t.fuente || ']'; end if;
  end loop;
  perform pg_temp.envejecer(v_x, now() - interval '20 years');
  perform set_config('t.r1mal', mal, false);
end $$;
select pg_temp.t('R1 CADA una de las 16 fuentes (apertura y cierre del expediente, expediente, notas, recetas, tratamientos, consentimientos, documentos, fotografías, signos vitales, referencias, odontograma y periodontograma con sus historiales, citas completadas) aporta su fecha EXACTA: último registro = esa fecha, conservar hasta = esa fecha + 5 años', current_setting('t.r1mal') = '');
select pg_temp.t('R2 todo antiguo (20 años): sin bloqueo de conservación', pg_temp.codigos_x() = '');
-- R3: expediente SIN notas ni nada más: manda la fecha de apertura / actualización del expediente
select set_config('t.apertura', (now() - interval '30 days')::text, false);
select pg_temp.envejecer(current_setting('t.X')::uuid, now() - interval '20 years');
set local session_replication_role = replica; delete from notas_clinicas where expediente_id in (select e.id from expedientes e join pacientes p on p.id = e.paciente_id where p.clinica_id = 'c5000000-0000-0000-0000-00000000000a');
delete from recetas where paciente_id = 'b5000000-0000-0000-0000-0000000000a1'; delete from tratamientos where paciente_id = 'b5000000-0000-0000-0000-0000000000a1'; delete from consentimientos_informados where paciente_id = 'b5000000-0000-0000-0000-0000000000a1';
delete from documentos_clinicos where paciente_id = 'b5000000-0000-0000-0000-0000000000a1'; delete from fotografias where paciente_id = 'b5000000-0000-0000-0000-0000000000a1'; delete from signos_vitales where paciente_id = 'b5000000-0000-0000-0000-0000000000a1'; delete from referencias_medicas where paciente_id = 'b5000000-0000-0000-0000-0000000000a1';
update pacientes set creado_en = current_setting('t.apertura')::timestamptz where id = 'b5000000-0000-0000-0000-0000000000a1'; set local session_replication_role = origin;
select pg_temp.t('R3 paciente con expediente y SIN notas ni tratamientos ni nada más: la fecha sale de la apertura del expediente (no queda sin fecha ni se toma por antiguo)',
  (pg_temp.prev(current_setting('t.X')) ->> 'ultimo_registro_clinico')::timestamptz = current_setting('t.apertura')::timestamptz and pg_temp.codigos_x() = 'DENTRO_PLAZO_CONSERVACION');
-- R5: varias fuentes con fechas distintas → manda la más reciente
select pg_temp.envejecer(current_setting('t.X')::uuid, now() - interval '20 years');
set local session_replication_role = replica;  -- el trigger de expedientes reescribiría actualizado_en a now()
update pacientes set creado_en = now() - interval '9 years' where id = 'b5000000-0000-0000-0000-0000000000a1';
update expedientes set actualizado_en = now() - interval '7 years' where paciente_id = 'b5000000-0000-0000-0000-0000000000a1';
set local session_replication_role = origin;
insert into recetas (paciente_id, creado_en) values ('b5000000-0000-0000-0000-0000000000a1', now() - interval '3 years');
insert into signos_vitales (paciente_id, creado_en) values ('b5000000-0000-0000-0000-0000000000a1', now() - interval '4 years 6 months');
select pg_temp.t('R5 con varias fuentes y fechas distintas, el último registro es el MÁS RECIENTE de todas (hace 3 años) y se conserva hasta 5 años después de esa fecha',
  (pg_temp.prev(current_setting('t.X')) ->> 'ultimo_registro_clinico')::timestamptz = (select max(creado_en) from recetas where paciente_id = 'b5000000-0000-0000-0000-0000000000a1')
  and (pg_temp.prev(current_setting('t.X')) ->> 'conservar_hasta')::timestamptz = (select max(creado_en) from recetas where paciente_id = 'b5000000-0000-0000-0000-0000000000a1') + interval '5 years' and pg_temp.codigos_x() = 'DENTRO_PLAZO_CONSERVACION');
select pg_temp.envejecer(current_setting('t.X')::uuid, now() - interval '20 years');
-- ===== R8: FRONTERAS al microsegundo =====
do $$ declare v_x uuid := current_setting('t.X')::uuid; t0 timestamptz := now() - interval '5 years'; exacta text; antes text; despues text; omitida boolean := (now() - interval '5 years' + interval '5 years') <> now(); begin
  if not omitida then
    perform pg_temp.envejecer(v_x, t0);                                    exacta  := pg_temp.codigos_x();
    perform pg_temp.envejecer(v_x, t0 + interval '1 microsecond');         antes   := pg_temp.codigos_x();   -- un instante ANTES de cumplirse
    perform pg_temp.envejecer(v_x, t0 - interval '1 microsecond');         despues := pg_temp.codigos_x();   -- un instante DESPUÉS
  end if;
  perform set_config('t.r8', case when omitida then 'omitida' else coalesce(exacta,'?') || '|' || coalesce(antes,'?') || '|' || coalesce(despues,'?') end, false);
  perform pg_temp.envejecer(v_x, now() - interval '20 years');
end $$;
select pg_temp.t('R8 FRONTERA: el instante EXACTO en que se cumple el plazo ya permite eliminar; un microsegundo ANTES sigue bloqueada; un microsegundo DESPUÉS permite (omitida solo si hoy es 29 de febrero y la fecha no tiene inversa exacta)',
  current_setting('t.r8') = 'omitida' or current_setting('t.r8') = '|DENTRO_PLAZO_CONSERVACION|');

-- ===== R9: ARCO e incidentes, estado por estado =====
do $$ declare v text; mal text := ''; begin
  set local session_replication_role = replica;  -- 'aprobada' exige verificar identidad por trigger: aquí se prueba solo la regla de bloqueo
  foreach v in array array['recibida','en_revision','requiere_informacion','aprobada'] loop
    update arco_solicitudes set estado = v where clinica_id = current_setting('t.X')::uuid;
    if pg_temp.codigos_x() <> 'ARCO_PENDIENTE' then mal := mal || '[' || v || ']'; end if;
  end loop;
  foreach v in array array['atendida','cerrada','rechazada'] loop
    update arco_solicitudes set estado = v where clinica_id = current_setting('t.X')::uuid;
    if pg_temp.codigos_x() <> '' then mal := mal || '[' || v || ' bloquea]'; end if;
  end loop;
  foreach v in array array['detectado','en_investigacion','contenido'] loop
    update incidentes_seguridad set estado = v where clinica_id = current_setting('t.X')::uuid;
    if pg_temp.codigos_x() <> 'INCIDENTE_ABIERTO' then mal := mal || '[' || v || ']'; end if;
  end loop;
  foreach v in array array['resuelto','cerrado'] loop
    update incidentes_seguridad set estado = v where clinica_id = current_setting('t.X')::uuid;
    if pg_temp.codigos_x() <> '' then mal := mal || '[' || v || ' bloquea]'; end if;
  end loop;
  set local session_replication_role = origin;
  perform set_config('t.r9mal', mal, false);
end $$;
select pg_temp.t('R9 una solicitud ARCO bloquea en recibida/en_revision/requiere_informacion/aprobada y NO en atendida/cerrada/rechazada; un incidente bloquea en detectado/en_investigacion/contenido y NO en resuelto/cerrado', current_setting('t.r9mal') = '');

-- ===== R12: FISCAL (solo si hay pagos) =====
select pg_temp.politica('retencion_fiscal_anios', null);
select pg_temp.t('R12 la clínica tiene pagos y NO hay política fiscal: POLITICA_FISCAL_NO_DEFINIDA aunque lo clínico esté en regla (obligaciones separadas)', pg_temp.codigos_x() = 'POLITICA_FISCAL_NO_DEFINIDA');
select pg_temp.politica('retencion_fiscal_anios', 'abc');
select pg_temp.t('R12b una política fiscal inválida bloquea igual', pg_temp.codigos_x() = 'POLITICA_FISCAL_NO_DEFINIDA');
select pg_temp.politica('retencion_fiscal_anios', '5');
select pg_temp.t('R12c con política fiscal y pagos antiguos: sin bloqueo', pg_temp.codigos_x() = '');
do $$ declare t record; mal text := ''; ts timestamptz; r jsonb; i int := 0; begin
  for t in select * from (values ('pagos.creado_en', 'update pagos set creado_en = $2 where paciente_id in (select id from pacientes where clinica_id = $1)'),
                                 ('pagos.anulado_en', 'update pagos set anulado_en = $2 where paciente_id in (select id from pacientes where clinica_id = $1)')) v(fuente, sentencia) loop
    i := i + 1; ts := date_trunc('day', now()) - ((300 + i) || ' days')::interval;
    perform pg_temp.envejecer_fiscal(current_setting('t.X')::uuid, now() - interval '20 years');
    set local session_replication_role = replica; execute t.sentencia using current_setting('t.X')::uuid, ts; set local session_replication_role = origin;
    r := pg_temp.prev(current_setting('t.X'));
    if (r -> 'conservacion' -> 'fiscal' ->> 'ultimo_registro')::timestamptz <> ts or (r -> 'conservacion' -> 'fiscal' ->> 'conservar_hasta')::timestamptz <> ts + interval '5 years' or pg_temp.codigos(r) <> 'DENTRO_PLAZO_FISCAL' then mal := mal || '[' || t.fuente || ']'; end if;
  end loop;
  perform pg_temp.envejecer_fiscal(current_setting('t.X')::uuid, now() - interval '20 years');
  perform set_config('t.r12mal', mal, false);
end $$;
select pg_temp.t('R12d el último pago Y la última anulación aportan su fecha exacta a la categoría fiscal (bloquea dentro del plazo fiscal, sin tocar lo clínico)', current_setting('t.r12mal') = '');
-- ===== R13: CONTRACTUAL (avisa si no hay política; bloquea si la hay y está en plazo) =====
select pg_temp.t('R13 sin política contractual NO bloquea (toda clínica tiene suscripción: bloquearía hasta una clínica de pruebas) pero AVISA con CONTRACTUAL_NO_EVALUADO, y el aviso viaja en la vista previa',
  (pg_temp.prev(current_setting('t.X')) -> 'advertencias' -> 0 ->> 'codigo') = 'CONTRACTUAL_NO_EVALUADO' and (pg_temp.prev(current_setting('t.X')) ->> 'puede_eliminar') = 'true');
select pg_temp.politica('retencion_contractual_anios', '3');
select pg_temp.envejecer_contractual(current_setting('t.X')::uuid, now() - interval '20 years');
select pg_temp.t('R13b con política contractual y todo antiguo: sin bloqueo ni aviso', pg_temp.codigos_x() = '' and jsonb_array_length(pg_temp.prev(current_setting('t.X')) -> 'advertencias') = 0);
do $$ declare t record; mal text := ''; ts timestamptz; r jsonb; i int := 0; begin
  for t in select * from (values ('suscripciones.created_at', 'update suscripciones set created_at = $2 where clinica_id = $1'), ('suscripciones.updated_at', 'update suscripciones set updated_at = $2 where clinica_id = $1'),
                                 ('suscripciones.fecha_fin', 'update suscripciones set fecha_fin = $2::date where clinica_id = $1'), ('legal_acceptances.aceptado_en', 'update legal_acceptances set aceptado_en = $2 where clinica_id = $1')) v(fuente, sentencia) loop
    i := i + 1; ts := date_trunc('day', now()) - ((100 + i) || ' days')::interval;
    perform pg_temp.envejecer_contractual(current_setting('t.X')::uuid, now() - interval '20 years');
    set local session_replication_role = replica; execute t.sentencia using current_setting('t.X')::uuid, ts; set local session_replication_role = origin;
    r := pg_temp.prev(current_setting('t.X'));
    if (r -> 'conservacion' -> 'contractual' ->> 'ultimo_registro')::timestamptz <> ts or pg_temp.codigos(r) <> 'DENTRO_PLAZO_CONTRACTUAL' then mal := mal || '[' || t.fuente || ']'; end if;
  end loop;
  perform pg_temp.envejecer_contractual(current_setting('t.X')::uuid, now() - interval '20 years');
  perform set_config('t.r13mal', mal, false);
end $$;
select pg_temp.t('R13c cada fuente contractual (alta, actualización y fin de la suscripción; aceptación legal) aporta su fecha exacta y bloquea dentro del plazo contractual', current_setting('t.r13mal') = '');
-- ===== R14: las categorías son INDEPENDIENTES =====
select pg_temp.envejecer_fiscal(current_setting('t.X')::uuid, now() - interval '10 days');
select pg_temp.t('R14 solo lo fiscal está en plazo → solo DENTRO_PLAZO_FISCAL (lo clínico y lo contractual, vencidos, no se mezclan)', pg_temp.codigos_x() = 'DENTRO_PLAZO_FISCAL');
select pg_temp.envejecer(current_setting('t.X')::uuid, now() - interval '10 days'); select pg_temp.envejecer_fiscal(current_setting('t.X')::uuid, now() - interval '20 years');
select pg_temp.t('R14b solo lo clínico → solo DENTRO_PLAZO_CONSERVACION', pg_temp.codigos_x() = 'DENTRO_PLAZO_CONSERVACION');
select pg_temp.envejecer(current_setting('t.X')::uuid, now() - interval '20 years'); select pg_temp.envejecer_contractual(current_setting('t.X')::uuid, now() - interval '10 days');
select pg_temp.t('R14c solo lo contractual → solo DENTRO_PLAZO_CONTRACTUAL', pg_temp.codigos_x() = 'DENTRO_PLAZO_CONTRACTUAL');
select pg_temp.envejecer(current_setting('t.X')::uuid, now() - interval '10 days'); select pg_temp.envejecer_fiscal(current_setting('t.X')::uuid, now() - interval '10 days');
select pg_temp.t('R14d las tres a la vez → los tres códigos, cada uno con su mensaje', pg_temp.codigos_x() = 'DENTRO_PLAZO_CONSERVACION,DENTRO_PLAZO_CONTRACTUAL,DENTRO_PLAZO_FISCAL');
select pg_temp.todo_viejo(current_setting('t.X')::uuid);
-- ===== R6: clínica SIN pacientes ni datos =====
select pg_temp.politica('retencion_expediente_anios', null); select pg_temp.politica('retencion_fiscal_anios', null); select pg_temp.politica('retencion_contractual_anios', null);
select pg_temp.t('R6 una clínica sin pacientes ni datos clínicos ni pagos no necesita ninguna política: sin bloqueos (solo el aviso contractual); mientras X, con datos y sin políticas, sigue bloqueada',
  pg_temp.codigos(pg_temp.prev(current_setting('t.Z'))) = '' and (pg_temp.prev(current_setting('t.Z')) ->> 'puede_eliminar') = 'true' and (pg_temp.prev(current_setting('t.Z')) -> 'conservacion' -> 'clinico' ->> 'ultimo_registro') is null
  and pg_temp.codigos_x() = 'POLITICA_CONSERVACION_NO_DEFINIDA,POLITICA_FISCAL_NO_DEFINIDA');
insert into arco_solicitudes (clinica_id, tipo, solicitante_nombre, solicitante_correo, descripcion, estado) values (current_setting('t.Z')::uuid, 'acceso', 'Z', 'z@x.mx', 'datos', 'recibida');
select pg_temp.t('R6b una ARCO pendiente bloquea también a una clínica SIN datos clínicos', pg_temp.codigos(pg_temp.prev(current_setting('t.Z'))) = 'ARCO_PENDIENTE');
update arco_solicitudes set estado = 'cerrada' where clinica_id = current_setting('t.Z')::uuid;
-- ===== R15: el servidor decide, no el cliente =====
select pg_temp.t('R15 el servidor valida la política: fn_eliminar_clinica NO recibe ninguna fecha, plazo ni política del cliente (solo clínica, solicitante, nombre y confirmación)',
  pg_get_function_arguments('fn_eliminar_clinica(uuid,uuid,text,boolean)'::regprocedure) !~* 'fecha|hasta|ultimo|anios|plazo|politica' and pg_get_function_arguments('fn_clinica_resumen_eliminacion(uuid,uuid)'::regprocedure) !~* 'fecha|hasta|ultimo|anios|plazo|politica');
-- ===== Privilegios: nadie salvo service_role =====
select pg_temp.t('R16 NINGUNA función destructiva ni de limpieza es ejecutable por authenticated, anon ni public (un propietario tampoco); solo service_role',
  (select bool_and(not has_function_privilege('authenticated', p.oid, 'EXECUTE') and not has_function_privilege('anon', p.oid, 'EXECUTE') and not has_function_privilege('public', p.oid, 'EXECUTE'))
     from pg_proc p where p.proname in ('fn_eliminar_clinica','fn_clinica_resumen_eliminacion','fn_limpieza_pendiente_clinica','fn_registrar_limpieza_clinica','fn_registrar_intento_eliminacion','fn_politica_anios'))
  and (select bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE')) from pg_proc p where p.proname in ('fn_eliminar_clinica','fn_clinica_resumen_eliminacion','fn_limpieza_pendiente_clinica','fn_registrar_limpieza_clinica','fn_registrar_intento_eliminacion'))
  and pg_temp.con_rol('authenticated', format('select fn_registrar_intento_eliminacion(%L::uuid, %L::uuid, ''x'', ''y'')::text', current_setting('t.X'), current_setting('t.ox')), current_setting('t.ox')::uuid) like 'ERR|42501|%'
  and pg_temp.con_rol('authenticated', format('select fn_limpieza_pendiente_clinica(%L::uuid)::text', current_setting('t.X')), current_setting('t.ox')::uuid) like 'ERR|42501|%');

-- ===== Intentos rechazados =====
select set_config('t.r17a', pg_temp.eliminar(current_setting('t.X'), current_setting('t.sa'), 'Clínica X', true), false);
select set_config('t.r17b', pg_temp.con_rol('service_role', format('select fn_registrar_intento_eliminacion(%L::uuid, %L::uuid, ''ELIMINACION_BLOQUEADA'', ''sin política'')::text', current_setting('t.X'), current_setting('t.sa'))), false);
select set_config('t.r17c', pg_temp.con_rol('service_role', format('select fn_registrar_intento_eliminacion(%L::uuid, %L::uuid, ''x'', ''y'')::text', current_setting('t.X'), current_setting('t.ox'))), false);
select pg_temp.t('R17 un intento RECHAZADO (sin política) falla, no borra nada y se registra en la auditoría con su código y su autor; un no-superadmin no puede registrar intentos',
  pg_temp.hint(current_setting('t.r17a')) = 'ELIMINACION_BLOQUEADA' and exists (select 1 from clinicas where id = current_setting('t.X')::uuid)
  and current_setting('t.r17b') like '%"ok": true%'
  and exists (select 1 from auditoria where accion = 'intento_eliminar_clinica_rechazado' and entidad_id = current_setting('t.X')::uuid and usuario_id = current_setting('t.sa')::uuid and detalle ->> 'codigo' = 'ELIMINACION_BLOQUEADA')
  and pg_temp.hint(current_setting('t.r17c')) = 'NO_AUTORIZADO');

-- ===== Eliminación real de X cuando TODO se cumple =====
select pg_temp.politica('retencion_expediente_anios', '5'); select pg_temp.politica('retencion_fiscal_anios', '7'); select pg_temp.politica('retencion_contractual_anios', '3');
select pg_temp.todo_viejo(current_setting('t.X')::uuid);
select set_config('t.eliminar', pg_temp.eliminar(current_setting('t.X'), current_setting('t.sa'), 'Clínica X', true), false);
select pg_temp.t('R11 clínica suspendida con TODAS las políticas definidas y cumplidas, sin ARCO ni incidentes, con nombre y confirmación: SE ELIMINA, y Y queda intacta',
  (pg_temp.j(current_setting('t.eliminar')) ->> 'ok') = 'true' and not exists (select 1 from clinicas where id = current_setting('t.X')::uuid)
  and pg_temp.huella(current_setting('t.Y')::uuid)::text = current_setting('t.hY0') and (select count(*) from auditoria where clinica_id = current_setting('t.Y')::uuid)::text = current_setting('t.audY0'));
select pg_temp.t('R18 la auditoría de la eliminación conserva lo necesario para investigarla: quién, qué clínica, conteos, lo que se conserva, las políticas y fechas evaluadas EN EL SERVIDOR, la confirmación, y las LISTAS COMPLETAS de archivos y cuentas pendientes',
  exists (select 1 from auditoria a where a.accion = 'eliminar_clinica' and a.entidad_id = current_setting('t.X')::uuid and a.usuario_id = current_setting('t.sa')::uuid
     and a.detalle ->> 'nombre' = 'Clínica X' and (a.detalle -> 'conteos' ->> 'pacientes') = '1' and a.detalle -> 'se_conserva' is not null and (a.detalle -> 'conservacion' -> 'clinico' ->> 'politica_anios') = '5'
     and (a.detalle -> 'conservacion' -> 'fiscal' ->> 'politica_anios') = '7' and a.detalle ->> 'confirmo_datos_clinicos' = 'true' and a.detalle -> 'limpieza' ->> 'estado' = 'pendiente'
     and a.detalle -> 'limpieza' -> 'archivos' = pg_temp.j(current_setting('t.eliminar')) -> 'rutas_storage' and a.detalle -> 'limpieza' -> 'cuentas_auth' = pg_temp.j(current_setting('t.eliminar')) -> 'cuentas_auth'));
-- ===== Limpieza de Auth y Storage: pendiente → parcial → completa =====
select set_config('t.p0', pg_temp.con_rol('service_role', format('select fn_limpieza_pendiente_clinica(%L::uuid)::text', current_setting('t.X'))), false);
select pg_temp.t('R19 inmediatamente tras la eliminación TODO está pendiente (2 cuentas, fotos, documentos y logo) y NO se declara completa; la lista sobrevive aunque la Edge Function nunca vuelva a ejecutarse',
  (pg_temp.j(current_setting('t.p0')) ->> 'total_pendiente')::int = 2 + 1 + 1 + 1 and (pg_temp.j(current_setting('t.p0')) ->> 'limpieza_completa') = 'false' and jsonb_array_length(pg_temp.j(current_setting('t.p0')) -> 'pendiente' -> 'cuentas_auth') = 2);
select set_config('t.p1', pg_temp.con_rol('service_role', format('select fn_registrar_limpieza_clinica(%L::uuid, %L::uuid, %L::jsonb, %L::jsonb, %L::jsonb)::text', current_setting('t.X'), current_setting('t.sa'),
   jsonb_build_object('logos-clinicas', pg_temp.j(current_setting('t.eliminar')) -> 'rutas_storage' -> 'logos-clinicas')::text, jsonb_build_array(pg_temp.j(current_setting('t.eliminar')) -> 'cuentas_auth' -> 0)::text,
   '[{"tipo":"cuenta","motivo":"Database error deleting user"}]')), false);
select pg_temp.t('R20 limpieza PARCIAL (el logo y una cuenta): lo pendiente baja a 3, NO se declara completa, y el fallo queda registrado con su motivo',
  (pg_temp.j(current_setting('t.p1')) ->> 'total_pendiente')::int = 3 and (pg_temp.j(current_setting('t.p1')) ->> 'limpieza_completa') = 'false'
  and exists (select 1 from auditoria where accion = 'limpieza_eliminar_clinica' and entidad_id = current_setting('t.X')::uuid and detalle -> 'fallos' -> 0 ->> 'motivo' = 'Database error deleting user'));
select pg_temp.t('R21 solo se aceptan elementos de la lista original (ITEM_AJENO) y solo de un superadmin; nada ajeno puede marcarse como limpio',
  pg_temp.hint(pg_temp.con_rol('service_role', format('select fn_registrar_limpieza_clinica(%L::uuid, %L::uuid, ''{"fotos-clinicas":["otro/archivo.jpg"]}'')::text', current_setting('t.X'), current_setting('t.sa')))) = 'ITEM_AJENO'
  and pg_temp.hint(pg_temp.con_rol('service_role', format('select fn_registrar_limpieza_clinica(%L::uuid, %L::uuid, ''{}'', ''["a5000000-0000-0000-0000-000000000099"]'')::text', current_setting('t.X'), current_setting('t.sa')))) = 'ITEM_AJENO'
  and pg_temp.hint(pg_temp.con_rol('service_role', format('select fn_registrar_limpieza_clinica(%L::uuid, %L::uuid, ''{}'')::text', current_setting('t.X'), current_setting('t.oy')))) = 'NO_AUTORIZADO'
  and pg_temp.hint(pg_temp.con_rol('service_role', format('select fn_registrar_limpieza_clinica(%L::uuid, %L::uuid, ''{}'')::text', 'c5000000-0000-0000-0000-0000000000ff', current_setting('t.sa')))) = 'SIN_ELIMINACION_REGISTRADA'
  and (pg_temp.j(pg_temp.con_rol('service_role', format('select fn_limpieza_pendiente_clinica(%L::uuid)::text', current_setting('t.X')))) ->> 'total_pendiente')::int = 3);
select set_config('t.p2', pg_temp.con_rol('service_role', format('select fn_registrar_limpieza_clinica(%L::uuid, %L::uuid, %L::jsonb, %L::jsonb)::text', current_setting('t.X'), current_setting('t.sa'),
   (pg_temp.j(current_setting('t.eliminar')) -> 'rutas_storage')::text, (pg_temp.j(current_setting('t.eliminar')) -> 'cuentas_auth')::text)), false);
select pg_temp.t('R22 al registrar TODO lo que faltaba, la limpieza queda completa (total 0); registrar de nuevo lo mismo es idempotente',
  (pg_temp.j(current_setting('t.p2')) ->> 'total_pendiente')::int = 0 and (pg_temp.j(current_setting('t.p2')) ->> 'limpieza_completa') = 'true'
  and (pg_temp.j(pg_temp.con_rol('service_role', format('select fn_registrar_limpieza_clinica(%L::uuid, %L::uuid, %L::jsonb, %L::jsonb)::text', current_setting('t.X'), current_setting('t.sa'), (pg_temp.j(current_setting('t.eliminar')) -> 'rutas_storage')::text, (pg_temp.j(current_setting('t.eliminar')) -> 'cuentas_auth')::text))) ->> 'total_pendiente')::int = 0);
-- Z se elimina sin políticas (no tiene nada que conservar) y la auditoría de Y sigue igual
select pg_temp.t('R23a con la política contractual DEFINIDA, una clínica recién creada (suscripción de hoy) queda bloqueada por DENTRO_PLAZO_CONTRACTUAL: es la consecuencia buscada de definirla, y por eso sin política solo se avisa',
  pg_temp.codigos(pg_temp.prev(current_setting('t.Z'))) = 'DENTRO_PLAZO_CONTRACTUAL');
select pg_temp.politica('retencion_contractual_anios', null);
select set_config('t.r23', pg_temp.eliminar(current_setting('t.Z'), current_setting('t.sa'), 'Clínica Z (sin pacientes)', false), false);
select pg_temp.t('R23 Z (sin pacientes ni pagos), SIN política contractual: se elimina SIN políticas clínica/fiscal y sin confirmar datos clínicos; la auditoría de la eliminación de X sobrevive; Y intacta',
  pg_temp.hint(current_setting('t.r23')) = 'OK' and not exists (select 1 from clinicas where id = current_setting('t.Z')::uuid)
  and exists (select 1 from auditoria where accion = 'eliminar_clinica' and entidad_id = current_setting('t.X')::uuid) and pg_temp.huella(current_setting('t.Y')::uuid)::text = current_setting('t.hY0'));

do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO 089: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 150), ' | ') from _res where not ok); end if;
end $$;
rollback;
