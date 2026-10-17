-- Datos FICTICIOS para la prueba de admin-eliminar-clinica en Deno: una plataforma (superadmin), varias clínicas de prueba con distintos
-- estados y la clínica espectadora Y. Solo para una base DESECHABLE de pruebas. Crea además `zz_semilla_info` y `zz_huella` (ayudantes de prueba).
\set ON_ERROR_STOP on
alter role service_role bypassrls;   -- como en Supabase real (en esta base ya lo está; se repite por claridad)
create or replace function zz_huella(p uuid) returns jsonb language plpgsql as $$
declare r record; n bigint; salida jsonb := '{}';
begin
  for r in select table_name from information_schema.columns where table_schema = 'public' and column_name = 'clinica_id' and table_name not like 'v\_%' and table_name <> 'auditoria' order by 1 loop
    execute format('select count(*) from %I where clinica_id = $1', r.table_name) into n using p; salida := salida || jsonb_build_object('clinica:' || r.table_name, n); end loop;
  for r in select table_name from information_schema.columns where table_schema = 'public' and column_name = 'paciente_id' and table_name not like 'v\_%' order by 1 loop
    execute format('select count(*) from %I where paciente_id in (select id from pacientes where clinica_id = $1)', r.table_name) into n using p; salida := salida || jsonb_build_object('paciente:' || r.table_name, n); end loop;
  select count(*) into n from notas_clinicas nc join expedientes e on e.id = nc.expediente_id join pacientes pa on pa.id = e.paciente_id where pa.clinica_id = p; salida := salida || jsonb_build_object('notas', n);
  select count(*) into n from auth.users where id in (select id from usuarios where clinica_id = p); salida := salida || jsonb_build_object('auth_users', n);
  select count(*) into n from storage.objects o where (o.bucket_id = 'logos-clinicas' and (storage.foldername(o.name))[1] = p::text) or (o.bucket_id in ('fotos-clinicas','documentos-clinicos') and (storage.foldername(o.name))[1] in (select id::text from pacientes where clinica_id = p)); salida := salida || jsonb_build_object('storage', n);
  return salida;
end $$;
create table if not exists zz_semilla_info (k text primary key, clinica uuid, paciente uuid, owner uuid, dentista uuid);
create or replace function zz_u(k text, n int) returns uuid language sql immutable as $$ select md5('siro-deno-' || k || '-' || n)::uuid $$;

create or replace function zz_envejecer(p uuid) returns void language plpgsql as $$
declare pac uuid[]; ts timestamptz := now() - interval '20 years';
begin
  select array_agg(id) into pac from pacientes where clinica_id = p;
  set local session_replication_role = replica;
  update pacientes set creado_en = ts where id = any (pac); update expedientes set actualizado_en = ts where paciente_id = any (pac);
  update notas_clinicas set creado_en = ts where expediente_id in (select id from expedientes where paciente_id = any (pac));
  update recetas set creado_en = ts where paciente_id = any (pac); update tratamientos set creado_en = ts where paciente_id = any (pac);
  update consentimientos_informados set creado_en = ts where paciente_id = any (pac); update documentos_clinicos set creado_en = ts where paciente_id = any (pac);
  update fotografias set fecha_captura = ts where paciente_id = any (pac); update signos_vitales set creado_en = ts where paciente_id = any (pac); update referencias_medicas set creado_en = ts where paciente_id = any (pac);
  update odontograma_piezas set actualizado_en = ts where paciente_id = any (pac); update periodontograma_piezas set actualizado_en = ts where paciente_id = any (pac);
  update pagos set creado_en = ts, anulado_en = null where paciente_id = any (pac);
  set local session_replication_role = origin;
end $$;

