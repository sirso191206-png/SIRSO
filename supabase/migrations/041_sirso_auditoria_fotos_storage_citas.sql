-- ============================================================
-- SIRO — Auditoría de seguridad, ronda 3: fotografías, storage, citas
-- Migración 041
-- ------------------------------------------------------------
-- Tres hallazgos reales, verificados leyendo el SQL existente:
--
-- 1) FOTOGRAFÍAS (tabla): nunca se tocó en las rondas anteriores.
--    Seguía siendo "toda la clínica" sin filtro de asignación — un
--    odontólogo podía ver fotos clínicas de pacientes que no son
--    suyos.
--
-- 2) STORAGE.OBJECTS — el hallazgo más grave de esta ronda. Las
--    políticas de storage de fotos-clinicas y documentos-clinicos
--    (desde la migración 001/006) son:
--        bucket_id = 'fotos-clinicas' and auth.role() = 'authenticated'
--    Es decir: CUALQUIER usuario logueado de CUALQUIER clínica podía
--    descargar el archivo de CUALQUIER OTRA clínica, con solo conocer
--    (o adivinar) el path — no había ninguna verificación de clínica
--    NI de paciente asignado a nivel de archivo. La tabla `fotografias`/
--    `documentos_clinicos` sí filtraba correctamente los REGISTROS,
--    pero el archivo binario en sí estaba expuesto sin protección
--    real. Se corrige aprovechando que el path de subida ya es
--    `{paciente_id}/{uuid}.ext` (confirmado en fotografias.js y
--    documentosClinicos.js) — no hace falta cambiar la convención de
--    subida, solo la política.
--
-- 3) CITAS: dependía de `citas.dentista_id = auth.uid()` directo —
--    si una cita tenía dentista_id de un odontólogo, ese odontólogo
--    la veía/actualizaba SIN importar si el paciente de esa cita
--    realmente está asignado a él. Se corrige usando
--    auth_paciente_asignado(paciente_id), el mismo criterio que ya
--    rige el resto de la arquitectura clínica.
-- ============================================================

-- ---------- 1. Fotografías ----------
drop policy if exists fotos_select on fotografias;
create policy fotos_select on fotografias
  for select using (auth_paciente_asignado(paciente_id) and auth_rol() in ('owner', 'dentista', 'asistente'));

drop policy if exists fotos_insert on fotografias;
create policy fotos_insert on fotografias
  for insert with check (auth_paciente_asignado(paciente_id) and auth_rol() in ('owner', 'dentista', 'asistente'));

-- ---------- 2. storage.objects — ambos buckets clínicos ----------
-- fotos-clinicas: mismos roles que la tabla fotografias (owner/
-- dentista/asistente, todos ya restringidos por auth_paciente_asignado
-- vía el segmento paciente_id del path).
drop policy if exists storage_fotos_select on storage.objects;
create policy storage_fotos_select on storage.objects
  for select using (
    bucket_id = 'fotos-clinicas'
    and auth_paciente_asignado((storage.foldername(name))[1]::uuid)
  );

drop policy if exists storage_fotos_insert on storage.objects;
create policy storage_fotos_insert on storage.objects
  for insert with check (
    bucket_id = 'fotos-clinicas'
    and auth_paciente_asignado((storage.foldername(name))[1]::uuid)
  );

-- documentos-clinicos: mismos roles que documentos_clinicos_select/
-- insert (solo owner/dentista — asistente NUNCA, a diferencia de fotos).
drop policy if exists storage_documentos_select on storage.objects;
create policy storage_documentos_select on storage.objects
  for select using (
    bucket_id = 'documentos-clinicos'
    and auth_paciente_asignado((storage.foldername(name))[1]::uuid)
    and auth_rol() in ('owner', 'dentista')
  );

drop policy if exists storage_documentos_insert on storage.objects;
create policy storage_documentos_insert on storage.objects
  for insert with check (
    bucket_id = 'documentos-clinicos'
    and auth_paciente_asignado((storage.foldername(name))[1]::uuid)
    and auth_rol() in ('owner', 'dentista')
  );

-- ---------- 3. Citas ----------
-- citas_select: se reemplaza el chequeo directo de dentista_id por
-- auth_paciente_asignado(paciente_id) — la misma función que ya
-- gobierna el resto de la arquitectura. owner/recepción conservan
-- acceso administrativo completo (agenda de toda la clínica).
drop policy if exists citas_select on citas;
create policy citas_select on citas
  for select using (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
    and (auth_rol() in ('owner', 'recepcion') or auth_paciente_asignado(paciente_id))
  );

-- citas_update_dentista: mismo criterio — un dentista solo puede
-- actualizar (confirmar/iniciar/completar) una cita si el paciente de
-- esa cita realmente está asignado a él, no solo porque la cita tenga
-- su dentista_id.
drop policy if exists citas_update_dentista on citas;
create policy citas_update_dentista on citas
  for update using (
    auth_rol() = 'dentista'
    and auth_paciente_asignado(paciente_id)
  );

-- citas_write (owner/recepción, sin cambio) sigue administrando la
-- agenda completa de la clínica — correcto, no se toca.
