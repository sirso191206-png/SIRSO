-- ============================================================
-- SIRO — Captura como migración real un fix que solo vivía en
-- producción, aplicado directo por el editor SQL de Supabase
-- Migración 067
-- ------------------------------------------------------------
-- HALLAZGO: la política `sucursales_select` original (047) tenía
-- recursión infinita (42P17) — el bug se corrigió hace muchas rondas
-- directamente en el editor SQL de Supabase, nunca como una migración
-- nueva. El archivo 047 en este repositorio se quedó con la versión
-- CON el bug.
--
-- Esto es justo el tipo de brecha de infraestructura que hay que
-- cerrar antes de crecer: si alguien reconstruyera la base de datos
-- desde cero corriendo `supabase db push` con solo estos archivos
-- (un ambiente nuevo, una réplica, un entorno de pruebas), volvería a
-- traer la recursión infinita — porque el fix real nunca quedó
-- documentado como parte de la historia de migraciones, solo como un
-- cambio manual en un ambiente específico.
--
-- Esta migración es la CAPTURA exacta de ese fix ya aplicado en vivo,
-- para que las migraciones y la realidad vuelvan a coincidir.
-- ============================================================

create or replace function auth_sucursal_permitida(p_sucursal_id uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select p_sucursal_id is null or exists (
    select 1 from sucursales s where s.id = p_sucursal_id
      and s.clinica_id = auth_clinica_id()
      and (auth_rol() = 'owner' or exists (
        select 1 from sucursal_usuarios su
        where su.usuario_id = auth.uid() and su.sucursal_id = p_sucursal_id and su.activo
      ))
  )
$$;

drop policy if exists sucursales_select on sucursales;
create policy sucursales_select on sucursales for select using (auth_sucursal_permitida(id));

drop policy if exists sucursal_usuarios_select on sucursal_usuarios;
create policy sucursal_usuarios_select on sucursal_usuarios for select using (
  usuario_id = auth.uid() or auth_sucursal_permitida(sucursal_id)
);
