-- ============================================================
-- SIRO — 112 (v10): una dentista puede dar de alta pacientes desde la aplicación (H26).
-- DEFECTO H26 (reproducido en el navegador real contra el stack local, v10): «Nuevo paciente» como dentista → 403 / 42501 «new row violates
--   row-level security policy for table "pacientes"», y el paciente NO se crea. pacientes_insert SÍ admite a la dentista y
--   trg_autoasignar_dentista_responsable la deja como responsable, pero la aplicación inserta con RETURNING (PostgREST select=*) y la fila
--   devuelta debe pasar pacientes_select, que exige auth_paciente_asignado(id). Esa función BUSCA la fila en la tabla, y dentro del propio
--   INSERT … RETURNING la fila nueva aún no es visible para esa consulta → la política falla y el alta entera se revierte. Owner y recepción
--   no se ven afectados (pasan por rol). Existe igual en producción (misma política y función desde 038/044).
-- CORRECCIÓN MÍNIMA: pacientes_select acepta, además, la MISMA regla que auth_paciente_asignado aplica a la dentista, evaluada sobre la
--   PROPIA fila (dentista_responsable_id = auth.uid()). Para filas ya existentes es la misma condición: no amplía el acceso (misma clínica,
--   mismo rol, solo sus pacientes). Asistente y owner sin cambios. No toca datos, funciones ni otras políticas.
-- Re-ejecutable. Rollback: supabase/rollback/siro_v3/rollback_112.sql. Prueba: supabase/tests/alta_paciente_dentista_test.sql.
-- ============================================================
begin;
drop policy if exists pacientes_select on public.pacientes;
create policy pacientes_select on public.pacientes
  for select using (
    clinica_id = auth_clinica_id()
    and (
      auth_rol() in ('owner', 'recepcion')
      or auth_paciente_asignado(id)
      or (auth_rol() = 'dentista' and dentista_responsable_id = auth.uid())
    )
  );
commit;
