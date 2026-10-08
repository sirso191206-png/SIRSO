-- Migración 082: vencimiento (estado efectivo), almacenamiento medido y limitado, catálogo honesto.
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
create function pg_temp.como(p_uid uuid, p_sql text) returns text language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin execute p_sql; get diagnostics n = row_count; reset role; return 'OK:'||n;
  exception when others then reset role; return 'ERR|'||sqlstate; end;
end $$;

-- ============================================================ A. Estado efectivo (función pura, con fecha explícita)
select pg_temp.t('V1 sin fecha de fin → activa; el último día cubierto sigue activa; al día siguiente empieza la gracia',
  fn_estado_efectivo('activa', null, '2026-10-10') = 'activa'
  and fn_estado_efectivo('activa', '2026-10-10', '2026-10-10') = 'activa'
  and fn_estado_efectivo('activa', '2026-10-10', '2026-10-11') = 'gracia');
select pg_temp.t('V2 la gracia dura 7 días por defecto: el día 7 aún es gracia; el 8 ya es vencida',
  fn_estado_efectivo('activa', '2026-10-10', '2026-10-17') = 'gracia'
  and fn_estado_efectivo('activa', '2026-10-10', '2026-10-18') = 'vencida'
  and fn_dias_gracia() = 7);
select pg_temp.t('V3 suspendida manda sobre las fechas (es una decisión manual del superadmin)',
  fn_estado_efectivo('suspendida', null, '2026-10-10') = 'suspendida' and fn_estado_efectivo('suspendida', '2020-01-01', '2026-10-10') = 'suspendida');
update plataforma_config set valor = '0' where clave = 'dias_gracia_suscripcion';
select pg_temp.t('V4 los días de gracia son configurables: con 0 no hay gracia',
  fn_estado_efectivo('activa', '2026-10-10', '2026-10-11') = 'vencida' and fn_dias_gracia() = 0);
update plataforma_config set valor = '30' where clave = 'dias_gracia_suscripcion';
select pg_temp.t('V5 ...con 30, el día 30 aún es gracia', fn_estado_efectivo('activa', '2026-10-10', '2026-11-09') = 'gracia' and fn_estado_efectivo('activa', '2026-10-10', '2026-11-10') = 'vencida');
update plataforma_config set valor = 'abc' where clave = 'dias_gracia_suscripcion';
select pg_temp.t('V6 un valor inválido en la configuración no rompe nada: vuelve a 7', fn_dias_gracia() = 7);
update plataforma_config set valor = '-5' where clave = 'dias_gracia_suscripcion';
select pg_temp.t('V7 un valor negativo cuenta como 0', fn_dias_gracia() = 0);
update plataforma_config set valor = '7' where clave = 'dias_gracia_suscripcion';

-- ============================================================ B. mi_suscripcion expone el estado efectivo
insert into auth.users (id, email) select ('a4000000-0000-0000-0000-0000000000'||lpad(g::text,2,'0'))::uuid, 'u'||g||'@x.mx' from generate_series(1,6) g;
insert into clinicas (id, nombre) values ('c4000000-0000-0000-0000-00000000000a','A'),('c4000000-0000-0000-0000-00000000000b','B'),('c4000000-0000-0000-0000-00000000000c','Heredada'),('c4000000-0000-0000-0000-00000000000d','Plataforma');
select fn_asignar_plan_interno(null, c, 'profesional', 'mensual') from unnest(array['c4000000-0000-0000-0000-00000000000a','c4000000-0000-0000-0000-00000000000b']::uuid[]) c;
select fn_asignar_plan_interno(null, 'c4000000-0000-0000-0000-00000000000d', 'empresarial', 'anual');
insert into usuarios (id, clinica_id, nombre, correo, rol, es_super_admin) values
 ('a4000000-0000-0000-0000-000000000001','c4000000-0000-0000-0000-00000000000a','Owner A','u1@x.mx','owner',false),
 ('a4000000-0000-0000-0000-000000000002','c4000000-0000-0000-0000-00000000000b','Owner B','u2@x.mx','owner',false),
 ('a4000000-0000-0000-0000-000000000003','c4000000-0000-0000-0000-00000000000c','Owner heredada','u3@x.mx','owner',false),
 ('a4000000-0000-0000-0000-000000000004','c4000000-0000-0000-0000-00000000000d','Super','u4@x.mx','owner',true);
