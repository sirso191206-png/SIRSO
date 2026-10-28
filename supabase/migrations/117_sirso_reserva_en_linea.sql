-- ============================================================
-- SIRO — 117: reserva de citas en línea (el paciente solicita su cita desde un enlace público).
-- ------------------------------------------------------------
--  * reserva_config (una fila por clínica): activar/desactivar, enlace público (slug), días y horario de atención,
--    intervalo entre horarios, anticipación mínima (horas) y máxima (días), zona horaria y un mensaje para el paciente.
--  * reserva_servicios: lo que el paciente puede reservar, con su duración.
--  * solicitudes_cita: lo que llega del enlace público, en estado `pendiente_confirmar`. NO es una cita ni un paciente:
--    la recepción o el owner la confirma (crea —o vincula— el paciente y la cita) o la rechaza desde la Agenda. Así un
--    formulario público nunca escribe en `pacientes` ni en `citas`.
--  * Funciones públicas (anon) SECURITY DEFINER — las únicas puertas del enlace público:
--      reserva_publica_info(slug)                     → datos públicos de la clínica, servicios y sucursales;
--      reserva_horarios_libres(slug, servicio, fecha) → SOLO horas libres (nunca citas, nombres ni ids de nadie);
--      reserva_solicitar_cita(...)                    → crea la solicitud; devuelve solo {ok, inicio, fin, servicio}.
--    Un horario está libre si hay un odontólogo de la clínica sin cita, sin bloqueo y sin otra solicitud pendiente en ese
--    rango, sin bloqueo de toda la clínica, y —si la sucursal tiene sillones— con un sillón libre. Se respetan
--    sucursales (odontólogo asignado a esa sucursal o sin asignación) y la anticipación configurada.
--  * Antispam: validación estricta en el servidor, campo trampa (`p_sitio_web`: si llega con algo se responde «ok» sin
--    guardar nada), y límites de frecuencia por IP (hash con sal, nunca la IP en claro), por correo y por clínica
--    (ajustables en plataforma_config: reserva_max_por_ip_hora 5, reserva_max_por_correo_dia 3,
--    reserva_max_por_clinica_hora 30). LIMITACIÓN: la IP sale de las cabeceras que pasa PostgREST; sin ellas (o si
--    alguien las falsea) quedan los límites por correo y por clínica. La defensa completa (CAPTCHA o límite en la red)
--    queda PENDIENTE DE ENTORNO, igual que en el formulario de contacto (102).
--  * Funciones del personal: reserva_confirmar_solicitud y reserva_rechazar_solicitud (owner y recepción).
--  * Plan: funcionalidad nueva `reserva_en_linea` (Profesional, Clínica, Empresarial). DECISIÓN A REVISAR: se agrega
--    también al snapshot de las suscripciones vigentes de esos planes (solo AÑADE una funcionalidad; no quita nada).
--  * Conservación: las solicitudes atendidas se borran a los 90 días y las pendientes vencidas a los 30 (al llegar una
--    nueva). Los datos del paciente confirmado viven ya en su expediente.
-- Requiere 004, 047, 075, 102, 115 y 116. Re-ejecutable. Rollback: supabase/rollback/siro_v3/rollback_117.sql.
-- ============================================================
begin;

do $$ begin
  if to_regprocedure('public.fn_registrar_error_cliente(text,text,text,text)') is null then raise exception '117 requiere la 116.'; end if;
  if to_regprocedure('public.fn_bloqueada_por_pago(uuid)') is null then raise exception '117 requiere la 115.'; end if;
  if to_regprocedure('public.fn_config_limite(text,integer)') is null then raise exception '117 requiere la 102.'; end if;
end $$;

-- ---------- 1. Funcionalidad del plan ----------
insert into funcionalidades (codigo, nombre, descripcion, categoria, aplicacion, nucleo, activo, orden)
values ('reserva_en_linea', 'Reserva en línea', 'Enlace público para que los pacientes soliciten su cita; la clínica la confirma desde la Agenda.',
        'agenda', 'base_de_datos', false, true, 240)
