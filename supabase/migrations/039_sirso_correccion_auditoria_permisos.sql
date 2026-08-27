-- ============================================================
-- SIRO — Corrección post-auditoría: pacientes_update/expedientes_insert
-- sin filtro de asignación
-- Migración 039
-- ------------------------------------------------------------
-- VULNERABILIDAD REAL ENCONTRADA en esta auditoría: la migración 038
-- (038_sirso_permisos_por_asignacion.sql, ya aplicada correctamente)
-- no tocó `pacientes_update` ni `expedientes_insert` — ambas seguían
-- siendo "toda la clínica, cualquier rol", desde la migración 001.
-- Esto significa que, aunque la LECTURA (pacientes_select) ya estaba
-- correctamente restringida por asignación, cualquier dentista o
-- asistente que conociera (o adivinara/recibiera) el UUID de un
-- paciente que NO es suyo podía modificar sus datos — notas_generales,
-- tutor_legal, domicilio, etc. — sin pasar nunca por la restricción de
-- lectura. Ítem 12 del pedido ("un usuario nunca puede acceder a
-- información de otra clínica aunque conozca el UUID") se cumplía
-- para OTRA clínica, pero NO para otro paciente dentro de la MISMA
-- clínica sin asignación — un hueco real que se corrige aquí.
-- ============================================================

-- ---------- 1. pacientes_update — ahora respeta la asignación ----------
drop policy if exists pacientes_update on pacientes;
create policy pacientes_update on pacientes
  for update using (
    clinica_id = auth_clinica_id()
    and (auth_rol() in ('owner', 'recepcion') or auth_paciente_asignado(id))
  );

-- ---------- 2. expedientes_insert — mismo criterio que expedientes_select/update ----------
drop policy if exists expedientes_insert on expedientes;
create policy expedientes_insert on expedientes
  for insert with check (
    auth_paciente_asignado(paciente_id)
    or auth_rol() in ('owner', 'recepcion')
  );