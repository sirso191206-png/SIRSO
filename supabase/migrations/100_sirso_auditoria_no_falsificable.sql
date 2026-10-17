-- ============================================================
-- SIRO — La auditoría deja de ser falsificable por los usuarios
-- Migración 100 (fase final).
-- ------------------------------------------------------------
-- DEFECTO (hallazgo de la fase 8, reproducido bajo RLS real): la política `auditoria_insert_eventos` dejaba a CUALQUIER usuario autenticado insertar filas con su
-- propio usuario_id y su clínica pero con `accion`, `entidad_id` y `detalle` ARBITRARIOS: un usuario podía fabricar a su nombre eventos administrativos
-- (eliminar_clinica, crear_usuarios, corregir_estado_cita…), y cualquier lógica que confiara en esos registros (p. ej. un reintento de limpieza) era vulnerable.
-- Además `anon` y `authenticated` conservaban UPDATE y DELETE sobre la tabla (hoy anulados por RLS) y `anon` también INSERT/SELECT.
-- CORRECCIÓN:
--  · El cliente solo puede insertar los TRES eventos que el producto genera desde el navegador: `exportar`, `DATA_EXPORTED` y `cola_offline_descartada`, siempre a su
--    propio nombre, en su propia clínica y con un `detalle` de a lo sumo 20,000 bytes. Todo lo demás lo escriben los disparadores (SECURITY DEFINER) y las Edge Functions
--    (service_role), que no pasan por esta política.
--  · Se revocan UPDATE/DELETE/INSERT/SELECT a `anon` y UPDATE/DELETE a `authenticated`: el rastro es de solo-añadir para los usuarios (la lectura sigue regida por `auditoria_select`).
-- No toca filas existentes ni la política de lectura. Seguro de re-ejecutar. Rollback: supabase/rollback/100_rollback.sql.
-- ============================================================
begin;
drop policy if exists auditoria_insert_eventos on public.auditoria;
create policy auditoria_insert_eventos on public.auditoria for insert to authenticated
  with check (
    usuario_id = auth.uid()
    and (clinica_id is null or clinica_id = auth_clinica_id())
    and accion in ('exportar', 'DATA_EXPORTED', 'cola_offline_descartada')
    and (detalle is null or octet_length(detalle::text) <= 20000)
  );
revoke all on public.auditoria from anon;
revoke update, delete on public.auditoria from authenticated;
commit;