on conflict (codigo) do nothing;
insert into plan_funcionalidades (plan, funcionalidad, habilitada)
select p.plan, 'reserva_en_linea', true from planes_catalogo p where p.plan in ('profesional', 'clinica', 'empresarial')
on conflict (plan, funcionalidad) do nothing;
insert into suscripcion_funcionalidades (suscripcion_id, funcionalidad, habilitada)
select s.id, 'reserva_en_linea', true from suscripciones s
 where s.estado <> 'reemplazada' and s.plan in ('profesional', 'clinica', 'empresarial')
on conflict (suscripcion_id, funcionalidad) do nothing;

-- Sal para el hash de la IP (aleatoria por entorno; plataforma_config no la lee ningún cliente).
insert into plataforma_config (clave, valor)
values ('reserva_sal_ip', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (clave) do nothing;

-- ---------- 2. Tablas ----------
create table if not exists reserva_config (
  clinica_id uuid primary key references clinicas(id) on delete cascade,
  activa boolean not null default false,
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{1,58}[a-z0-9])$' and slug !~ '--'),
  zona_horaria text not null default 'America/Mexico_City',
  dias_semana smallint[] not null default '{1,2,3,4,5}'
    check (cardinality(dias_semana) between 1 and 7 and dias_semana <@ '{1,2,3,4,5,6,7}'::smallint[]),
  hora_apertura time not null default '09:00',
  hora_cierre time not null default '18:00',
  intervalo_min smallint not null default 30 check (intervalo_min in (10, 15, 20, 30, 45, 60)),
  anticipacion_min_horas integer not null default 2 check (anticipacion_min_horas between 0 and 720),
  anticipacion_max_dias integer not null default 30 check (anticipacion_max_dias between 1 and 180),
  mensaje text check (mensaje is null or char_length(mensaje) <= 500),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint reserva_config_horario check (hora_cierre > hora_apertura)
);

create table if not exists reserva_servicios (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 2 and 80),
  duracion_min smallint not null check (duracion_min between 10 and 240),
  activo boolean not null default true,
  orden integer not null default 0,
  creado_en timestamptz not null default now()
);
create index if not exists idx_reserva_servicios_clinica on reserva_servicios (clinica_id);

create table if not exists solicitudes_cita (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  servicio_id uuid references reserva_servicios(id) on delete set null,
  servicio_nombre text not null,
  sucursal_id uuid references sucursales(id) on delete set null,
  dentista_id uuid references usuarios(id) on delete set null,
  sillon_id uuid references sillones(id) on delete set null,
  inicio timestamptz not null,
  fin timestamptz not null,
  nombre text not null check (char_length(nombre) between 2 and 120),
  correo text not null check (char_length(correo) <= 254),
  telefono text not null check (char_length(telefono) <= 20),
  motivo text check (motivo is null or char_length(motivo) <= 500),
  estado text not null default 'pendiente_confirmar' check (estado in ('pendiente_confirmar', 'confirmada', 'rechazada')),
  cita_id uuid references citas(id) on delete set null,
  paciente_id uuid references pacientes(id) on delete set null,
  motivo_rechazo text check (motivo_rechazo is null or char_length(motivo_rechazo) <= 300),
  resuelta_por uuid references usuarios(id) on delete set null,
  resuelta_en timestamptz,
  ip_hash text,
  creado_en timestamptz not null default now(),
  constraint solicitudes_cita_horario check (fin > inicio)
);
create index if not exists idx_solicitudes_cita_clinica on solicitudes_cita (clinica_id, estado, inicio);
create index if not exists idx_solicitudes_cita_ip on solicitudes_cita (ip_hash, creado_en) where ip_hash is not null;
create index if not exists idx_solicitudes_cita_correo on solicitudes_cita (lower(correo), creado_en);

