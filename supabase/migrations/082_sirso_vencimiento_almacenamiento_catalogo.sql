-- ============================================================
-- SIRO — Vencimiento de suscripción, almacenamiento real y catálogo honesto
-- Migración 082
-- ------------------------------------------------------------
-- 1. VENCIMIENTO. Hasta hoy una suscripción solo podía estar `activa` o `suspendida`: aunque `fecha_fin` ya
--    pasara, nada lo notaba. Se agrega un estado EFECTIVO, calculado (no se guarda, no se borra nada):
--       activa → gracia → vencida     (y `suspendida`, que sigue siendo una decisión manual del superadmin)
--    `fecha_fin` es el último día cubierto. Pasado ese día empieza el período de gracia (días configurables en
--    plataforma_config.dias_gracia_suscripcion, 7 por defecto); terminado, queda `vencida`.
--    NO se bloquea el uso ni se borra información: solo se informa (mi_suscripcion → estado_efectivo). No hay
--    cobro automático: cuando exista un proveedor de pagos, bastará con mover `fecha_fin` al renovar.
-- 2. ALMACENAMIENTO. El límite `max_almacenamiento_mb` se guardaba pero ni se medía ni se aplicaba.
--    * fn_almacenamiento_bytes(): lo que ocupa una clínica (fotos y documentos por paciente, logo por clínica).
--    * Aparece en mi_suscripcion → uso.almacenamiento_mb y en los excesos.
--    * Una política RESTRICTIVA sobre storage.objects (INSERT) rechaza SUBIR más archivos cuando la clínica ya
--      alcanzó su tope. Storage inserta el objeto antes de conocer su tamaño, así que se bloquea al llegar al
--      límite (puede pasarse por un archivo, acotado por el tope por archivo de abajo). Hoy todos los planes
--      tienen almacenamiento ilimitado (NULL): no bloquea a nadie hasta que el superadmin ponga un tope.
--      Interruptor: plataforma_config.control_almacenamiento ('on' por defecto; 'off' lo desactiva al instante).
--      Falla ABIERTA: si no se puede medir, deja subir.
--    * Tope por archivo y tipos permitidos por bucket (los aplica Storage): fotos 10 MB, documentos 20 MB, logos
--      2 MB. El frontend valida lo mismo antes de subir (src/lib/limitesArchivos.js, con prueba de que coinciden).
-- 3. CATÁLOGO HONESTO. Se desactivan las funcionalidades que no tienen ninguna pantalla (`roles`,
--    `administracion_avanzada`), se llama a `caja` por lo que hace (corte de caja) y se corrige la descripción de
--    `reportes` (hablaba de SIS). No se tocan las suscripciones ya contratadas (conservan su snapshot).
-- Requiere 075 y 078 (plataforma_config). Seguro de re-ejecutar.
-- ============================================================
begin;

do $$
begin
  if to_regclass('public.plataforma_config') is null then
    raise exception 'Aplica primero la migración 078 (plataforma_config).';
  end if;
end $$;

insert into plataforma_config (clave, valor) values ('dias_gracia_suscripcion', '7'), ('control_almacenamiento', 'on')
  on conflict (clave) do nothing;

-- ---------- 1. Estado efectivo ----------
create or replace function fn_dias_gracia() returns integer
language plpgsql stable security definer set search_path = public as $$
declare v integer;
begin
  select nullif(valor, '')::integer into v from plataforma_config where clave = 'dias_gracia_suscripcion';
  return greatest(coalesce(v, 7), 0);
exception when others then return 7;
end $$;
grant execute on function fn_dias_gracia() to authenticated;

create or replace function fn_estado_efectivo(p_estado text, p_fecha_fin date, p_hoy date default current_date)
returns text language sql stable as $$
  select case
    when p_estado = 'suspendida' then 'suspendida'
    when p_fecha_fin is null or p_fecha_fin >= p_hoy then 'activa'
    when p_fecha_fin + fn_dias_gracia() >= p_hoy then 'gracia'
    else 'vencida'
  end
$$;
grant execute on function fn_estado_efectivo(text, date, date) to authenticated;

-- ---------- 2. Almacenamiento ----------
create or replace function fn_almacenamiento_bytes(p_clinica uuid) returns bigint
language plpgsql stable security definer set search_path = public as $$
declare v bigint;
begin
  select coalesce(sum(coalesce((o.metadata ->> 'size')::bigint, 0)), 0) into v
    from storage.objects o
   where (o.bucket_id in ('fotos-clinicas', 'documentos-clinicos')
          and exists (select 1 from pacientes p where p.clinica_id = p_clinica and p.id::text = (storage.foldername(o.name))[1]))
      or (o.bucket_id = 'logos-clinicas' and (storage.foldername(o.name))[1] = p_clinica::text);
  return v;
exception when others then return 0;   -- falla abierta: si no se puede medir, no se bloquea
end $$;
revoke all on function fn_almacenamiento_bytes(uuid) from public, anon, authenticated;

create or replace function fn_uso_clinica(p_clinica uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'pacientes',  (select count(*) from pacientes where clinica_id = p_clinica),
    'usuarios',   (select count(*) from usuarios where clinica_id = p_clinica and not es_super_admin),
    'sucursales', (select count(*) from sucursales where clinica_id = p_clinica and activa),
    'almacenamiento_mb', round(fn_almacenamiento_bytes(p_clinica) / 1048576.0, 2)
  )
$$;

