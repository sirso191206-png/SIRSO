-- ============================================================
-- SIRO — Auditoría de seguridad, ronda 4: signos_vitales
-- Migración 043
-- ------------------------------------------------------------
-- Barrido final sistemático (repetido contra el estado 038-042
-- completo, no solo de memoria) encontró que `signos_vitales` es la
-- ÚNICA tabla clínica de toda la lista de la Fase 5 que ninguna
-- migración anterior tocó — seguía siendo "toda la clínica" sin
-- filtro de asignación, el mismo patrón ya corregido en notas,
-- tratamientos, recetas, documentos, odontograma, periodontograma,
-- fotografías y citas.
-- ============================================================

drop policy if exists signos_vitales_select on signos_vitales;
create policy signos_vitales_select on signos_vitales
  for select using (auth_paciente_asignado(paciente_id) and auth_rol() in ('owner', 'dentista'));

drop policy if exists signos_vitales_insert on signos_vitales;
create policy signos_vitales_insert on signos_vitales
  for insert with check (auth_paciente_asignado(paciente_id) and auth_rol() in ('owner', 'dentista'));