-- Valida la zona horaria (no cabe en un CHECK) y normaliza el slug; clinica_id se rellena solo, como en las demás tablas.
create or replace function fn_validar_reserva_config() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.clinica_id is null then new.clinica_id := auth_clinica_id(); end if;
  new.slug := lower(btrim(new.slug));
  if not exists (select 1 from pg_timezone_names where name = new.zona_horaria) then
    raise exception 'Zona horaria no válida: %', new.zona_horaria using errcode = '23514';
  end if;
  new.dias_semana := (select array_agg(distinct d order by d) from unnest(new.dias_semana) d);
  new.actualizado_en := now();
  return new;
end $$;
revoke all on function fn_validar_reserva_config() from public, anon, authenticated;
drop trigger if exists trg_validar_reserva_config on reserva_config;
create trigger trg_validar_reserva_config before insert or update on reserva_config for each row execute function fn_validar_reserva_config();
drop trigger if exists trg_set_clinica_reserva_servicios on reserva_servicios;
create trigger trg_set_clinica_reserva_servicios before insert on reserva_servicios for each row execute function fn_set_clinica_generico();

-- ---------- 3. RLS: owner configura; owner y recepción ven las solicitudes (el dentista, las que le tocan) ----------
alter table reserva_config enable row level security;
alter table reserva_servicios enable row level security;
alter table solicitudes_cita enable row level security;
revoke all on reserva_config, reserva_servicios, solicitudes_cita from anon, authenticated;
grant select, insert, update, delete on reserva_config, reserva_servicios to authenticated;
grant select on solicitudes_cita to authenticated;

drop policy if exists reserva_config_select on reserva_config;
create policy reserva_config_select on reserva_config for select to authenticated
  using (clinica_id = auth_clinica_id() and auth_rol() in ('owner', 'recepcion'));
drop policy if exists reserva_config_write on reserva_config;
create policy reserva_config_write on reserva_config for all to authenticated
  using (clinica_id = auth_clinica_id() and auth_rol() = 'owner')
  with check (clinica_id = auth_clinica_id() and auth_rol() = 'owner');

drop policy if exists reserva_servicios_select on reserva_servicios;
create policy reserva_servicios_select on reserva_servicios for select to authenticated
  using (clinica_id = auth_clinica_id() and auth_rol() in ('owner', 'recepcion'));
drop policy if exists reserva_servicios_write on reserva_servicios;
create policy reserva_servicios_write on reserva_servicios for all to authenticated
  using (clinica_id = auth_clinica_id() and auth_rol() = 'owner')
  with check (clinica_id = auth_clinica_id() and auth_rol() = 'owner');

drop policy if exists solicitudes_cita_select on solicitudes_cita;
create policy solicitudes_cita_select on solicitudes_cita for select to authenticated
  using (clinica_id = auth_clinica_id() and (auth_rol() in ('owner', 'recepcion') or dentista_id = auth.uid())
         and auth_sucursal_permitida(sucursal_id));

do $$
declare t text;
begin
  foreach t in array array['reserva_config', 'reserva_servicios', 'solicitudes_cita'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'sesion_activa_' || t) then
      execute format('create policy %I on public.%I as restrictive for all to authenticated using ((select fn_sesion_activa())) with check ((select fn_sesion_activa()))', 'sesion_activa_' || t, t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'plan_func_' || t) then
      execute format('create policy %I on public.%I as restrictive for all to authenticated using ((select fn_clinica_tiene_funcionalidad(auth_clinica_id(), %L))) with check ((select fn_clinica_tiene_funcionalidad(auth_clinica_id(), %L)))', 'plan_func_' || t, t, 'reserva_en_linea', 'reserva_en_linea');
    end if;
  end loop;
end $$;

