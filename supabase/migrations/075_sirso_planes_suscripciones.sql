-- ============================================================
-- SIRO — Planes comerciales administrables + suscripciones con snapshot
-- Migración 075
-- ------------------------------------------------------------
-- QUÉ HACE
--   * Convierte `planes_catalogo` (064) en la fuente única de planes:
--     precios, periodicidad, límites, visibilidad, orden. Se EXTIENDE esa
--     tabla en lugar de crear una `planes` paralela (no duplicar).
--   * Catálogo de funcionalidades + composición por plan (editable).
--   * `suscripciones` (+ límites y funcionalidades CONTRATADOS): cada
--     clínica guarda su propio snapshot. Cambiar un plan después NO
--     cambia a las clínicas existentes salvo orden explícita.
--   * Aplicación REAL en la base de datos: límites por trigger,
--     funcionalidades por políticas RLS restrictivas.
--   * Funciones del superadmin (SECURITY DEFINER) con auditoría.
--
-- QUÉ NO CAMBIA PARA LAS CLÍNICAS EXISTENTES
--   Antes de tocar el catálogo se toma un snapshot de cada clínica con
--   sus condiciones de HOY y con TODAS las funcionalidades activas (hoy
--   no existe ninguna restricción por funcionalidad). Nadie pierde nada
--   al migrar. Una clínica sin suscripción (creada por una vía que no la
--   asignó) conserva el comportamiento anterior: sin restricciones de
--   funcionalidad y con los límites de las columnas viejas.
--
-- DECISIONES QUE CONVIENE SABER
--   * Se elimina el trigger viejo de sesiones (064_limite_sesiones_por_plan):
--     usaba números fijos por código de plan y devolvía 1 para cualquier
--     código que no conociera (incluido 'empresarial'). Quedaba delante
--     del trigger nuevo y lo anulaba.
--   * clinicas.plan/limite_* quedan como ESPEJO escrito solo por estas
--     funciones; la fuente de verdad es la suscripción vigente.
--   * Almacenamiento: se guarda el límite pero NO se aplica (ver GUIA).
-- ============================================================
begin;

-- ---------- 0. Helper ----------
create or replace function fn_es_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select es_super_admin from usuarios where id = auth.uid()), false)
$$;
revoke all on function fn_es_super_admin() from public, anon;
grant execute on function fn_es_super_admin() to authenticated;

create or replace function fn_jsonb_diff(o jsonb, n jsonb)
returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(k, jsonb_build_object('antes', o -> k, 'despues', n -> k)), '{}'::jsonb)
  from jsonb_object_keys(n) k
  where (o -> k) is distinct from (n -> k)
$$;

-- ---------- 1. Planes: extender planes_catalogo ----------
alter table planes_catalogo
  add column if not exists nombre text,
  add column if not exists precio_mensual numeric(12,2),
  add column if not exists precio_anual numeric(12,2),
  add column if not exists moneda text not null default 'MXN',
  add column if not exists permite_mensual boolean not null default true,
  add column if not exists permite_anual boolean not null default true,
  add column if not exists activo boolean not null default true,
  add column if not exists visible boolean not null default true,
  add column if not exists recomendado boolean not null default false,
  add column if not exists orden integer not null default 0,
  add column if not exists max_pacientes integer,
  add column if not exists max_usuarios integer,
  add column if not exists max_almacenamiento_mb integer,
  add column if not exists configuracion_json jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- NULL = ilimitado también para sesiones (antes NOT NULL: no permitía
-- un plan Empresarial sin tope).
alter table planes_catalogo alter column limite_sesiones_simultaneas drop not null;

-- El CHECK con la lista fija de planes impide crear planes nuevos desde el
-- panel (y rechazaría 'esencial' en el renombre de abajo); la llave foránea
-- clinicas.plan → planes_catalogo (064) ya garantiza que el plan exista.
-- DEBE ir ANTES del renombre.
alter table clinicas drop constraint if exists clinicas_plan_check;

-- Renombrar 'basico' → 'esencial' conservando a las clínicas que lo usan.
do $$
begin
  if exists (select 1 from planes_catalogo where plan = 'basico')
     and not exists (select 1 from planes_catalogo where plan = 'esencial') then
    insert into planes_catalogo (plan, limite_sesiones_simultaneas, limite_sucursales, descripcion)
      select 'esencial', limite_sesiones_simultaneas, limite_sucursales, descripcion
      from planes_catalogo where plan = 'basico';
  end if;
  update clinicas set plan = 'esencial' where plan = 'basico';
  delete from planes_catalogo where plan = 'basico';
end $$;

alter table clinicas alter column plan set default 'esencial';

alter table planes_catalogo drop constraint if exists planes_catalogo_codigo_check;
alter table planes_catalogo add constraint planes_catalogo_codigo_check
  check (plan ~ '^[a-z][a-z0-9_]{1,30}$');
alter table planes_catalogo drop constraint if exists planes_catalogo_valores_check;
alter table planes_catalogo add constraint planes_catalogo_valores_check check (
  coalesce(precio_mensual, 0) >= 0 and coalesce(precio_anual, 0) >= 0
  and coalesce(max_pacientes, 0) >= 0 and coalesce(max_usuarios, 0) >= 0
  and coalesce(limite_sucursales, 0) >= 0 and coalesce(limite_sesiones_simultaneas, 0) >= 0
  and coalesce(max_almacenamiento_mb, 0) >= 0
);

