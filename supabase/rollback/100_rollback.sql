-- ROLLBACK de la migración 100: restituye la política de inserción anterior (cualquier acción, a nombre propio y de la propia clínica) y los privilegios por defecto sobre auditoria.
-- Atención: esto REABRE la posibilidad de que un usuario fabrique eventos a su nombre. Seguro de re-ejecutar.
begin;
drop policy if exists auditoria_insert_eventos on public.auditoria;
create policy auditoria_insert_eventos on public.auditoria for insert to authenticated
  with check (usuario_id = auth.uid() and (clinica_id is null or clinica_id = auth_clinica_id()));
grant insert, select, update, delete on public.auditoria to anon;
grant update, delete on public.auditoria to authenticated;
commit;