select set_config('t.oa','a4000000-0000-0000-0000-000000000001',false), set_config('t.ob','a4000000-0000-0000-0000-000000000002',false),
       set_config('t.oh','a4000000-0000-0000-0000-000000000003',false), set_config('t.sa','a4000000-0000-0000-0000-000000000004',false);
create function pg_temp.est(p_uid uuid) returns text language sql as $$ select pg_temp.val(p_uid, 'select mi_suscripcion() ->> ''estado_efectivo''') $$;
create function pg_temp.dias(p_uid uuid) returns text language sql as $$ select pg_temp.val(p_uid, 'select mi_suscripcion() ->> ''dias_para_vencer''') $$;
select pg_temp.t('M1 sin fecha de fin: activa y sin cuenta regresiva', pg_temp.est(current_setting('t.oa')::uuid) = 'activa' and pg_temp.dias(current_setting('t.oa')::uuid) is null);
update suscripciones set fecha_fin = current_date + 5 where clinica_id = 'c4000000-0000-0000-0000-00000000000a' and estado <> 'reemplazada';
select pg_temp.t('M2 vence en 5 días: activa, con dias_para_vencer = 5 y la configuración de gracia', pg_temp.est(current_setting('t.oa')::uuid) = 'activa'
  and pg_temp.dias(current_setting('t.oa')::uuid) = '5' and pg_temp.val(current_setting('t.oa')::uuid, 'select mi_suscripcion() ->> ''dias_gracia''') = '7');
update suscripciones set fecha_fin = current_date - 3 where clinica_id = 'c4000000-0000-0000-0000-00000000000a' and estado <> 'reemplazada';
select pg_temp.t('M3 venció hace 3 días: gracia (dias_para_vencer = -3)', pg_temp.est(current_setting('t.oa')::uuid) = 'gracia' and pg_temp.dias(current_setting('t.oa')::uuid) = '-3');
update suscripciones set fecha_fin = current_date - 30 where clinica_id = 'c4000000-0000-0000-0000-00000000000a' and estado <> 'reemplazada';
select pg_temp.t('M4 venció hace 30 días: vencida', pg_temp.est(current_setting('t.oa')::uuid) = 'vencida');
select pg_temp.t('M5 VENCER NO BORRA NI BLOQUEA: el owner de una suscripción vencida sigue leyendo y creando pacientes',
  pg_temp.como(current_setting('t.oa')::uuid, format('insert into pacientes (clinica_id, nombre_completo) values (%L, ''Sigue funcionando'')', 'c4000000-0000-0000-0000-00000000000a')) = 'OK:1'
  and pg_temp.val(current_setting('t.oa')::uuid, 'select count(*)::text from pacientes') = '1');
update suscripciones set estado = 'suspendida' where clinica_id = 'c4000000-0000-0000-0000-00000000000b' and estado <> 'reemplazada';
select pg_temp.t('M6 una suscripción suspendida se reporta suspendida', pg_temp.est(current_setting('t.ob')::uuid) = 'suspendida');
set local session_replication_role = replica;
insert into usuarios (id, clinica_id, nombre, correo, rol) values ('a4000000-0000-0000-0000-000000000005','c4000000-0000-0000-0000-00000000000c','x','u5@x.mx','dentista') on conflict do nothing;
set local session_replication_role = origin;
select pg_temp.t('M7 clínica heredada sin suscripción: activa (no se le inventa un vencimiento)', pg_temp.est(current_setting('t.oh')::uuid) = 'activa' and pg_temp.dias(current_setting('t.oh')::uuid) is null);
select pg_temp.t('M8 cada clínica ve el estado de SU suscripción (A vencida, B suspendida)', pg_temp.est(current_setting('t.oa')::uuid) = 'vencida' and pg_temp.est(current_setting('t.ob')::uuid) = 'suspendida');

-- ============================================================ C. Almacenamiento: medición exacta
insert into pacientes (id, clinica_id, nombre_completo) values
 ('b4000000-0000-0000-0000-00000000000a','c4000000-0000-0000-0000-00000000000a','Paciente A'),
 ('b4000000-0000-0000-0000-00000000000b','c4000000-0000-0000-0000-00000000000b','Paciente B');
