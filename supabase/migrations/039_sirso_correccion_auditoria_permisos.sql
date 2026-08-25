-- ============================================================
-- SIRO — Corrección post-auditoría: pacientes_update sin filtro de
-- asignación + limpieza defensiva de la migración 038 neutralizada
-- Migración 039
-- ------------------------------------------------------------
-- CONTEXTO: se encontraron dos migraciones "038" implementando la
-- misma funcionalidad en paralelo (038_sirso_permisos_por_asignacion.sql
-- y 038_sirso_roles_permisos_asignacion.sql). Se determinó que la
-- primera es la arquitectura correcta (nombres auth_paciente_asignado /
-- asistente_dentista_asignaciones, trigger de autoasignación para
-- pacientes nuevos, regla de "sin asignar = invisible para
-- dentista/asistente hasta que el owner asigne" — consistente con el
-- pedido). La segunda quedó neutralizada (no-op), no eliminada.
--
-- VULNERABILIDAD REAL ENCONTRADA en esta auditoría: NINGUNA de las
-- dos migraciones 038 tocó `pacientes_update` ni `expedientes_insert`
-- — ambas seguían siendo "toda la clínica, cualquier rol", desde la
-- migración 001. Esto significa que, aunque la LECTURA (pacientes_select)
-- ya estaba correctamente restringida por asignación, cualquier
-- dentista o asistente que conociera (o adivinara/recibiera) el UUID
-- de un paciente que NO es suyo podía modificar sus datos —
-- notas_generales, tutor_legal, domicilio, etc. — sin pasar nunca por
-- la restricción de lectura. Ítem 12 del pedido ("un usuario nunca
-- puede acceder a información de otra clínica aunque conozca el
-- UUID") se cumplía para OTRA clínica, pero NO para otro paciente
-- dentro de la MISMA clínica sin asignación — un hueco real que se
-- corrige aquí.
-- ============================================================

-- ---------- 1. pacientes_update — ahora respeta la asignación ----------
-- owner/recepción: sin cambio, pueden editar cualquier paciente de su
-- clínica (recepción necesita corregir teléfono/domicilio de
-- cualquiera). dentista/asistente: solo si auth_paciente_asignado()
-- — la MISMA función que ya gobierna la lectura, para que
-- lectura y escritura nunca queden desincronizadas.
drop policy if exists pacientes_update on pacientes;
create policy pacientes_update on pacientes
  for update using (
    clinica_id = auth_clinica_id()
    and (auth_rol() in ('owner', 'recepcion') or auth_paciente_asignado(id))
  );

-- ---------- 2. expedientes_insert — mismo criterio que expedientes_select/update ----------
-- Antes: cualquier rol de la clínica podía insertar un expediente para
-- cualquier paciente (aunque en la práctica se crea vía trigger al
-- registrar el paciente, no manualmente) — se tapa por consistencia.
drop policy if exists expedientes_insert on expedientes;
create policy expedientes_insert on expedientes
  for insert with check (
    auth_paciente_asignado(paciente_id)
    or auth_rol() in ('owner', 'recepcion')
  );

-- ============================================================
-- 3. Limpieza defensiva de objetos de la migración 038 neutralizada
-- ------------------------------------------------------------
-- Todo con IF EXISTS — no falla si esos objetos nunca se llegaron a
-- crear en este entorno; si SÍ se crearon en algún momento (antes de
-- neutralizar el archivo), esto los retira para que no quede rastro
-- de la arquitectura paralela.
-- ============================================================
drop policy if exists asistentes_dentistas_select on asistentes_dentistas;
drop policy if exists asistentes_dentistas_write on asistentes_dentistas;
drop trigger if exists trg_validar_asistentes_dentistas on asistentes_dentistas;
drop function if exists fn_validar_asistentes_dentistas();
drop table if exists asistentes_dentistas;

drop trigger if exists trg_solo_owner_reasigna_paciente on pacientes;
drop function if exists fn_solo_owner_reasigna_paciente();

drop view if exists v_tratamientos_seguro;

drop function if exists auth_puede_acceder_clinicamente(uuid);