create or replace function zz_clinica(k text, nombre text, estado text, con_datos boolean, reciente boolean, arco text default null) returns void language plpgsql as $$
declare c uuid := zz_u(k, 1); o uuid := zz_u(k, 2); d uuid := zz_u(k, 3); pa uuid := zz_u(k, 4);
begin
  insert into auth.users (id, email) values (o, k || '-owner@ficticio.mx'), (d, k || '-dentista@ficticio.mx');
  insert into clinicas (id, nombre) values (c, nombre);
  perform fn_asignar_plan_interno(null, c, 'empresarial', 'mensual');
  insert into usuarios (id, clinica_id, nombre, correo, rol) values (o, c, 'Owner ' || k, k || '-owner@ficticio.mx', 'owner'), (d, c, 'Dentista ' || k, k || '-dentista@ficticio.mx', 'dentista');
  insert into storage.objects (bucket_id, name, metadata) values ('logos-clinicas', c::text || '/logo.png', '{"size":1}');
  if con_datos then
    insert into pacientes (id, clinica_id, nombre_completo, dentista_responsable_id) values (pa, c, 'Paciente ficticio ' || k, d);
    insert into citas (paciente_id, inicio, fin, estado) values (pa, '2035-01-01 10:00+00', '2035-01-01 10:30+00', 'agendada');
    insert into tratamientos (paciente_id, descripcion, costo) values (pa, 'Limpieza', 500);
    insert into pagos (paciente_id, monto, metodo, tipo) values (pa, 100, 'efectivo', 'pago');
    insert into notas_clinicas (expediente_id, contenido) select id, 'nota ficticia' from expedientes where paciente_id = pa;
    insert into recetas (paciente_id) values (pa);
    insert into consentimientos_informados (paciente_id, procedimiento) values (pa, 'Extracción');
    insert into fotografias (paciente_id, url_storage, etiqueta) values (pa, pa::text || '/f.jpg', 'intraoral');
    insert into documentos_clinicos (paciente_id, tipo, nombre, url_storage) values (pa, 'documento', 'doc', pa::text || '/d.pdf');
    insert into signos_vitales (paciente_id) values (pa);
    insert into referencias_medicas (paciente_id, direccion, medico_nombre) values (pa, 'enviada', 'Dr. Ficticio');
    insert into storage.objects (bucket_id, name, metadata) values ('fotos-clinicas', pa::text || '/f.jpg', '{"size":1}'), ('fotos-clinicas', pa::text || '/g.jpg', '{"size":1}'), ('documentos-clinicos', pa::text || '/d.pdf', '{"size":1}');
    if not reciente then perform zz_envejecer(c); end if;
  end if;
  if arco is not null then
    insert into arco_solicitudes (clinica_id, tipo, solicitante_nombre, solicitante_correo, descripcion, estado) values (c, 'acceso', 'Ficticio', 'f@ficticio.mx', 'datos', arco);
  end if;
  if estado = 'suspendida' then update clinicas set estado = 'suspendida' where id = c; end if;
  insert into zz_semilla_info values (k, c, case when con_datos then pa end, o, d);
end $$;

begin;
insert into auth.users (id, email) values (zz_u('SA', 1), 'superadmin@ficticio.mx');
insert into clinicas (id, nombre) values (zz_u('P', 1), 'Plataforma');
select fn_asignar_plan_interno(null, zz_u('P', 1), 'empresarial', 'mensual');
insert into usuarios (id, clinica_id, nombre, correo, rol, es_super_admin) values (zz_u('SA', 1), zz_u('P', 1), 'Superadmin', 'superadmin@ficticio.mx', 'owner', true);
select zz_clinica('X1', 'Clínica X1 éxito', 'suspendida', true, false);
select zz_clinica('X2', 'Clínica X2 falla storage', 'suspendida', true, false);
select zz_clinica('X3', 'Clínica X3 falla auth', 'suspendida', true, false);
select zz_clinica('X4', 'Clínica X4 concurrencia', 'suspendida', true, false);
select zz_clinica('X5', 'Clínica X5 arco', 'suspendida', true, false, 'recibida');
select zz_clinica('X6', 'Clínica X6 activa', 'activa', true, false);
select zz_clinica('X7', 'Clínica X7 reciente', 'suspendida', true, true);
select zz_clinica('X8', 'Clínica X8 sin datos', 'suspendida', false, false);
select zz_clinica('X9', 'Clínica X9 entradas inválidas', 'suspendida', true, false);
select zz_clinica('Y', 'Clínica Y espectadora', 'activa', true, false);
insert into plataforma_config (clave, valor) values ('retencion_expediente_anios', '5'), ('retencion_fiscal_anios', '7') on conflict (clave) do update set valor = excluded.valor;
commit;