insert into storage.objects (bucket_id, name, metadata) values
 ('fotos-clinicas',      'b4000000-0000-0000-0000-00000000000a/foto1.jpg', jsonb_build_object('size', 3145728)),   -- 3 MB (A)
 ('documentos-clinicos', 'b4000000-0000-0000-0000-00000000000a/doc1.pdf',  jsonb_build_object('size', 2097152)),   -- 2 MB (A)
 ('logos-clinicas',      'c4000000-0000-0000-0000-00000000000a/logo.png',  jsonb_build_object('size', 1048576)),   -- 1 MB (A)
 ('fotos-clinicas',      'b4000000-0000-0000-0000-00000000000a/sin-tamano.jpg', null),                              -- sin tamaño: cuenta 0
 ('fotos-clinicas',      'b4000000-0000-0000-0000-00000000000b/fotoB.jpg', jsonb_build_object('size', 9437184)),    -- 9 MB (B)
 ('otro-bucket',         'b4000000-0000-0000-0000-00000000000a/ajeno.bin', jsonb_build_object('size', 5242880));    -- otro bucket: no cuenta
select pg_temp.t('A1 la clínica A ocupa EXACTAMENTE 6 MB (3 foto + 2 documento + 1 logo): no suma la de B, ni otros buckets, ni objetos sin tamaño',
  fn_almacenamiento_bytes('c4000000-0000-0000-0000-00000000000a') = 6291456
  and fn_almacenamiento_bytes('c4000000-0000-0000-0000-00000000000b') = 9437184
  and fn_almacenamiento_bytes('c4000000-0000-0000-0000-00000000000c') = 0);
select pg_temp.t('A2 mi_suscripcion expone el uso en MB (A: 6, B: 9) y cada clínica ve el suyo',
  pg_temp.val(current_setting('t.oa')::uuid, 'select mi_suscripcion() -> ''uso'' ->> ''almacenamiento_mb''')::numeric = 6
  and pg_temp.val(current_setting('t.ob')::uuid, 'select mi_suscripcion() -> ''uso'' ->> ''almacenamiento_mb''')::numeric = 9);
select pg_temp.t('A3 la medición no es ejecutable por la API (solo mi_suscripcion la usa)',
  not has_function_privilege('authenticated', 'fn_almacenamiento_bytes(uuid)', 'EXECUTE') and not has_function_privilege('anon', 'fn_almacenamiento_bytes(uuid)', 'EXECUTE'));

-- ============================================================ D. Almacenamiento: aplicación del tope
create function pg_temp.subir(p_uid uuid, p_bucket text, p_ruta text) returns text language sql as $$
  select pg_temp.como(p_uid, format('insert into storage.objects (bucket_id, name) values (%L, %L)', p_bucket, p_ruta))
$$;
select pg_temp.t('D1 sin tope (ilimitado, como hoy todos los planes) se puede subir: fotos, documentos y logo',
  pg_temp.subir(current_setting('t.oa')::uuid, 'fotos-clinicas', 'b4000000-0000-0000-0000-00000000000a/nueva1.jpg') = 'OK:1'
  and pg_temp.subir(current_setting('t.oa')::uuid, 'documentos-clinicos', 'b4000000-0000-0000-0000-00000000000a/nuevo1.pdf') = 'OK:1'
  and pg_temp.subir(current_setting('t.oa')::uuid, 'logos-clinicas', 'c4000000-0000-0000-0000-00000000000a/logo2.png') = 'OK:1');
update suscripcion_limites set max_almacenamiento_mb = 10 where suscripcion_id = (select id from suscripciones where clinica_id = 'c4000000-0000-0000-0000-00000000000a' and estado <> 'reemplazada');
select pg_temp.t('D2 con tope de 10 MB y 6 MB usados: todavía se puede subir (por debajo del tope)',
  pg_temp.subir(current_setting('t.oa')::uuid, 'fotos-clinicas', 'b4000000-0000-0000-0000-00000000000a/nueva2.jpg') = 'OK:1');
