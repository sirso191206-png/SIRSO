-- ============================================================
-- SIRO — Módulo legal, Fase 7: control de sesiones
-- Migración 057
-- ------------------------------------------------------------
-- LIMITACIÓN TÉCNICA REAL, para que quede documentada: el SDK de
-- Supabase Auth para el CLIENTE (no el admin/service_role) no expone
-- una forma de listar las sesiones activas de un usuario en otros
-- dispositivos — eso requeriría la API de administración, que solo
-- puede vivir en una Edge Function con service_role, y no se construyó
-- en esta fase. Por eso SIRO lleva su PROPIO registro (esta tabla),
-- poblado explícitamente cada vez que alguien inicia sesión.
--
-- "Cerrar todas las sesiones" SÍ es una capacidad real de Supabase
-- Auth (signOut con scope 'global' revoca todos los refresh tokens del
-- usuario) — eso funciona de verdad. "Cerrar una sesión específica en
-- otro dispositivo" NO se ofrece en la interfaz porque no se puede
-- hacer de verdad sin esa Edge Function — no se construyó un botón que
-- aparente hacer algo que no hace.
-- ============================================================

create table if not exists sesiones_usuario (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  dispositivo text,
  iniciada_en timestamptz default now(),
  ultima_actividad timestamptz default now(),
  finalizada_en timestamptz
);

create index idx_sesiones_usuario on sesiones_usuario(usuario_id, finalizada_en);

alter table sesiones_usuario enable row level security;

-- Cada quien ve y gestiona únicamente sus propias sesiones — ni
-- siquiera el owner de la clínica puede ver las de otra persona aquí
-- (esto es información de seguridad personal, no clínica).
create policy sesiones_usuario_select on sesiones_usuario
  for select using (usuario_id = auth.uid());

create policy sesiones_usuario_insert on sesiones_usuario
  for insert with check (usuario_id = auth.uid());

create policy sesiones_usuario_update on sesiones_usuario
  for update using (usuario_id = auth.uid());

grant select, insert, update on sesiones_usuario to authenticated;
