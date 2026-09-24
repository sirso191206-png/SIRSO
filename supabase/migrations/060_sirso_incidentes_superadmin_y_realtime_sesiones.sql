-- ============================================================
-- SIRO — Correcciones reportadas: incidentes visibles para
-- super_admin en cualquier clínica, y cierre de sesión remoto real
-- Migración 060
-- ------------------------------------------------------------
-- HALLAZGO 1 (reportado, con captura de pantalla real): un
-- super_admin no veía el incidente "Acceso no autorizado" registrado
-- por el owner de Clínica Betty. Causa: incidentes_select (058) solo
-- dejaba ver a super_admin los incidentes con clinica_id NULL
-- (de plataforma) — nunca los de una clínica específica. Un
-- super_admin, por definición, necesita visibilidad de TODO el
-- platform, no solo de lo que no pertenece a ninguna clínica.
-- Se amplía SOLO el select — insert/update de un super_admin sobre el
-- incidente de una clínica ajena sigue sin permitirse: ver no es lo
-- mismo que administrar, y el owner de esa clínica sigue siendo quien
-- le da seguimiento.
--
-- HALLAZGO 2 (reportado): "Cerrar todas mis sesiones" sí revoca el
-- refresh token de verdad (confirmado en el código: signOut con scope
-- 'global') — pero el access token que otro dispositivo (el iPad) ya
-- tiene en memoria sigue siendo válido hasta que expira por su cuenta
-- (normalmente hasta 1 hora), porque revocar un refresh token no
-- invalida instantáneamente un JWT ya emitido. Se agrega
-- sesiones_usuario a Realtime para que otros dispositivos se enteren
-- en segundos, no en una hora, y cierren sesión localmente ellos
-- mismos.
-- ============================================================

-- ---------- 1. Incidentes: super_admin ve todas las clínicas ----------
drop policy if exists incidentes_select on incidentes_seguridad;
create policy incidentes_select on incidentes_seguridad
  for select using (
    (clinica_id is not null and auth_rol() = 'owner' and clinica_id = auth_clinica_id())
    or exists (select 1 from usuarios u where u.id = auth.uid() and u.es_super_admin)
  );

-- ---------- 2. Realtime en sesiones_usuario ----------
-- Permite que un dispositivo se suscriba a cambios sobre SU PROPIA
-- fila (ya protegido por la política de select existente de la
-- migración 057 — Realtime respeta RLS, no la reemplaza) y reaccione
-- de inmediato si otro dispositivo la marca como finalizada.
alter publication supabase_realtime add table sesiones_usuario;
