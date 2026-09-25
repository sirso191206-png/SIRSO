-- ============================================================
-- SIRO — super_admin: control completo sobre incidentes de
-- cualquier clínica, no solo lectura
-- Migración 061
-- ------------------------------------------------------------
-- La migración 060 le dio a super_admin visibilidad de incidentes de
-- cualquier clínica, pero dejó el UPDATE restringido al owner de esa
-- clínica — decisión deliberada en ese momento ("ver no es lo mismo
-- que administrar"). Se corrige explícitamente: como
-- super-administrador de la plataforma, debe poder tomar control de
-- un incidente de cualquier clínica y resolverlo desde su propio
-- panel, sin necesidad de operar como si fuera esa clínica.
-- ============================================================

drop policy if exists incidentes_update on incidentes_seguridad;
create policy incidentes_update on incidentes_seguridad
  for update using (
    (clinica_id is not null and auth_rol() = 'owner' and clinica_id = auth_clinica_id())
    or exists (select 1 from usuarios u where u.id = auth.uid() and u.es_super_admin)
  );