-- ---------- 4. Funciones internas (no expuestas) ----------
-- Configuración de un enlace público SOLO si se puede reservar: activa, clínica activa, al corriente y con el plan.
create or replace function fn_reserva_config_publica(p_slug text) returns reserva_config
language plpgsql stable security definer set search_path = public as $$
declare v reserva_config;
begin
  select rc.* into v from reserva_config rc join clinicas c on c.id = rc.clinica_id
   where rc.slug = lower(btrim(coalesce(p_slug, ''))) and rc.activa and c.estado = 'activa';
  if v.clinica_id is null or fn_bloqueada_por_pago(v.clinica_id)
     or not fn_funcionalidad_contratada(v.clinica_id, 'reserva_en_linea') or not fn_funcionalidad_contratada(v.clinica_id, 'citas') then
    raise exception 'Esta clínica no tiene la reserva en línea disponible.' using errcode = 'P0001', hint = 'RESERVA_NO_DISPONIBLE';
  end if;
  return v;
end $$;

-- Sucursal efectiva: sin sucursales → null; con una sola → esa; con varias → la elegida (obligatoria).
create or replace function fn_reserva_sucursal(p_clinica uuid, p_sucursal uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v_n integer; v_unica uuid;
begin
  if p_sucursal is not null then
    if not exists (select 1 from sucursales where id = p_sucursal and clinica_id = p_clinica and activa) then
      raise exception 'La sucursal elegida no es válida.' using errcode = 'P0001', hint = 'RESERVA_DATOS_INVALIDOS';
    end if;
    return p_sucursal;
  end if;
  select count(*), min(id::text)::uuid into v_n, v_unica from sucursales where clinica_id = p_clinica and activa;
  if v_n = 0 then return null; end if;
  if v_n = 1 then return v_unica; end if;
  raise exception 'Elige una sucursal.' using errcode = 'P0001', hint = 'RESERVA_SUCURSAL_REQUERIDA';
end $$;

create or replace function fn_reserva_servicio(p_clinica uuid, p_servicio uuid) returns reserva_servicios
language plpgsql stable security definer set search_path = public as $$
declare v reserva_servicios;
begin
  select * into v from reserva_servicios where id = p_servicio and clinica_id = p_clinica and activo;
  if v.id is null then raise exception 'El servicio elegido no es válido.' using errcode = 'P0001', hint = 'RESERVA_DATOS_INVALIDOS'; end if;
  return v;
end $$;

-- Horarios de inicio posibles de un día (sin mirar ocupación): día de atención, dentro del horario, alineados al
-- intervalo y dentro de la anticipación mínima y máxima.
create or replace function fn_reserva_horarios_del_dia(p_cfg reserva_config, p_duracion integer, p_fecha date) returns setof timestamptz
language plpgsql stable security definer set search_path = public as $$
declare
  v_hoy date := (now() at time zone p_cfg.zona_horaria)::date;
  v_desde integer := extract(epoch from p_cfg.hora_apertura)::integer / 60;
  v_hasta integer := extract(epoch from p_cfg.hora_cierre)::integer / 60 - p_duracion;
  v_m integer; v_inicio timestamptz;
begin
  if p_fecha is null or p_fecha < v_hoy or p_fecha > v_hoy + p_cfg.anticipacion_max_dias
     or not (extract(isodow from p_fecha)::smallint = any (p_cfg.dias_semana)) then
    return;
  end if;
  v_m := v_desde;
  while v_m <= v_hasta loop
    v_inicio := (p_fecha::timestamp + make_interval(mins => v_m)) at time zone p_cfg.zona_horaria;
    if v_inicio >= now() + make_interval(hours => p_cfg.anticipacion_min_horas) then return next v_inicio; end if;
    v_m := v_m + p_cfg.intervalo_min;
  end loop;
end $$;

-- ¿Hay odontólogo (y sillón, si la sucursal tiene) libre en [inicio, fin)? Devuelve a quién se asignaría.
create or replace function fn_reserva_recurso_libre(p_clinica uuid, p_sucursal uuid, p_inicio timestamptz, p_fin timestamptz,
  out libre boolean, out dentista_id uuid, out sillon_id uuid)
language plpgsql stable security definer set search_path = public as $$
declare v_r tstzrange := tstzrange(p_inicio, p_fin);
begin
  libre := false;
  if exists (select 1 from horarios_bloqueados hb where hb.clinica_id = p_clinica and hb.dentista_id is null
               and tstzrange(hb.inicio, hb.fin) && v_r) then
    return;
  end if;
  select u.id into dentista_id from usuarios u
   where u.clinica_id = p_clinica and coalesce(u.activo, true)
     and (u.rol = 'dentista' or (u.rol = 'owner' and u.ejerce_como_dentista))
     and (p_sucursal is null
          or not exists (select 1 from sucursal_usuarios su where su.usuario_id = u.id and su.activo)
          or exists (select 1 from sucursal_usuarios su where su.usuario_id = u.id and su.sucursal_id = p_sucursal and su.activo))
     and not exists (select 1 from citas c where c.dentista_id = u.id
                       and c.estado not in ('cancelada', 'completada', 'no_asistio') and tstzrange(c.inicio, c.fin) && v_r)
     and not exists (select 1 from horarios_bloqueados hb where hb.clinica_id = p_clinica and hb.dentista_id = u.id
                       and tstzrange(hb.inicio, hb.fin) && v_r)
     and not exists (select 1 from solicitudes_cita s where s.dentista_id = u.id and s.estado = 'pendiente_confirmar'
                       and tstzrange(s.inicio, s.fin) && v_r)
   order by u.creado_en, u.id
   limit 1;
  if dentista_id is null then return; end if;
  if p_sucursal is not null and exists (select 1 from sillones s join consultorios co on co.id = s.consultorio_id
                                         where co.sucursal_id = p_sucursal and s.activo and co.activo) then
    select s.id into sillon_id from sillones s join consultorios co on co.id = s.consultorio_id
     where co.sucursal_id = p_sucursal and s.activo and co.activo
       and not exists (select 1 from citas c where c.sillon_id = s.id and c.estado <> 'cancelada' and tstzrange(c.inicio, c.fin) && v_r)
       and not exists (select 1 from solicitudes_cita sc where sc.sillon_id = s.id and sc.estado = 'pendiente_confirmar'
                         and tstzrange(sc.inicio, sc.fin) && v_r)
     order by co.nombre, s.nombre, s.id
     limit 1;
    if sillon_id is null then dentista_id := null; return; end if;
  end if;
  libre := true;
end $$;

-- Hash (con sal) de la IP de quien llama; null si PostgREST no la pasa.
create or replace function fn_reserva_ip_hash() returns text
language plpgsql stable security definer set search_path = public as $$
declare v_h json; v_ip text;
begin
  begin v_h := nullif(current_setting('request.headers', true), '')::json; exception when others then v_h := null; end;
  v_ip := btrim(coalesce(v_h ->> 'cf-connecting-ip', v_h ->> 'x-real-ip', split_part(coalesce(v_h ->> 'x-forwarded-for', ''), ',', 1), ''));
  if v_ip = '' then return null; end if;
  return encode(sha256(convert_to(coalesce((select valor from plataforma_config where clave = 'reserva_sal_ip'), '') || '|' || v_ip, 'UTF8')), 'hex');
end $$;

revoke all on function fn_reserva_config_publica(text) from public, anon, authenticated;
revoke all on function fn_reserva_sucursal(uuid, uuid) from public, anon, authenticated;
revoke all on function fn_reserva_servicio(uuid, uuid) from public, anon, authenticated;
revoke all on function fn_reserva_horarios_del_dia(reserva_config, integer, date) from public, anon, authenticated;
revoke all on function fn_reserva_recurso_libre(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function fn_reserva_ip_hash() from public, anon, authenticated;

-- ---------- 5. Funciones públicas (anon) ----------
create or replace function reserva_publica_info(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_cfg reserva_config := fn_reserva_config_publica(p_slug); v_hoy date;
begin
  v_hoy := (now() at time zone v_cfg.zona_horaria)::date;
  return (select jsonb_build_object(
    'clinica', jsonb_build_object('nombre', c.nombre, 'logo_url', c.logo_url, 'telefono', c.telefono, 'direccion', c.direccion),
    'mensaje', v_cfg.mensaje,
    'zona_horaria', v_cfg.zona_horaria,
    'dias_semana', to_jsonb(v_cfg.dias_semana),
    'hora_apertura', to_char(v_cfg.hora_apertura, 'HH24:MI'),
    'hora_cierre', to_char(v_cfg.hora_cierre, 'HH24:MI'),
    'fecha_minima', v_hoy + (v_cfg.anticipacion_min_horas / 24),
    'fecha_maxima', v_hoy + v_cfg.anticipacion_max_dias,
    'servicios', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre, 'duracion_min', s.duracion_min) order by s.orden, s.nombre)
                            from reserva_servicios s where s.clinica_id = c.id and s.activo), '[]'::jsonb),
    'sucursales', coalesce((select jsonb_agg(jsonb_build_object('id', su.id, 'nombre', su.nombre, 'direccion', su.direccion) order by su.nombre)
                             from sucursales su where su.clinica_id = c.id and su.activa), '[]'::jsonb))
    from clinicas c where c.id = v_cfg.clinica_id);
