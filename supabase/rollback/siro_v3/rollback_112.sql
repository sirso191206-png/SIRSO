-- ROLLBACK de la 112 (v10). Devuelve pacientes_select EXACTAMENTE a la definición de 044 (vigente hasta la 111). Reabre H26 (la dentista no puede
-- dar de alta pacientes desde la aplicación). No toca datos. Seguro de re-ejecutar.
begin;
drop policy if exists pacientes_select on public.pacientes;
create policy pacientes_select on public.pacientes
  for select using (
    clinica_id = auth_clinica_id()
    and (auth_rol() in ('owner', 'recepcion') or auth_paciente_asignado(id))
  );
commit;