update suscripcion_limites set max_almacenamiento_mb = 6 where suscripcion_id = (select id from suscripciones where clinica_id = 'c4000000-0000-0000-0000-00000000000a' and estado <> 'reemplazada');
select pg_temp.t('D3 con tope de 6 MB y 6 MB usados (justo en el límite): se RECHAZA subir más — fotos, documentos y logo — con 42501',
  pg_temp.subir(current_setting('t.oa')::uuid, 'fotos-clinicas', 'b4000000-0000-0000-0000-00000000000a/nueva3.jpg') = 'ERR|42501'
  and pg_temp.subir(current_setting('t.oa')::uuid, 'documentos-clinicos', 'b4000000-0000-0000-0000-00000000000a/nuevo3.pdf') = 'ERR|42501'
  and pg_temp.subir(current_setting('t.oa')::uuid, 'logos-clinicas', 'c4000000-0000-0000-0000-00000000000a/logo3.png') = 'ERR|42501');
update suscripcion_limites set max_almacenamiento_mb = 5 where suscripcion_id = (select id from suscripciones where clinica_id = 'c4000000-0000-0000-0000-00000000000a' and estado <> 'reemplazada');
select pg_temp.t('D4 con tope de 5 MB y 6 usados (bajó de plan): rechaza subir, pero SIGUE leyendo todo lo que ya tiene (nada se borra) y el exceso queda a la vista',
  pg_temp.subir(current_setting('t.oa')::uuid, 'fotos-clinicas', 'b4000000-0000-0000-0000-00000000000a/nueva4.jpg') = 'ERR|42501'
  and pg_temp.val(current_setting('t.oa')::uuid, $q$select count(*)::text from storage.objects where bucket_id = 'fotos-clinicas' and name like 'b4000000-0000-0000-0000-00000000000a/%'$q$)::int >= 3
  and pg_temp.val(current_setting('t.oa')::uuid, 'select mi_suscripcion() -> ''excesos'' -> 0 ->> ''tipo''') = 'almacenamiento_mb'
  and pg_temp.val(current_setting('t.oa')::uuid, 'select mi_suscripcion() -> ''limites'' ->> ''almacenamiento_mb''') = '5');
select pg_temp.t('D5 el tope de una clínica NO afecta a otra: la clínica B (ilimitada) sigue subiendo',
  pg_temp.subir(current_setting('t.ob')::uuid, 'fotos-clinicas', 'b4000000-0000-0000-0000-00000000000b/otra.jpg') = 'OK:1');
update plataforma_config set valor = 'off' where clave = 'control_almacenamiento';
select pg_temp.t('D6 con el interruptor "off" la aplicación se apaga al instante (se puede subir aunque esté excedida)',
  pg_temp.subir(current_setting('t.oa')::uuid, 'fotos-clinicas', 'b4000000-0000-0000-0000-00000000000a/apagado.jpg') = 'OK:1');
update plataforma_config set valor = 'on' where clave = 'control_almacenamiento';
select pg_temp.t('D7 ...y al volver a "on" vuelve a rechazar',
  pg_temp.subir(current_setting('t.oa')::uuid, 'fotos-clinicas', 'b4000000-0000-0000-0000-00000000000a/encendido.jpg') = 'ERR|42501');
update suscripcion_limites set max_almacenamiento_mb = 100 where suscripcion_id = (select id from suscripciones where clinica_id = 'c4000000-0000-0000-0000-00000000000a' and estado <> 'reemplazada');
select pg_temp.t('D8 al ampliar el plan (100 MB) vuelve a poder subir', pg_temp.subir(current_setting('t.oa')::uuid, 'documentos-clinicos', 'b4000000-0000-0000-0000-00000000000a/ampliado.pdf') = 'OK:1');
select pg_temp.t('D9 el tope NO deja subir a la carpeta de un paciente de otra clínica (las políticas anteriores siguen mandando)',
  pg_temp.subir(current_setting('t.oa')::uuid, 'fotos-clinicas', 'b4000000-0000-0000-0000-00000000000b/colado.jpg') = 'ERR|42501');
select pg_temp.t('D10 el interruptor y la configuración no son accesibles por la API',
  pg_temp.val(current_setting('t.oa')::uuid, 'select count(*)::text from plataforma_config') like 'ERR|%'
  and pg_temp.como(current_setting('t.sa')::uuid, 'update plataforma_config set valor = ''off''') like 'ERR|%'
  and (select valor from plataforma_config where clave = 'control_almacenamiento') = 'on');