create or replace function fn_excesos_clinica(p_clinica uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uso jsonb := fn_uso_clinica(p_clinica);
  v_out jsonb := '[]'::jsonb;
  v_t text; v_l integer; v_u integer; v_mb numeric;
begin
  foreach v_t in array array['pacientes', 'usuarios', 'sucursales'] loop
    v_l := fn_limite_efectivo(p_clinica, v_t);
    v_u := (v_uso ->> v_t)::int;
    if v_l is not null and v_u > v_l then
      v_out := v_out || jsonb_build_array(jsonb_build_object('tipo', v_t, 'usado', v_u, 'limite', v_l));
    end if;
  end loop;
  v_l := fn_limite_efectivo(p_clinica, 'almacenamiento_mb');
  v_mb := (v_uso ->> 'almacenamiento_mb')::numeric;
  if v_l is not null and v_mb > v_l then
    v_out := v_out || jsonb_build_array(jsonb_build_object('tipo', 'almacenamiento_mb', 'usado', v_mb, 'limite', v_l));
  end if;
  return v_out;
end $$;

create or replace function fn_almacenamiento_disponible(p_bucket text, p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_clinica uuid;
  v_limite integer;
  v_carpeta text := (storage.foldername(p_name))[1];
begin
  if coalesce((select valor from plataforma_config where clave = 'control_almacenamiento'), 'on') <> 'on' then return true; end if;
  if p_bucket in ('fotos-clinicas', 'documentos-clinicos') then
    select clinica_id into v_clinica from pacientes where id::text = v_carpeta;
  elsif p_bucket = 'logos-clinicas' then
    select id into v_clinica from clinicas where id::text = v_carpeta;
  end if;
  if v_clinica is null then return true; end if;                 -- otras políticas deciden si esa ruta es válida
  v_limite := fn_limite_efectivo(v_clinica, 'almacenamiento_mb');
  if v_limite is null then return true; end if;                  -- ilimitado
  return fn_almacenamiento_bytes(v_clinica) < v_limite::bigint * 1048576;
exception when others then return true;   -- falla abierta
end $$;
grant execute on function fn_almacenamiento_disponible(text, text) to authenticated;

drop policy if exists storage_limite_almacenamiento on storage.objects;
create policy storage_limite_almacenamiento on storage.objects as restrictive for insert to authenticated
  with check (fn_almacenamiento_disponible(bucket_id, name));

-- Tope por archivo y tipos permitidos (lo aplica Storage). Deben coincidir con src/lib/limitesArchivos.js.
update storage.buckets set file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] where id = 'fotos-clinicas';
update storage.buckets set file_size_limit = 20971520,
  allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] where id = 'documentos-clinicos';
update storage.buckets set file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'] where id = 'logos-clinicas';

-- ---------- mi_suscripcion: estado efectivo ----------
create or replace function mi_suscripcion() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_cl uuid := auth_clinica_id_raw();
  v_sus suscripciones%rowtype;
  v_plan_cod text;
  v_ver_precio boolean := (auth_rol() = 'owner' or fn_es_super_admin());
begin
  if v_cl is null then return null; end if;
  select * into v_sus from suscripciones where clinica_id = v_cl and estado <> 'reemplazada';
  v_plan_cod := coalesce(v_sus.plan, (select plan from clinicas where id = v_cl));

  return jsonb_build_object(
    'sin_suscripcion', v_sus.id is null,
    'plan', (select jsonb_build_object('codigo', p.plan, 'nombre', coalesce(p.nombre, p.plan), 'descripcion', p.descripcion)
             from planes_catalogo p where p.plan = v_plan_cod),
    'estado', coalesce(v_sus.estado, (select estado from clinicas where id = v_cl)),
    -- Estado calculado: activa | gracia | vencida | suspendida. Informa; no bloquea ni borra nada.
    'estado_efectivo', case when v_sus.id is null then 'activa' else fn_estado_efectivo(v_sus.estado, v_sus.fecha_fin) end,
    'dias_para_vencer', case when v_sus.fecha_fin is null then null else (v_sus.fecha_fin - current_date) end,
    'dias_gracia', fn_dias_gracia(),
    'modalidad', v_sus.modalidad,
    'precio_contratado', case when v_ver_precio then v_sus.precio_contratado else null end,
    'moneda', v_sus.moneda,
    'fecha_inicio', v_sus.fecha_inicio,
    'fecha_fin', v_sus.fecha_fin,
    'limites', jsonb_build_object(
      'pacientes', fn_limite_efectivo(v_cl, 'pacientes'), 'usuarios', fn_limite_efectivo(v_cl, 'usuarios'),
      'sucursales', fn_limite_efectivo(v_cl, 'sucursales'), 'sesiones', fn_limite_efectivo(v_cl, 'sesiones'),
      'almacenamiento_mb', fn_limite_efectivo(v_cl, 'almacenamiento_mb')),
    'uso', fn_uso_clinica(v_cl),
    'excesos', fn_excesos_clinica(v_cl),
    'funcionalidades', (select coalesce(jsonb_agg(jsonb_build_object('codigo', f.codigo, 'nombre', f.nombre, 'categoria', f.categoria,
         'aplicacion', f.aplicacion, 'habilitada', fn_funcionalidad_contratada(v_cl, f.codigo)) order by f.orden, f.codigo), '[]'::jsonb)
       from funcionalidades f where f.activo));
end $$;

-- ---------- 3. Catálogo honesto ----------
update funcionalidades set activo = false, updated_at = now() where codigo in ('roles', 'administracion_avanzada') and activo;
update funcionalidades set nombre = 'Corte de caja', descripcion = 'Consulta e impresión del corte de caja: cobros por periodo, método de pago y sucursal.', updated_at = now()
 where codigo = 'caja' and (nombre <> 'Corte de caja');
update funcionalidades set descripcion = 'Exportación de reportes y de la auditoría a CSV.', updated_at = now()
 where codigo = 'reportes' and descripcion like '%SIS%';

commit;