-- ---------- 2. Funcionalidades ----------
create table if not exists funcionalidades (
  codigo text primary key check (codigo ~ '^[a-z][a-z0-9_]{1,40}$'),
  nombre text not null,
  descripcion text,
  categoria text not null default 'general',
  -- Dónde se APLICA de verdad (para no prometer lo que no se cumple):
  --   base_de_datos: RLS restrictiva sobre las tablas de la funcionalidad
  --   limite:        la aplica un trigger (cupo)
  --   interfaz:      solo oculta menús/pantallas — no hay tabla propia que
  --                  proteger; un usuario técnico podría seguir llamando la API
  aplicacion text not null default 'interfaz' check (aplicacion in ('base_de_datos', 'limite', 'interfaz')),
  nucleo boolean not null default false,   -- siempre incluida; no se puede desactivar
  activo boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists plan_funcionalidades (
  plan text not null references planes_catalogo(plan) on update cascade on delete cascade,
  funcionalidad text not null references funcionalidades(codigo) on update cascade on delete cascade,
  habilitada boolean not null default true,
  primary key (plan, funcionalidad)
);

-- ---------- 3. Suscripciones + snapshot contratado ----------
create table if not exists suscripciones (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  plan text not null references planes_catalogo(plan) on update cascade,
  modalidad text not null check (modalidad in ('mensual', 'anual')),
  precio_contratado numeric(12,2) check (precio_contratado is null or precio_contratado >= 0),
  moneda text not null default 'MXN',
  fecha_inicio date not null default current_date,
  fecha_fin date,
  estado text not null default 'activa' check (estado in ('activa', 'suspendida', 'reemplazada')),
  auto_renovacion boolean not null default true,
  origen text not null default 'alta' check (origen in ('alta', 'cambio_plan', 'aplicar_condiciones', 'migracion')),
  creado_por uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Una sola suscripción VIGENTE por clínica; las reemplazadas son historial.
create unique index if not exists idx_suscripciones_vigente_por_clinica
  on suscripciones (clinica_id) where estado <> 'reemplazada';
create index if not exists idx_suscripciones_plan on suscripciones (plan) where estado <> 'reemplazada';

create table if not exists suscripcion_limites (
  suscripcion_id uuid primary key references suscripciones(id) on delete cascade,
  max_pacientes integer check (max_pacientes is null or max_pacientes >= 0),   -- null = ilimitado
  max_usuarios integer check (max_usuarios is null or max_usuarios >= 0),
  max_sucursales integer check (max_sucursales is null or max_sucursales >= 0),
  max_sesiones integer check (max_sesiones is null or max_sesiones >= 0),
  max_almacenamiento_mb integer check (max_almacenamiento_mb is null or max_almacenamiento_mb >= 0),
  configuracion_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists suscripcion_funcionalidades (
  suscripcion_id uuid not null references suscripciones(id) on delete cascade,
  funcionalidad text not null references funcionalidades(codigo) on update cascade on delete cascade,
  habilitada boolean not null default true,
  primary key (suscripcion_id, funcionalidad)
);

-- ---------- 4. Catálogo inicial de funcionalidades ----------
-- Solo módulos que EXISTEN en SIRO. No se siembra 'whatsapp' (no hay
-- integración real) ni 'inventario' (no existe el módulo); el
-- superadmin puede crearlas cuando existan.
insert into funcionalidades (codigo, nombre, descripcion, categoria, aplicacion, nucleo, orden) values
  ('pacientes',            'Pacientes',               'Registro y consulta de pacientes.',                         'clinico',        'limite',        true,  10),
  ('expediente_clinico',   'Expediente clínico',      'Antecedentes, alergias y datos clínicos del paciente.',     'clinico',        'base_de_datos', false, 20),
  ('notas_clinicas',       'Notas clínicas',          'Notas de consulta, llamada y observación.',                 'clinico',        'base_de_datos', false, 30),
  ('odontograma_2d',       'Odontograma 2D',          'Odontograma por pieza y por cara.',                         'clinico',        'base_de_datos', false, 40),
  ('odontograma_3d',       'Odontograma 3D',          'Vista tridimensional del odontograma.',                     'clinico',        'interfaz',      false, 50),
  ('periodontograma',      'Periodontograma',         'Sondaje y registro periodontal.',                           'clinico',        'base_de_datos', false, 60),
  ('tratamientos',         'Tratamientos',            'Registro y seguimiento de tratamientos.',                   'clinico',        'base_de_datos', false, 70),
  ('planes_tratamiento',   'Planes de tratamiento',   'Presupuesto y plan de tratamiento imprimible.',             'clinico',        'interfaz',      false, 80),
  ('recetas',              'Recetas',                 'Emisión e impresión de recetas.',                           'clinico',        'base_de_datos', false, 90),
  ('consentimientos',      'Consentimientos',         'Consentimientos informados.',                               'clinico',        'base_de_datos', false, 100),
  ('fotografias',          'Fotografías',             'Fotografías clínicas del paciente.',                        'clinico',        'base_de_datos', false, 110),
  ('documentos',           'Documentos',              'Documentos clínicos adjuntos.',                             'clinico',        'base_de_datos', false, 120),
  ('cie10',                'Diagnósticos CIE-10',     'Catálogo de diagnósticos CIE-10.',                          'clinico',        'interfaz',      false, 130),
  ('agenda',               'Agenda',                  'Agenda, horarios bloqueados y lista de espera.',            'agenda',         'base_de_datos', false, 200),
  ('citas',                'Citas',                   'Alta y gestión de citas.',                                  'agenda',         'base_de_datos', false, 210),
  ('urgencias',            'Urgencias',               'Alta rápida de pacientes de urgencia.',                     'agenda',         'interfaz',      false, 220),
  ('turnos',               'Turnos',                  'Cola de espera del día.',                                   'agenda',         'interfaz',      false, 230),
  ('pagos',                'Pagos',                   'Registro de pagos y saldos.',                               'administrativo', 'base_de_datos', false, 300),
  ('caja',                 'Caja',                    'Corte de caja.',                                            'administrativo', 'interfaz',      false, 310),
  ('usuarios',             'Usuarios',                'Gestión de usuarios de la clínica.',                        'administrativo', 'limite',        true,  320),
  ('roles',                'Roles',                   'Roles de usuario.',                                         'administrativo', 'interfaz',      false, 330),
  ('permisos',             'Permisos',                'Asignación de permisos entre usuarios.',                    'administrativo', 'interfaz',      false, 340),
  ('multisucursal',        'Multisucursal',           'Más de una sucursal por clínica.',                          'administrativo', 'base_de_datos', false, 350),
  ('auditoria',            'Auditoría',               'Consulta del registro de auditoría.',                       'administrativo', 'interfaz',      false, 360),
  ('reportes',             'Reportes',                'Reportes e informes (p. ej. SIS).',                         'analitica',      'interfaz',      false, 400),
  ('estadisticas',         'Estadísticas',            'Panel de indicadores.',                                     'analitica',      'interfaz',      false, 410),
  ('offline',              'Modo sin conexión',       'Trabajo sin internet con cola de cambios.',                 'plataforma',     'interfaz',      false, 500),
  ('sincronizacion',       'Sincronización',          'Sincronización de réplicas locales.',                       'plataforma',     'interfaz',      false, 510),
  ('administracion_avanzada','Administración avanzada','Herramientas avanzadas de administración.',                'plataforma',     'interfaz',      false, 520)
on conflict (codigo) do nothing;

-- ---------- 5. SNAPSHOT de las clínicas existentes (ANTES de tocar el catálogo) ----------
with nuevas as (
  insert into suscripciones (clinica_id, plan, modalidad, precio_contratado, moneda, fecha_inicio, fecha_fin, estado, auto_renovacion, origen)
  select c.id, c.plan, 'mensual', null, 'MXN',
         coalesce(c.fecha_inicio, c.creado_en::date), c.fecha_vencimiento,
         case when c.estado = 'suspendida' then 'suspendida' else 'activa' end, true, 'migracion'
  from clinicas c
  where not exists (select 1 from suscripciones s where s.clinica_id = c.id and s.estado <> 'reemplazada')
  returning id, clinica_id
), lim as (
  insert into suscripcion_limites (suscripcion_id, max_pacientes, max_usuarios, max_sucursales, max_sesiones)
  select n.id, c.limite_pacientes, c.limite_usuarios, pc.limite_sucursales,
         coalesce(c.limite_sesiones_override, pc.limite_sesiones_simultaneas)
  from nuevas n
  join clinicas c on c.id = n.clinica_id
  left join planes_catalogo pc on pc.plan = c.plan
  returning suscripcion_id
)
insert into suscripcion_funcionalidades (suscripcion_id, funcionalidad, habilitada)
select n.id, f.codigo, true
from nuevas n cross join funcionalidades f
where f.activo;

-- ---------- 6. Valores INICIALES del catálogo ----------
-- Solo se fijan en filas aún no configuradas (nombre IS NULL): volver a
-- ejecutar esta migración nunca pisa lo que el superadmin haya editado.
insert into planes_catalogo (plan, nombre, descripcion, precio_mensual, precio_anual, moneda,
                             max_pacientes, max_usuarios, limite_sucursales, limite_sesiones_simultaneas, orden)
values
  ('esencial',    'Esencial',    'Consultorio individual.',                          599,  5990,  'MXN',  500,  1,    1,    1,    1),
  ('profesional', 'Profesional', 'Consultorio con equipo pequeño.',                  999,  9990,  'MXN',  2000, 3,    1,    3,    2),
  ('clinica',     'Clínica',     'Clínica con varios usuarios y hasta 3 sucursales.', 1799, 17990, 'MXN',  7500, 10,   3,    10,   3),
  ('empresarial', 'Empresarial', 'Operación grande; límites a la medida.',            3999, 39990, 'MXN',  null, null, null, null, 4)
on conflict (plan) do update set
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  precio_mensual = excluded.precio_mensual,
  precio_anual = excluded.precio_anual,
  moneda = excluded.moneda,
  max_pacientes = excluded.max_pacientes,
  max_usuarios = excluded.max_usuarios,
  limite_sucursales = excluded.limite_sucursales,
  limite_sesiones_simultaneas = excluded.limite_sesiones_simultaneas,
  orden = excluded.orden,
  updated_at = now()
where planes_catalogo.nombre is null;

-- Composición inicial (PROPUESTA — editable desde el panel; no estaba
-- especificada). Solo se inserta lo que falte: nunca se re-habilita lo
-- que el superadmin haya desactivado.
insert into plan_funcionalidades (plan, funcionalidad, habilitada)
select p.plan, f.codigo, true
from (values
  ('esencial','pacientes'),('esencial','expediente_clinico'),('esencial','notas_clinicas'),('esencial','odontograma_2d'),
  ('esencial','tratamientos'),('esencial','planes_tratamiento'),('esencial','recetas'),('esencial','agenda'),('esencial','citas'),
  ('esencial','pagos'),('esencial','caja'),('esencial','cie10'),('esencial','usuarios'),('esencial','offline'),('esencial','sincronizacion'),
  ('profesional','pacientes'),('profesional','expediente_clinico'),('profesional','notas_clinicas'),('profesional','odontograma_2d'),
  ('profesional','odontograma_3d'),('profesional','periodontograma'),('profesional','tratamientos'),('profesional','planes_tratamiento'),
  ('profesional','recetas'),('profesional','consentimientos'),('profesional','fotografias'),('profesional','documentos'),('profesional','cie10'),
  ('profesional','agenda'),('profesional','citas'),('profesional','urgencias'),('profesional','turnos'),('profesional','pagos'),('profesional','caja'),
  ('profesional','usuarios'),('profesional','roles'),('profesional','permisos'),('profesional','estadisticas'),('profesional','offline'),('profesional','sincronizacion'),
  ('clinica','pacientes'),('clinica','expediente_clinico'),('clinica','notas_clinicas'),('clinica','odontograma_2d'),
  ('clinica','odontograma_3d'),('clinica','periodontograma'),('clinica','tratamientos'),('clinica','planes_tratamiento'),
  ('clinica','recetas'),('clinica','consentimientos'),('clinica','fotografias'),('clinica','documentos'),('clinica','cie10'),
  ('clinica','agenda'),('clinica','citas'),('clinica','urgencias'),('clinica','turnos'),('clinica','pagos'),('clinica','caja'),
  ('clinica','usuarios'),('clinica','roles'),('clinica','permisos'),('clinica','multisucursal'),('clinica','auditoria'),
  ('clinica','reportes'),('clinica','estadisticas'),('clinica','offline'),('clinica','sincronizacion')
) as p(plan, funcionalidad)
join funcionalidades f on f.codigo = p.funcionalidad
on conflict (plan, funcionalidad) do nothing;

-- Empresarial: todo lo que exista (incluye administracion_avanzada).
insert into plan_funcionalidades (plan, funcionalidad, habilitada)
select 'empresarial', codigo, true from funcionalidades
on conflict (plan, funcionalidad) do nothing;

-- ---------- 7. Lectura de límites / funcionalidades (la usan triggers, políticas y RPC) ----------
create or replace function fn_suscripcion_vigente(p_clinica uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from suscripciones where clinica_id = p_clinica and estado <> 'reemplazada' limit 1
$$;

-- NULL = ilimitado. Con suscripción: su snapshot. Sin ella: comportamiento anterior.
create or replace function fn_limite_efectivo(p_clinica uuid, p_tipo text)
returns integer language plpgsql stable security definer set search_path = public as $$
declare
  v_sus uuid;
  v_lim suscripcion_limites%rowtype;
  v_c clinicas%rowtype;
  v_pc planes_catalogo%rowtype;
begin
  if p_tipo not in ('pacientes', 'usuarios', 'sucursales', 'sesiones', 'almacenamiento_mb') then
    raise exception 'Tipo de límite desconocido: %', p_tipo;
  end if;

  v_sus := fn_suscripcion_vigente(p_clinica);
  if v_sus is not null then
    select * into v_lim from suscripcion_limites where suscripcion_id = v_sus;
    if found then
      return case p_tipo
        when 'pacientes' then v_lim.max_pacientes
        when 'usuarios' then v_lim.max_usuarios
        when 'sucursales' then v_lim.max_sucursales
        when 'sesiones' then v_lim.max_sesiones
        else v_lim.max_almacenamiento_mb end;
    end if;
  end if;

  select * into v_c from clinicas where id = p_clinica;
  select * into v_pc from planes_catalogo where plan = v_c.plan;
  return case p_tipo
    when 'pacientes' then v_c.limite_pacientes
    when 'usuarios' then v_c.limite_usuarios
    when 'sucursales' then v_pc.limite_sucursales
    when 'sesiones' then coalesce(v_c.limite_sesiones_override, v_pc.limite_sesiones_simultaneas)
    else null end;
end $$;

-- ¿Esta clínica TIENE CONTRATADA la funcionalidad? (sin atajos para el superadmin:
-- es lo que muestra el panel de la clínica).
create or replace function fn_funcionalidad_contratada(p_clinica uuid, p_codigo text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_f funcionalidades%rowtype;
  v_sus uuid;
  v_hab boolean;
begin
  if p_clinica is null then return false; end if;
  select * into v_f from funcionalidades where codigo = p_codigo;
  if found and v_f.nucleo then return true; end if;
  if not found or not v_f.activo then return false; end if;

  v_sus := fn_suscripcion_vigente(p_clinica);
  if v_sus is null then return true; end if;            -- clínica sin suscripción: sin restricciones (comportamiento anterior)

  select habilitada into v_hab from suscripcion_funcionalidades
   where suscripcion_id = v_sus and funcionalidad = p_codigo;
  return coalesce(v_hab, false);                        -- ausente del snapshot = no contratada
end $$;

-- ¿Puede ESTA SESIÓN usarla? Es lo que evalúan las políticas RLS. El personal
-- de plataforma (superadmin) conserva acceso para dar soporte.
create or replace function fn_clinica_tiene_funcionalidad(p_clinica uuid, p_codigo text)
returns boolean language sql stable security definer set search_path = public as $$
  select fn_es_super_admin() or fn_funcionalidad_contratada(p_clinica, p_codigo)
$$;

create or replace function fn_uso_clinica(p_clinica uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'pacientes',  (select count(*) from pacientes where clinica_id = p_clinica),
    'usuarios',   (select count(*) from usuarios where clinica_id = p_clinica and not es_super_admin),
    'sucursales', (select count(*) from sucursales where clinica_id = p_clinica and activa)
  )
$$;

-- Excesos respecto de los límites contratados (para avisar, nunca para borrar).
create or replace function fn_excesos_clinica(p_clinica uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uso jsonb := fn_uso_clinica(p_clinica);
  v_out jsonb := '[]'::jsonb;
  v_t text; v_l integer; v_u integer;
begin
  foreach v_t in array array['pacientes', 'usuarios', 'sucursales'] loop
    v_l := fn_limite_efectivo(p_clinica, v_t);
    v_u := (v_uso ->> v_t)::int;
    if v_l is not null and v_u > v_l then
      v_out := v_out || jsonb_build_array(jsonb_build_object('tipo', v_t, 'usado', v_u, 'limite', v_l));
    end if;
  end loop;
  return v_out;
end $$;

-- Interno (auditoría): nunca expuesto a la API.
create or replace function fn_auditar_plan(p_actor uuid, p_accion text, p_entidad text, p_entidad_id uuid, p_clinica uuid, p_detalle jsonb)
returns void language sql security definer set search_path = public as $$
  insert into auditoria (usuario_id, accion, entidad, entidad_id, clinica_id, detalle)
  values (p_actor, p_accion, p_entidad, p_entidad_id, p_clinica, coalesce(p_detalle, '{}'::jsonb))
$$;

-- ---------- 8. APLICACIÓN de límites ----------
-- 8a. Pacientes. Mismo trigger de 030, con el límite leído de la suscripción
--     y SIN contar el reintento de un paciente que ya existe: un upsert
--     idempotente de la cola offline dispara este BEFORE INSERT antes de
--     que Postgres detecte el conflicto de id; sin esta salvaguarda, en el
--     cupo exacto (500/500) reintentar el MISMO paciente fallaría.
create or replace function fn_set_clinica_pacientes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_folio integer;
  v_limite integer;
  v_total integer;
begin
  if new.clinica_id is null then
    new.clinica_id := auth_clinica_id();
  end if;
  if new.clinica_id is null then
    raise exception 'No es posible registrar el paciente: tu clínica está suspendida.';
  end if;
  if new.creado_por is null then
    new.creado_por := auth.uid();
  end if;

  -- Bloquea la fila de la clínica (condición de carrera con folio y conteo).
  select siguiente_folio_paciente into v_folio from clinicas where id = new.clinica_id for update;

  v_limite := fn_limite_efectivo(new.clinica_id, 'pacientes');
  if v_limite is not null and not exists (select 1 from pacientes where id = new.id) then
    select count(*) into v_total from pacientes where clinica_id = new.clinica_id;
    if v_total >= v_limite then
      raise exception 'Has alcanzado el límite de pacientes de tu plan (%). Contacta al administrador para ampliarlo.', v_limite
        using errcode = 'PT402', detail = 'PLAN_LIMIT_REACHED', hint = 'pacientes';
    end if;
  end if;

  if new.numero_expediente is null then
    new.numero_expediente := 'EXP-' || lpad(v_folio::text, 4, '0');
    update clinicas set siguiente_folio_paciente = v_folio + 1 where id = new.clinica_id;
  end if;

  return new;
end $$;

-- 8b. Usuarios (antes solo lo comprobaba la Edge Function crear-usuario).
--     Los superadmin no consumen cupo de la clínica donde estén asignados.
create or replace function fn_validar_limite_usuarios()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_limite integer;
  v_total integer;
begin
  if new.es_super_admin then return new; end if;
  perform 1 from clinicas where id = new.clinica_id for update;
  v_limite := fn_limite_efectivo(new.clinica_id, 'usuarios');
  if v_limite is not null then
    select count(*) into v_total from usuarios where clinica_id = new.clinica_id and not es_super_admin;
    if v_total >= v_limite then
      raise exception 'Has alcanzado el límite de usuarios de tu plan (%). Contacta al administrador para ampliarlo.', v_limite
        using errcode = 'PT402', detail = 'PLAN_LIMIT_REACHED', hint = 'usuarios';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_validar_limite_usuarios on usuarios;
create trigger trg_validar_limite_usuarios before insert on usuarios
  for each row execute function fn_validar_limite_usuarios();

-- 8c. Sucursales (no se aplicaba en ningún lado). Solo cuentan las activas;
--     reactivar una inactiva pasa por la misma validación.
create or replace function fn_validar_limite_sucursales()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_limite integer;
  v_total integer;
begin
  if tg_op = 'UPDATE' and not (new.activa and not old.activa) then return new; end if;
  if not new.activa then return new; end if;

  perform 1 from clinicas where id = new.clinica_id for update;
  select count(*) into v_total from sucursales
   where clinica_id = new.clinica_id and activa and id is distinct from new.id;

  if v_total >= 1 and not fn_clinica_tiene_funcionalidad(new.clinica_id, 'multisucursal') then
    raise exception 'Esta funcionalidad no está disponible en tu plan.'
      using errcode = 'PT403', detail = 'FEATURE_NOT_AVAILABLE', hint = 'multisucursal';
  end if;

  v_limite := fn_limite_efectivo(new.clinica_id, 'sucursales');
  if v_limite is not null and v_total >= v_limite then
    raise exception 'Has alcanzado el límite de sucursales de tu plan (%). Contacta al administrador para ampliarlo.', v_limite
      using errcode = 'PT402', detail = 'PLAN_LIMIT_REACHED', hint = 'sucursales';
  end if;
  return new;
end $$;
drop trigger if exists trg_validar_limite_sucursales on sucursales;
create trigger trg_validar_limite_sucursales before insert or update of activa on sucursales
  for each row execute function fn_validar_limite_sucursales();

-- 8d. Sesiones simultáneas: se conserva el comportamiento de 064 (cerrar la
--     más antigua en lugar de rechazar el inicio de sesión), leyendo ahora
--     de la suscripción. Se elimina el trigger viejo de números fijos.
drop trigger if exists trg_aplicar_limite_sesiones on sesiones_usuario;
drop function if exists fn_aplicar_limite_sesiones();

create or replace function fn_limite_sesiones_de(p_usuario_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select case when u.es_super_admin then null else fn_limite_efectivo(u.clinica_id, 'sesiones') end
  from usuarios u where u.id = p_usuario_id
$$;

create or replace function mi_limite_sesiones()
returns integer language sql stable security definer set search_path = public as $$
  select fn_limite_sesiones_de(auth.uid())
$$;
grant execute on function mi_limite_sesiones() to authenticated;
drop function if exists fn_limite_sesiones_por_plan(text);

-- ---------- 9. APLICACIÓN de funcionalidades (RLS restrictiva) ----------
-- Las políticas restrictivas se SUMAN (AND) a las existentes: no aflojan
-- ninguna. `(select …)` hace que se evalúe una vez por consulta.
do $$
declare
  m record;
begin
  for m in
    select * from (values
      ('periodontograma_piezas',   'periodontograma'),
      ('periodontograma_sitios',   'periodontograma'),
      ('periodontograma_historial','periodontograma'),
      ('odontograma_piezas',       'odontograma_2d'),
      ('odontograma_caras',        'odontograma_2d'),
      ('odontograma_historial',    'odontograma_2d'),
      ('recetas',                  'recetas'),
      ('consentimientos_informados','consentimientos'),
      ('fotografias',              'fotografias'),
      ('documentos_clinicos',      'documentos'),
      ('pagos',                    'pagos'),
      ('tratamientos',             'tratamientos'),
      ('citas',                    'citas'),
      ('horarios_bloqueados',      'agenda'),
      ('lista_espera',             'agenda'),
      ('notas_clinicas',           'notas_clinicas'),
      ('expedientes',              'expediente_clinico'),
      ('signos_vitales',           'expediente_clinico')
    ) as t(tabla, funcionalidad)
  loop
    execute format('drop policy if exists plan_func_%s on %I', m.tabla, m.tabla);
    execute format(
      'create policy plan_func_%s on %I as restrictive for all to authenticated '
      'using ((select fn_clinica_tiene_funcionalidad(auth_clinica_id(), %L))) '
      'with check ((select fn_clinica_tiene_funcionalidad(auth_clinica_id(), %L)))',
      m.tabla, m.tabla, m.funcionalidad, m.funcionalidad);
  end loop;
end $$;

-- ---------- 10. RLS de las tablas nuevas: lectura acotada, escritura SOLO por funciones ----------
alter table funcionalidades enable row level security;
alter table plan_funcionalidades enable row level security;
alter table suscripciones enable row level security;
alter table suscripcion_limites enable row level security;
alter table suscripcion_funcionalidades enable row level security;

revoke all on funcionalidades, plan_funcionalidades, suscripciones, suscripcion_limites, suscripcion_funcionalidades from anon;
revoke insert, update, delete, truncate on funcionalidades, plan_funcionalidades, suscripciones, suscripcion_limites, suscripcion_funcionalidades from authenticated;

drop policy if exists funcionalidades_select on funcionalidades;
create policy funcionalidades_select on funcionalidades
  for select to authenticated using (activo or fn_es_super_admin());

-- Un plan es visible para: el superadmin, cualquiera si está activo y visible,
-- y siempre para la clínica que lo tiene contratado (aunque ya no sea visible).
drop policy if exists planes_catalogo_select on planes_catalogo;
create policy planes_catalogo_select on planes_catalogo
  for select to authenticated using (
    fn_es_super_admin()
    or (activo and visible)
    or plan = (select s.plan from suscripciones s where s.clinica_id = auth_clinica_id_raw() and s.estado <> 'reemplazada' limit 1)
  );

drop policy if exists plan_funcionalidades_select on plan_funcionalidades;
create policy plan_funcionalidades_select on plan_funcionalidades
  for select to authenticated using (
    fn_es_super_admin()
    or exists (select 1 from planes_catalogo p where p.plan = plan_funcionalidades.plan and p.activo and p.visible)
  );

-- Precios contratados: solo el dueño de la clínica y el superadmin.
drop policy if exists suscripciones_select on suscripciones;
create policy suscripciones_select on suscripciones
  for select to authenticated using (
    fn_es_super_admin() or (clinica_id = auth_clinica_id_raw() and auth_rol() = 'owner')
  );
drop policy if exists suscripcion_limites_select on suscripcion_limites;
create policy suscripcion_limites_select on suscripcion_limites
  for select to authenticated using (
    exists (select 1 from suscripciones s where s.id = suscripcion_id
            and (fn_es_super_admin() or (s.clinica_id = auth_clinica_id_raw() and auth_rol() = 'owner')))
  );
drop policy if exists suscripcion_funcionalidades_select on suscripcion_funcionalidades;
create policy suscripcion_funcionalidades_select on suscripcion_funcionalidades
  for select to authenticated using (
    exists (select 1 from suscripciones s where s.id = suscripcion_id
            and (fn_es_super_admin() or (s.clinica_id = auth_clinica_id_raw() and auth_rol() = 'owner')))
  );

-- ---------- 11. Asignar / cambiar plan de una clínica (con snapshot) ----------
-- INTERNA: la llama la Edge Function admin-crear-clinica (service_role) y el
-- wrapper del superadmin. No se expone a la API pública.
create or replace function fn_asignar_plan_interno(
  p_actor uuid, p_clinica uuid, p_plan text, p_modalidad text,
  p_precio numeric default null, p_fecha_inicio date default null,
  p_fecha_fin date default null, p_auto_renovacion boolean default true
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clinica clinicas%rowtype;
  v_plan planes_catalogo%rowtype;
  v_old suscripciones%rowtype;
  v_old_lim suscripcion_limites%rowtype;
  v_nueva uuid;
  v_precio numeric;
  v_origen text;
  v_estado text;
begin
  select * into v_clinica from clinicas where id = p_clinica for update;
  if not found then raise exception 'La clínica no existe.'; end if;

  select * into v_plan from planes_catalogo where plan = p_plan;
  if not found then raise exception 'El plan "%" no existe.', p_plan; end if;
  if not v_plan.activo then raise exception 'El plan "%" está desactivado.', v_plan.nombre; end if;
  if p_modalidad not in ('mensual', 'anual') then raise exception 'Modalidad inválida (mensual o anual).'; end if;
  if (p_modalidad = 'mensual' and not v_plan.permite_mensual) or (p_modalidad = 'anual' and not v_plan.permite_anual) then
    raise exception 'El plan "%" no permite la modalidad %.', v_plan.nombre, p_modalidad;
  end if;

  v_precio := coalesce(p_precio, case p_modalidad when 'mensual' then v_plan.precio_mensual else v_plan.precio_anual end);

  select * into v_old from suscripciones where clinica_id = p_clinica and estado <> 'reemplazada';
  if found then
    select * into v_old_lim from suscripcion_limites where suscripcion_id = v_old.id;
    v_origen := case when v_old.plan = p_plan then 'aplicar_condiciones' else 'cambio_plan' end;
    -- Una clínica suspendida sigue suspendida: cambiar de plan no la reactiva.
    v_estado := v_old.estado;
    update suscripciones set estado = 'reemplazada', fecha_fin = least(coalesce(fecha_fin, current_date), current_date),
           updated_at = now() where id = v_old.id;
  else
    v_origen := 'alta';
    v_estado := case when v_clinica.estado = 'suspendida' then 'suspendida' else 'activa' end;
  end if;

  insert into suscripciones (clinica_id, plan, modalidad, precio_contratado, moneda, fecha_inicio, fecha_fin,
                             estado, auto_renovacion, origen, creado_por)
  values (p_clinica, p_plan, p_modalidad, v_precio, v_plan.moneda, coalesce(p_fecha_inicio, current_date),
          p_fecha_fin, v_estado, coalesce(p_auto_renovacion, true), v_origen, p_actor)
  returning id into v_nueva;

  insert into suscripcion_limites (suscripcion_id, max_pacientes, max_usuarios, max_sucursales, max_sesiones,
                                   max_almacenamiento_mb, configuracion_json)
  values (v_nueva, v_plan.max_pacientes, v_plan.max_usuarios, v_plan.limite_sucursales,
          v_plan.limite_sesiones_simultaneas, v_plan.max_almacenamiento_mb, v_plan.configuracion_json);

  insert into suscripcion_funcionalidades (suscripcion_id, funcionalidad, habilitada)
  select v_nueva, f.codigo, (f.nucleo or coalesce(pf.habilitada, false))
  from funcionalidades f
  left join plan_funcionalidades pf on pf.plan = p_plan and pf.funcionalidad = f.codigo
  where f.activo;

  -- Espejo para lo que aún lee las columnas viejas (Edge Function crear-usuario,
  -- pantalla de administración). NO es la fuente de verdad.
  update clinicas set plan = p_plan,
         limite_usuarios = v_plan.max_usuarios,
         limite_pacientes = v_plan.max_pacientes,
         fecha_inicio = coalesce(p_fecha_inicio, current_date),
         fecha_vencimiento = p_fecha_fin
   where id = p_clinica;

  perform fn_auditar_plan(p_actor,
    case v_origen when 'alta' then 'asignar_plan' when 'cambio_plan' then 'cambiar_plan' else 'aplicar_condiciones_plan' end,
    'suscripciones', v_nueva, p_clinica,
    jsonb_build_object(
      'plan_anterior', v_old.plan, 'plan_nuevo', p_plan, 'modalidad', p_modalidad,
      'precio_anterior', v_old.precio_contratado, 'precio_nuevo', v_precio,
      'limites_anteriores', case when v_old.id is null then null else to_jsonb(v_old_lim) - 'suscripcion_id' - 'updated_at' end,
      'limites_nuevos', jsonb_build_object('max_pacientes', v_plan.max_pacientes, 'max_usuarios', v_plan.max_usuarios,
        'max_sucursales', v_plan.limite_sucursales, 'max_sesiones', v_plan.limite_sesiones_simultaneas)));

  return jsonb_build_object('suscripcion_id', v_nueva, 'origen', v_origen, 'excesos', fn_excesos_clinica(p_clinica));
end $$;
revoke all on function fn_asignar_plan_interno(uuid, uuid, text, text, numeric, date, date, boolean) from public, anon, authenticated;
grant execute on function fn_asignar_plan_interno(uuid, uuid, text, text, numeric, date, date, boolean) to service_role;

create or replace function sa_asignar_plan_clinica(
  p_clinica uuid, p_plan text, p_modalidad text, p_precio numeric default null,
  p_fecha_inicio date default null, p_fecha_fin date default null, p_auto_renovacion boolean default true
) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not fn_es_super_admin() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  return fn_asignar_plan_interno(auth.uid(), p_clinica, p_plan, p_modalidad, p_precio, p_fecha_inicio, p_fecha_fin, p_auto_renovacion);
end $$;

-- Ajuste manual de UNA clínica sobre su snapshot (convenios a la medida), sin
-- tocar el plan. p_limites: llaves max_*; null explícito = ilimitado.
create or replace function sa_ajustar_condiciones_clinica(p_clinica uuid, p_limites jsonb default null, p_funcionalidades jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sus uuid;
  v_old suscripcion_limites%rowtype;
  v_new suscripcion_limites%rowtype;
  v_k text; v_hab_old boolean;
  v_cambios_f jsonb := '{}'::jsonb;
begin
  if not fn_es_super_admin() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  perform 1 from clinicas where id = p_clinica for update;
  v_sus := fn_suscripcion_vigente(p_clinica);
  if v_sus is null then raise exception 'La clínica no tiene una suscripción vigente.'; end if;

  select * into v_old from suscripcion_limites where suscripcion_id = v_sus;
  v_new := v_old;
  if p_limites is not null then
    v_new := jsonb_populate_record(v_old, (select coalesce(jsonb_object_agg(k, p_limites -> k), '{}'::jsonb)
        from jsonb_object_keys(p_limites) k
        where k in ('max_pacientes', 'max_usuarios', 'max_sucursales', 'max_sesiones', 'max_almacenamiento_mb')));
    update suscripcion_limites set max_pacientes = v_new.max_pacientes, max_usuarios = v_new.max_usuarios,
           max_sucursales = v_new.max_sucursales, max_sesiones = v_new.max_sesiones,
           max_almacenamiento_mb = v_new.max_almacenamiento_mb, updated_at = now()
     where suscripcion_id = v_sus;
    update clinicas set limite_usuarios = v_new.max_usuarios, limite_pacientes = v_new.max_pacientes where id = p_clinica;
  end if;

  if p_funcionalidades is not null then
    for v_k in select jsonb_object_keys(p_funcionalidades) loop
      if not exists (select 1 from funcionalidades where codigo = v_k and activo) then
        raise exception 'La funcionalidad "%" no existe o está desactivada.', v_k;
      end if;
      if (p_funcionalidades ->> v_k)::boolean is false and exists (select 1 from funcionalidades where codigo = v_k and nucleo) then
        raise exception 'La funcionalidad "%" es parte del núcleo y no se puede desactivar.', v_k;
      end if;
      select habilitada into v_hab_old from suscripcion_funcionalidades where suscripcion_id = v_sus and funcionalidad = v_k;
      insert into suscripcion_funcionalidades (suscripcion_id, funcionalidad, habilitada)
        values (v_sus, v_k, (p_funcionalidades ->> v_k)::boolean)
        on conflict (suscripcion_id, funcionalidad) do update set habilitada = excluded.habilitada;
      if v_hab_old is distinct from (p_funcionalidades ->> v_k)::boolean then
        v_cambios_f := v_cambios_f || jsonb_build_object(v_k, jsonb_build_object('antes', v_hab_old, 'despues', (p_funcionalidades ->> v_k)::boolean));
      end if;
    end loop;
  end if;

  perform fn_auditar_plan(auth.uid(), 'ajustar_condiciones_clinica', 'suscripciones', v_sus, p_clinica,
    jsonb_build_object('limites', fn_jsonb_diff(to_jsonb(v_old), to_jsonb(v_new)), 'funcionalidades', v_cambios_f));
  return jsonb_build_object('suscripcion_id', v_sus, 'excesos', fn_excesos_clinica(p_clinica));
end $$;

create or replace function sa_suspender_suscripcion(p_clinica uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_sus uuid;
begin
  if not fn_es_super_admin() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  v_sus := fn_suscripcion_vigente(p_clinica);
  if v_sus is null then raise exception 'La clínica no tiene una suscripción vigente.'; end if;
  update suscripciones set estado = 'suspendida', updated_at = now() where id = v_sus;
  update clinicas set estado = 'suspendida' where id = p_clinica;
  perform fn_auditar_plan(auth.uid(), 'suspender_suscripcion', 'suscripciones', v_sus, p_clinica, jsonb_build_object('motivo', p_motivo));
end $$;

create or replace function sa_reactivar_suscripcion(p_clinica uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_sus uuid;
begin
  if not fn_es_super_admin() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  v_sus := fn_suscripcion_vigente(p_clinica);
  if v_sus is null then raise exception 'La clínica no tiene una suscripción vigente.'; end if;
  update suscripciones set estado = 'activa', updated_at = now() where id = v_sus;
  update clinicas set estado = 'activa' where id = p_clinica;
  perform fn_auditar_plan(auth.uid(), 'reactivar_suscripcion', 'suscripciones', v_sus, p_clinica, '{}'::jsonb);
end $$;

-- ---------- 12. Administrar planes ----------
create or replace function sa_guardar_plan(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_codigo text := lower(trim(p ->> 'codigo'));
  v_old planes_catalogo%rowtype;
  v_new planes_catalogo%rowtype;
  v_existe boolean;
  v_clean jsonb;
begin
  if not fn_es_super_admin() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  if v_codigo is null or v_codigo !~ '^[a-z][a-z0-9_]{1,30}$' then
    raise exception 'Código de plan inválido: usa minúsculas, números o guion bajo (2 a 31 caracteres, empezando con letra).';
  end if;

  v_clean := (select coalesce(jsonb_object_agg(k, p -> k), '{}'::jsonb) from jsonb_object_keys(p) k
              where k in ('nombre', 'descripcion', 'precio_mensual', 'precio_anual', 'moneda', 'permite_mensual', 'permite_anual',
                          'activo', 'visible', 'recomendado', 'orden', 'max_pacientes', 'max_usuarios', 'limite_sucursales',
                          'limite_sesiones_simultaneas', 'max_almacenamiento_mb', 'configuracion_json'));

  select * into v_old from planes_catalogo where plan = v_codigo for update;
  v_existe := found;
  if v_existe then
    v_new := jsonb_populate_record(v_old, v_clean);
  else
    v_new := jsonb_populate_record(null::planes_catalogo, v_clean || jsonb_build_object('plan', v_codigo));
    v_new.moneda := coalesce(v_new.moneda, 'MXN');
    v_new.permite_mensual := coalesce(v_new.permite_mensual, true);
    v_new.permite_anual := coalesce(v_new.permite_anual, true);
    v_new.activo := coalesce(v_new.activo, true);
    v_new.visible := coalesce(v_new.visible, true);
    v_new.recomendado := coalesce(v_new.recomendado, false);
    v_new.orden := coalesce(v_new.orden, 0);
    v_new.configuracion_json := coalesce(v_new.configuracion_json, '{}'::jsonb);
  end if;

  if coalesce(trim(v_new.nombre), '') = '' then raise exception 'El plan necesita un nombre.'; end if;
  if not (v_new.permite_mensual or v_new.permite_anual) then raise exception 'El plan debe permitir al menos una modalidad (mensual o anual).'; end if;
  if v_new.permite_mensual and v_new.precio_mensual is null then raise exception 'Falta el precio mensual.'; end if;
  if v_new.permite_anual and v_new.precio_anual is null then raise exception 'Falta el precio anual.'; end if;

  if v_existe then
    update planes_catalogo set nombre = v_new.nombre, descripcion = v_new.descripcion,
      precio_mensual = v_new.precio_mensual, precio_anual = v_new.precio_anual, moneda = v_new.moneda,
      permite_mensual = v_new.permite_mensual, permite_anual = v_new.permite_anual, activo = v_new.activo,
      visible = v_new.visible, recomendado = v_new.recomendado, orden = v_new.orden,
      max_pacientes = v_new.max_pacientes, max_usuarios = v_new.max_usuarios, limite_sucursales = v_new.limite_sucursales,
      limite_sesiones_simultaneas = v_new.limite_sesiones_simultaneas, max_almacenamiento_mb = v_new.max_almacenamiento_mb,
      configuracion_json = v_new.configuracion_json, updated_at = now()
    where plan = v_codigo;
    if fn_jsonb_diff(to_jsonb(v_old) - 'updated_at', to_jsonb(v_new) - 'updated_at') <> '{}'::jsonb then
      perform fn_auditar_plan(auth.uid(), 'editar_plan', 'planes_catalogo', null, null,
        jsonb_build_object('plan', v_codigo, 'nombre', v_new.nombre,
                           'cambios', fn_jsonb_diff(to_jsonb(v_old) - 'updated_at', to_jsonb(v_new) - 'updated_at')));
    end if;
  else
    insert into planes_catalogo (plan, nombre, descripcion, precio_mensual, precio_anual, moneda, permite_mensual, permite_anual,
      activo, visible, recomendado, orden, max_pacientes, max_usuarios, limite_sucursales, limite_sesiones_simultaneas,
      max_almacenamiento_mb, configuracion_json)
    values (v_codigo, v_new.nombre, v_new.descripcion, v_new.precio_mensual, v_new.precio_anual, v_new.moneda, v_new.permite_mensual,
      v_new.permite_anual, v_new.activo, v_new.visible, v_new.recomendado, v_new.orden, v_new.max_pacientes, v_new.max_usuarios,
      v_new.limite_sucursales, v_new.limite_sesiones_simultaneas, v_new.max_almacenamiento_mb, v_new.configuracion_json);
    perform fn_auditar_plan(auth.uid(), 'crear_plan', 'planes_catalogo', null, null,
      jsonb_build_object('plan', v_codigo, 'nombre', v_new.nombre, 'valores', to_jsonb(v_new) - 'created_at' - 'updated_at'));
  end if;

  return (select to_jsonb(x) from planes_catalogo x where x.plan = v_codigo);
end $$;

create or replace function sa_set_plan_funcionalidades(p_plan text, p_funcionalidades jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_k text; v_old boolean; v_new boolean; v_cambios jsonb := '{}'::jsonb;
begin
  if not fn_es_super_admin() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  perform 1 from planes_catalogo where plan = p_plan for update;
  if not found then raise exception 'El plan "%" no existe.', p_plan; end if;
  for v_k in select jsonb_object_keys(p_funcionalidades) loop
    if not exists (select 1 from funcionalidades where codigo = v_k and activo) then
      raise exception 'La funcionalidad "%" no existe o está desactivada.', v_k;
    end if;
    v_new := (p_funcionalidades ->> v_k)::boolean;
    if v_new is false and exists (select 1 from funcionalidades where codigo = v_k and nucleo) then
      raise exception 'La funcionalidad "%" es parte del núcleo y no se puede desactivar.', v_k;
    end if;
    select habilitada into v_old from plan_funcionalidades where plan = p_plan and funcionalidad = v_k;
    insert into plan_funcionalidades (plan, funcionalidad, habilitada) values (p_plan, v_k, v_new)
      on conflict (plan, funcionalidad) do update set habilitada = excluded.habilitada;
    if coalesce(v_old, false) is distinct from v_new then
      v_cambios := v_cambios || jsonb_build_object(v_k, jsonb_build_object('antes', coalesce(v_old, false), 'despues', v_new));
    end if;
  end loop;
  update planes_catalogo set updated_at = now() where plan = p_plan;
  if v_cambios <> '{}'::jsonb then
    perform fn_auditar_plan(auth.uid(), 'editar_funcionalidades_plan', 'planes_catalogo', null, null,
      jsonb_build_object('plan', p_plan, 'cambios', v_cambios));
  end if;
end $$;

create or replace function sa_activar_plan(p_plan text, p_activo boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_old boolean;
begin
  if not fn_es_super_admin() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  select activo into v_old from planes_catalogo where plan = p_plan for update;
  if not found then raise exception 'El plan "%" no existe.', p_plan; end if;
  update planes_catalogo set activo = p_activo, updated_at = now() where plan = p_plan;
  perform fn_auditar_plan(auth.uid(), case when p_activo then 'activar_plan' else 'desactivar_plan' end, 'planes_catalogo', null, null,
    jsonb_build_object('plan', p_plan, 'activo_anterior', v_old, 'activo_nuevo', p_activo));
end $$;

create or replace function sa_duplicar_plan(p_origen text, p_nuevo text, p_nombre text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_o planes_catalogo%rowtype; v_nuevo text := lower(trim(p_nuevo));
begin
  if not fn_es_super_admin() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  select * into v_o from planes_catalogo where plan = p_origen;
  if not found then raise exception 'El plan "%" no existe.', p_origen; end if;
  if v_nuevo is null or v_nuevo !~ '^[a-z][a-z0-9_]{1,30}$' then raise exception 'Código de plan inválido.'; end if;
  if exists (select 1 from planes_catalogo where plan = v_nuevo) then raise exception 'Ya existe un plan con el código "%".', v_nuevo; end if;
  if coalesce(trim(p_nombre), '') = '' then raise exception 'El plan necesita un nombre.'; end if;

  -- Nace DESACTIVADO: el duplicado se revisa antes de ofrecerse a nuevas clínicas.
  insert into planes_catalogo (plan, nombre, descripcion, precio_mensual, precio_anual, moneda, permite_mensual, permite_anual,
    activo, visible, recomendado, orden, max_pacientes, max_usuarios, limite_sucursales, limite_sesiones_simultaneas,
    max_almacenamiento_mb, configuracion_json)
  values (v_nuevo, trim(p_nombre), v_o.descripcion, v_o.precio_mensual, v_o.precio_anual, v_o.moneda, v_o.permite_mensual, v_o.permite_anual,
    false, v_o.visible, false, v_o.orden + 1, v_o.max_pacientes, v_o.max_usuarios, v_o.limite_sucursales, v_o.limite_sesiones_simultaneas,
    v_o.max_almacenamiento_mb, v_o.configuracion_json);
  insert into plan_funcionalidades (plan, funcionalidad, habilitada)
    select v_nuevo, funcionalidad, habilitada from plan_funcionalidades where plan = p_origen;
  perform fn_auditar_plan(auth.uid(), 'duplicar_plan', 'planes_catalogo', null, null,
    jsonb_build_object('plan_origen', p_origen, 'plan_nuevo', v_nuevo));
  return (select to_jsonb(x) from planes_catalogo x where x.plan = v_nuevo);
end $$;

-- Crear/editar una funcionalidad del catálogo. Las creadas aquí son de
-- INTERFAZ: aplicar una funcionalidad en base de datos exige una migración
-- (políticas sobre sus tablas), así que no se ofrece desde un panel.
create or replace function sa_guardar_funcionalidad(p jsonb, p_planes jsonb default null, p_aplicar_a_suscripciones boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_codigo text := lower(trim(p ->> 'codigo'));
  v_existe boolean;
  v_plan text;
  v_n integer := 0;
begin
  if not fn_es_super_admin() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  if v_codigo is null or v_codigo !~ '^[a-z][a-z0-9_]{1,40}$' then
    raise exception 'Código de funcionalidad inválido: minúsculas, números o guion bajo.';
  end if;
  if coalesce(trim(p ->> 'nombre'), '') = '' then raise exception 'La funcionalidad necesita un nombre.'; end if;

  select true into v_existe from funcionalidades where codigo = v_codigo;
  if coalesce(v_existe, false) then
    update funcionalidades set nombre = trim(p ->> 'nombre'),
      descripcion = case when p ? 'descripcion' then p ->> 'descripcion' else descripcion end,
      categoria = coalesce(p ->> 'categoria', categoria),
      activo = coalesce((p ->> 'activo')::boolean, activo),
      orden = coalesce((p ->> 'orden')::int, orden), updated_at = now()
    where codigo = v_codigo;
    perform fn_auditar_plan(auth.uid(), 'editar_funcionalidad', 'funcionalidades', null, null, jsonb_build_object('codigo', v_codigo, 'cambios', p));
  else
    insert into funcionalidades (codigo, nombre, descripcion, categoria, aplicacion, nucleo, activo, orden)
    values (v_codigo, trim(p ->> 'nombre'), p ->> 'descripcion', coalesce(p ->> 'categoria', 'general'), 'interfaz', false,
            coalesce((p ->> 'activo')::boolean, true), coalesce((p ->> 'orden')::int, 1000));
    perform fn_auditar_plan(auth.uid(), 'crear_funcionalidad', 'funcionalidades', null, null, jsonb_build_object('codigo', v_codigo, 'valores', p));
  end if;

  if p_planes is not null then
    for v_plan in select jsonb_array_elements_text(p_planes) loop
      if not exists (select 1 from planes_catalogo where plan = v_plan) then raise exception 'El plan "%" no existe.', v_plan; end if;
      insert into plan_funcionalidades (plan, funcionalidad, habilitada) values (v_plan, v_codigo, true)
        on conflict (plan, funcionalidad) do update set habilitada = true;
      if p_aplicar_a_suscripciones then
        -- Explícito: solo las clínicas vigentes de esos planes, y solo si se pidió.
        insert into suscripcion_funcionalidades (suscripcion_id, funcionalidad, habilitada)
          select s.id, v_codigo, true from suscripciones s where s.plan = v_plan and s.estado <> 'reemplazada'
          on conflict (suscripcion_id, funcionalidad) do update set habilitada = true;
        get diagnostics v_n = row_count;
      end if;
    end loop;
  end if;
  return jsonb_build_object('codigo', v_codigo, 'suscripciones_actualizadas', v_n);
end $$;

-- ---------- 13. Lecturas del panel de superadmin ----------
create or replace function sa_listar_planes()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not fn_es_super_admin() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object(
      'clinicas_usando', (select count(*) from suscripciones s where s.plan = p.plan and s.estado <> 'reemplazada'),
      'funcionalidades_habilitadas', (select count(*) from plan_funcionalidades pf where pf.plan = p.plan and pf.habilitada)
    ) order by p.orden, p.plan) from planes_catalogo p), '[]'::jsonb);
end $$;

create or replace function sa_funcionalidades_de_plan(p_plan text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not fn_es_super_admin() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('codigo', f.codigo, 'nombre', f.nombre, 'descripcion', f.descripcion,
      'categoria', f.categoria, 'aplicacion', f.aplicacion, 'nucleo', f.nucleo, 'activo', f.activo,
      'habilitada', f.nucleo or coalesce(pf.habilitada, false)) order by f.orden, f.codigo)
    from funcionalidades f left join plan_funcionalidades pf on pf.plan = p_plan and pf.funcionalidad = f.codigo), '[]'::jsonb);
end $$;

-- Clínicas con un plan, y si su snapshot YA difiere del plan actual (esas son
-- las que se verían afectadas si se decide "aplicar condiciones").
create or replace function sa_clinicas_de_plan(p_plan text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not fn_es_super_admin() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'clinica_id', c.id, 'nombre', c.nombre, 'estado_clinica', c.estado, 'suscripcion_id', s.id, 'estado', s.estado,
      'modalidad', s.modalidad, 'precio_contratado', s.precio_contratado, 'fecha_inicio', s.fecha_inicio, 'origen', s.origen,
      'difiere_del_plan', (
         (l.max_pacientes, l.max_usuarios, l.max_sucursales, l.max_sesiones, l.max_almacenamiento_mb)
           is distinct from (p.max_pacientes, p.max_usuarios, p.limite_sucursales, p.limite_sesiones_simultaneas, p.max_almacenamiento_mb)
         or coalesce((select array_agg(sf.funcionalidad order by sf.funcionalidad) from suscripcion_funcionalidades sf
                      where sf.suscripcion_id = s.id and sf.habilitada), '{}'::text[])
            is distinct from
            coalesce((select array_agg(f.codigo order by f.codigo) from funcionalidades f
                      left join plan_funcionalidades pf on pf.plan = p.plan and pf.funcionalidad = f.codigo
                      where f.activo and (f.nucleo or coalesce(pf.habilitada, false))), '{}'::text[]))
    ) order by c.nombre)
    from suscripciones s join clinicas c on c.id = s.clinica_id join planes_catalogo p on p.plan = s.plan
    join suscripcion_limites l on l.suscripcion_id = s.id
    where s.plan = p_plan and s.estado <> 'reemplazada'), '[]'::jsonb);
end $$;

create or replace function sa_suscripcion_de_clinica(p_clinica uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_sus uuid := fn_suscripcion_vigente(p_clinica);
begin
  if not fn_es_super_admin() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'vigente', (select to_jsonb(s) || jsonb_build_object('plan_nombre', p.nombre,
         'limites', (select to_jsonb(l) - 'suscripcion_id' from suscripcion_limites l where l.suscripcion_id = s.id),
         'funcionalidades', (select coalesce(jsonb_agg(jsonb_build_object('codigo', f.codigo, 'nombre', f.nombre, 'categoria', f.categoria,
              'aplicacion', f.aplicacion, 'nucleo', f.nucleo, 'habilitada', sf.habilitada) order by f.orden, f.codigo), '[]'::jsonb)
            from suscripcion_funcionalidades sf join funcionalidades f on f.codigo = sf.funcionalidad where sf.suscripcion_id = s.id))
       from suscripciones s join planes_catalogo p on p.plan = s.plan where s.id = v_sus),
    'historial', coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc) from suscripciones h where h.clinica_id = p_clinica), '[]'::jsonb),
    'uso', fn_uso_clinica(p_clinica),
    'excesos', fn_excesos_clinica(p_clinica));
end $$;

create or replace function sa_historial_planes(p_limite integer default 100)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not fn_es_super_admin() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.creado_en desc) from (
    select a.id, a.accion, a.entidad, a.entidad_id, a.clinica_id, c.nombre as clinica_nombre, a.detalle, a.creado_en,
           u.nombre as usuario_nombre
    from auditoria a left join clinicas c on c.id = a.clinica_id left join usuarios u on u.id = a.usuario_id
    where a.accion in ('crear_plan','editar_plan','activar_plan','desactivar_plan','duplicar_plan','editar_funcionalidades_plan',
                       'crear_funcionalidad','editar_funcionalidad','asignar_plan','cambiar_plan','aplicar_condiciones_plan',
                       'ajustar_condiciones_clinica','suspender_suscripcion','reactivar_suscripcion')
    order by a.creado_en desc limit greatest(1, least(coalesce(p_limite, 100), 500))) x), '[]'::jsonb);
end $$;

-- ---------- 14. Lo que ve la clínica ----------
create or replace function mi_suscripcion()
returns jsonb language plpgsql stable security definer set search_path = public as $$
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
grant execute on function mi_suscripcion() to authenticated;

-- ---------- 15. Permisos de ejecución ----------
-- Por defecto Postgres permite ejecutar a PUBLIC; se cierra explícitamente y se
-- abre solo a `authenticated`. Cada función sa_* además se autoverifica.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.proname like 'sa\_%' or p.proname in ('mi_suscripcion','fn_limite_efectivo','fn_funcionalidad_contratada',
                 'fn_clinica_tiene_funcionalidad','fn_suscripcion_vigente','fn_uso_clinica','fn_excesos_clinica','fn_auditar_plan','fn_limite_sesiones_de'))
  loop
    execute format('revoke all on function %s from public, anon', f.firma);
    if f.proname in ('fn_auditar_plan') then
      execute format('revoke all on function %s from authenticated', f.firma);
    else
      execute format('grant execute on function %s to authenticated', f.firma);
    end if;
  end loop;
end $$;

commit;