end $$;

create or replace function reserva_horarios_libres(p_slug text, p_servicio uuid, p_fecha date, p_sucursal uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_cfg reserva_config := fn_reserva_config_publica(p_slug);
  v_srv reserva_servicios := fn_reserva_servicio(v_cfg.clinica_id, p_servicio);
  v_suc uuid := fn_reserva_sucursal(v_cfg.clinica_id, p_sucursal);
  v_res jsonb := '[]'::jsonb; v_ini timestamptz; v_fin timestamptz;
begin
  for v_ini in select * from fn_reserva_horarios_del_dia(v_cfg, v_srv.duracion_min, p_fecha) loop
    v_fin := v_ini + make_interval(mins => v_srv.duracion_min);
    if (fn_reserva_recurso_libre(v_cfg.clinica_id, v_suc, v_ini, v_fin)).libre then
      v_res := v_res || jsonb_build_object('inicio', v_ini, 'hora', to_char(v_ini at time zone v_cfg.zona_horaria, 'HH24:MI'));
    end if;
  end loop;
  return v_res;
end $$;

create or replace function reserva_solicitar_cita(p_slug text, p_servicio uuid, p_inicio timestamptz, p_nombre text, p_correo text,
  p_telefono text, p_motivo text default null, p_sucursal uuid default null, p_sitio_web text default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_cfg reserva_config; v_srv reserva_servicios; v_suc uuid; v_fin timestamptz; v_rec record; v_ip text;
  v_nombre text := regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_correo text := lower(btrim(coalesce(p_correo, '')));
  v_tel text := btrim(coalesce(p_telefono, ''));
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  -- Campo trampa: una persona no lo ve ni lo llena. A un robot se le dice que salió bien y no se guarda nada.
  if btrim(coalesce(p_sitio_web, '')) <> '' then return jsonb_build_object('ok', true); end if;

  v_cfg := fn_reserva_config_publica(p_slug);
  if char_length(v_nombre) not between 2 and 120 or v_nombre ~ '[[:cntrl:]<>]' or v_nombre !~ '[[:alpha:]]' then
    raise exception 'Escribe tu nombre completo (de 2 a 120 caracteres).' using errcode = 'P0001', hint = 'RESERVA_DATOS_INVALIDOS';
  end if;
  if char_length(v_correo) > 254 or v_correo !~ '^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$' then
    raise exception 'Escribe un correo electrónico válido.' using errcode = 'P0001', hint = 'RESERVA_DATOS_INVALIDOS';
  end if;
  if v_tel !~ '^\+?[0-9 ()-]{10,20}$' or char_length(regexp_replace(v_tel, '[^0-9]', '', 'g')) not between 10 and 15 then
    raise exception 'Escribe un teléfono válido (10 dígitos o más).' using errcode = 'P0001', hint = 'RESERVA_DATOS_INVALIDOS';
  end if;
  if v_motivo is not null and (char_length(v_motivo) > 500 or v_motivo ~ '[\x01-\x08\x0B\x0C\x0E-\x1F<>]') then
    raise exception 'El motivo no puede tener más de 500 caracteres ni símbolos < >.' using errcode = 'P0001', hint = 'RESERVA_DATOS_INVALIDOS';
  end if;
  v_srv := fn_reserva_servicio(v_cfg.clinica_id, p_servicio);
  v_suc := fn_reserva_sucursal(v_cfg.clinica_id, p_sucursal);
  if p_inicio is null or not exists (select 1 from fn_reserva_horarios_del_dia(v_cfg, v_srv.duracion_min, (p_inicio at time zone v_cfg.zona_horaria)::date) h
                                       where h = p_inicio) then
    raise exception 'Ese horario no se puede reservar. Elige otro.' using errcode = 'P0001', hint = 'RESERVA_HORARIO_INVALIDO';
  end if;
  v_fin := p_inicio + make_interval(mins => v_srv.duracion_min);

  -- Una solicitud a la vez por clínica: el límite y la ocupación se comprueban con la clínica bloqueada.
  perform pg_advisory_xact_lock(hashtextextended('reserva_en_linea:' || v_cfg.clinica_id::text, 0));
  v_ip := fn_reserva_ip_hash();
  if (v_ip is not null and (select count(*) from solicitudes_cita where ip_hash = v_ip and creado_en > now() - interval '1 hour')
                            >= fn_config_limite('reserva_max_por_ip_hora', 5))
     or (select count(*) from solicitudes_cita where lower(correo) = v_correo and creado_en > now() - interval '1 day')
        >= fn_config_limite('reserva_max_por_correo_dia', 3)
     or (select count(*) from solicitudes_cita where clinica_id = v_cfg.clinica_id and creado_en > now() - interval '1 hour')
        >= fn_config_limite('reserva_max_por_clinica_hora', 30) then
    raise exception 'Se han recibido demasiadas solicitudes. Inténtalo más tarde o llama a la clínica.' using errcode = 'P0001', hint = 'RESERVA_DEMASIADAS';
  end if;
  select * into v_rec from fn_reserva_recurso_libre(v_cfg.clinica_id, v_suc, p_inicio, v_fin);
  if not v_rec.libre then
    raise exception 'Ese horario se acaba de ocupar. Elige otro.' using errcode = 'P0001', hint = 'RESERVA_HORARIO_OCUPADO';
  end if;

  insert into solicitudes_cita (clinica_id, servicio_id, servicio_nombre, sucursal_id, dentista_id, sillon_id, inicio, fin,
                                nombre, correo, telefono, motivo, ip_hash)
  values (v_cfg.clinica_id, v_srv.id, v_srv.nombre, v_suc, v_rec.dentista_id, v_rec.sillon_id, p_inicio, v_fin,
          v_nombre, v_correo, v_tel, v_motivo, v_ip);

  delete from solicitudes_cita where (estado <> 'pendiente_confirmar' and coalesce(resuelta_en, creado_en) < now() - interval '90 days')
                                  or (estado = 'pendiente_confirmar' and fin < now() - interval '30 days');
  return jsonb_build_object('ok', true, 'inicio', p_inicio, 'fin', v_fin, 'servicio', v_srv.nombre);
end $$;

revoke all on function reserva_publica_info(text) from public;
revoke all on function reserva_horarios_libres(text, uuid, date, uuid) from public;
revoke all on function reserva_solicitar_cita(text, uuid, timestamptz, text, text, text, text, uuid, text) from public;
grant execute on function reserva_publica_info(text) to anon, authenticated;
grant execute on function reserva_horarios_libres(text, uuid, date, uuid) to anon, authenticated;
grant execute on function reserva_solicitar_cita(text, uuid, timestamptz, text, text, text, text, uuid, text) to anon, authenticated;

-- ---------- 6. Funciones del personal (owner y recepción) ----------
create or replace function fn_reserva_solicitud_para_resolver(p_solicitud uuid) returns solicitudes_cita
language plpgsql volatile security definer set search_path = public as $$
declare v_clinica uuid := auth_clinica_id(); v solicitudes_cita;
begin
  if v_clinica is null or not fn_sesion_activa() or coalesce(auth_rol(), '') not in ('owner', 'recepcion')
     or not fn_clinica_tiene_funcionalidad(v_clinica, 'reserva_en_linea') then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  select * into v from solicitudes_cita where id = p_solicitud and clinica_id = v_clinica for update;
  if v.id is null or not auth_sucursal_permitida(v.sucursal_id) then
    raise exception 'La solicitud no existe.' using errcode = 'P0001', hint = 'RESERVA_SOLICITUD_NO_ENCONTRADA';
  end if;
  if v.estado <> 'pendiente_confirmar' then
    raise exception 'Esta solicitud ya fue atendida.' using errcode = 'P0001', hint = 'RESERVA_SOLICITUD_RESUELTA';
  end if;
  return v;
end $$;
revoke all on function fn_reserva_solicitud_para_resolver(uuid) from public, anon, authenticated;

-- Confirma: vincula al paciente indicado (o crea uno nuevo con los datos de la solicitud) y crea la cita `confirmada`.
create or replace function reserva_confirmar_solicitud(p_solicitud uuid, p_paciente uuid default null) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare v solicitudes_cita := fn_reserva_solicitud_para_resolver(p_solicitud); v_pac uuid; v_cita uuid;
begin
  if not fn_clinica_tiene_funcionalidad(v.clinica_id, 'citas') then raise exception 'No autorizado.' using errcode = '42501'; end if;
  if v.inicio < now() then
    raise exception 'El horario solicitado ya pasó: recházala o agenda otra cita con el paciente.' using errcode = 'P0001', hint = 'RESERVA_SOLICITUD_VENCIDA';
  end if;
  if p_paciente is not null then
    select id into v_pac from pacientes where id = p_paciente and clinica_id = v.clinica_id;
    if v_pac is null then raise exception 'El paciente elegido no existe.' using errcode = 'P0001', hint = 'RESERVA_DATOS_INVALIDOS'; end if;
  else
    insert into pacientes (clinica_id, nombre_completo, telefono, correo, dentista_responsable_id)
    values (v.clinica_id, v.nombre, v.telefono, v.correo, v.dentista_id)
    returning id into v_pac;
  end if;
  begin
    insert into citas (paciente_id, dentista_id, inicio, fin, estado, motivo_consulta, tipo_consulta, sucursal_id, sillon_id, consultorio_id)
    values (v_pac, v.dentista_id, v.inicio, v.fin, 'confirmada', left(v.servicio_nombre || coalesce(' — ' || v.motivo, ''), 500),
            case when p_paciente is null then 'primera_vez' end, v.sucursal_id, v.sillon_id,
            (select s.consultorio_id from sillones s where s.id = v.sillon_id))
    returning id into v_cita;
  exception when exclusion_violation then
    raise exception 'Ese horario ya lo ocupa otra cita. Rechaza la solicitud o acuerda otro horario con el paciente.' using errcode = 'P0001', hint = 'RESERVA_HORARIO_OCUPADO';
  end;
  update solicitudes_cita set estado = 'confirmada', cita_id = v_cita, paciente_id = v_pac, resuelta_por = auth.uid(), resuelta_en = now()
   where id = v.id;
  return v_cita;
end $$;

create or replace function reserva_rechazar_solicitud(p_solicitud uuid, p_motivo text default null) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v solicitudes_cita := fn_reserva_solicitud_para_resolver(p_solicitud);
begin
  update solicitudes_cita set estado = 'rechazada', motivo_rechazo = left(nullif(btrim(coalesce(p_motivo, '')), ''), 300),
         resuelta_por = auth.uid(), resuelta_en = now()
   where id = v.id;
end $$;

revoke all on function reserva_confirmar_solicitud(uuid, uuid) from public, anon;
revoke all on function reserva_rechazar_solicitud(uuid, text) from public, anon;
grant execute on function reserva_confirmar_solicitud(uuid, uuid) to authenticated;
grant execute on function reserva_rechazar_solicitud(uuid, text) to authenticated;

commit;