-- FALLA ABIERTA: si la medición/configuración no se puede leer, NO se bloquea (un problema de infraestructura
-- no puede dejar a todas las clínicas sin poder subir archivos). Se provoca una falla real: la tabla de configuración
-- "desaparece" un momento. La clínica A sigue por encima de su tope (6 MB usados, tope 5).
update suscripcion_limites set max_almacenamiento_mb = 5 where suscripcion_id = (select id from suscripciones where clinica_id = 'c4000000-0000-0000-0000-00000000000a' and estado <> 'reemplazada');
select pg_temp.t('D11a (control) con el tope excedido y todo funcionando, se rechaza',
  pg_temp.subir(current_setting('t.oa')::uuid, 'fotos-clinicas', 'b4000000-0000-0000-0000-00000000000a/control.jpg') = 'ERR|42501');
alter table plataforma_config rename to plataforma_config_oculta;
select set_config('t.d11', pg_temp.subir(current_setting('t.oa')::uuid, 'fotos-clinicas', 'b4000000-0000-0000-0000-00000000000a/falla-abierta.jpg'), false);
alter table plataforma_config_oculta rename to plataforma_config;
select pg_temp.t('D11 si la configuración no se puede leer, la subida se PERMITE (falla abierta) en vez de bloquear a todos',
  current_setting('t.d11') = 'OK:1');

-- ============================================================ E. Buckets: tope por archivo y tipos
select pg_temp.t('B1 fotos: 10 MB e imágenes (JPEG, PNG, WebP, HEIC/HEIF); documentos: 20 MB y PDF + imágenes; logos: 2 MB y JPEG/PNG/WebP (sin SVG)',
  (select file_size_limit = 10485760 and allowed_mime_types @> array['image/jpeg','image/png','image/webp','image/heic','image/heif'] and not allowed_mime_types @> array['application/pdf'] from storage.buckets where id = 'fotos-clinicas')
  and (select file_size_limit = 20971520 and allowed_mime_types @> array['application/pdf','image/jpeg'] from storage.buckets where id = 'documentos-clinicos')
  and (select file_size_limit = 2097152 and allowed_mime_types = array['image/jpeg','image/png','image/webp'] from storage.buckets where id = 'logos-clinicas'));
select pg_temp.t('B2 ningún bucket permite ejecutables, SVG ni HTML (que podrían ejecutar código al abrirse)',
  not exists (select 1 from storage.buckets b where b.allowed_mime_types && array['image/svg+xml','text/html','application/x-msdownload','application/javascript','text/javascript']));

-- ============================================================ F. Catálogo honesto
-- Un snapshot ANTIGUO (contratado antes de esta migración) tiene esas filas: se simula para comprobar que se conservan.
insert into suscripcion_funcionalidades (suscripcion_id, funcionalidad, habilitada)
  select id, f, true from suscripciones, unnest(array['roles','administracion_avanzada']) f
   where clinica_id = 'c4000000-0000-0000-0000-00000000000a' and estado <> 'reemplazada' on conflict do nothing;
select pg_temp.t('K1 "roles" y "administracion_avanzada" ya no se ofrecen (no tienen pantalla); las clínicas con snapshot conservan sus filas',
  not exists (select 1 from funcionalidades where codigo in ('roles','administracion_avanzada') and activo)
  and not exists (select 1 from jsonb_array_elements(pg_temp.val(current_setting('t.oa')::uuid, 'select mi_suscripcion() -> ''funcionalidades''')::jsonb) f where f ->> 'codigo' in ('roles','administracion_avanzada'))
  and exists (select 1 from suscripcion_funcionalidades where funcionalidad in ('roles','administracion_avanzada')));
select pg_temp.t('K2 "caja" se llama por lo que hace: Corte de caja; "reportes" ya no menciona SIS',
  (select nombre from funcionalidades where codigo = 'caja') = 'Corte de caja' and (select descripcion from funcionalidades where codigo = 'reportes') not like '%SIS%');
select pg_temp.t('K3 no se puede asignar a un plan una funcionalidad desactivada',
  pg_temp.como(current_setting('t.sa')::uuid, $q$select sa_set_plan_funcionalidades('profesional', '{"roles": true}')$q$) like 'ERR|%');
select pg_temp.t('K4 las funcionalidades que SÍ tienen pantalla siguen: auditoría, reportes, estadísticas, agenda, periodontograma…',
  (select count(*) from funcionalidades where activo and codigo in ('auditoria','reportes','estadisticas','agenda','periodontograma','pagos','caja','multisucursal')) = 8);

do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO 082: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 150), ' | ') from _res where not ok); end if;
end $$;
rollback;
