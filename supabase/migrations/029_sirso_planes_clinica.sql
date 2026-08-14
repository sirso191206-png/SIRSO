-- ============================================================
-- SIRO — Permisos / plan por clínica (base para SaaS)
-- Migración 029: estado, plan y límites por clínica.
-- ------------------------------------------------------------
-- Permite al SUPER ADMIN activar/suspender una clínica y asignarle
-- un plan con límites. Es aditiva: todas las clínicas existentes
-- quedan por defecto 'activa', plan 'basico' y SIN límites (null =
-- ilimitado), así que nadie se queda fuera ni limitado al migrar.
--
-- ENDURECIMIENTO DE SEGURIDAD:
-- Hoy `authenticated` tiene UPDATE sobre TODA la tabla clinicas, por
-- lo que un owner podría cambiar el plan/estado de su propia clínica.
-- Aquí se revoca ese update total y se re-otorga SOLO sobre las
-- columnas de configuración que el owner sí debe poder editar. Las
-- columnas de entitlement (estado, plan, limites, fechas) quedan
-- fuera: únicamente el super admin las cambia vía Edge Function
-- (service_role, que ignora estos grants).
-- ============================================================

alter table clinicas add column if not exists estado text not null default 'activa';
alter table clinicas add column if not exists plan text not null default 'basico';
alter table clinicas add column if not exists limite_usuarios integer;   -- null = ilimitado
alter table clinicas add column if not exists limite_pacientes integer;  -- null = ilimitado
alter table clinicas add column if not exists fecha_inicio date;
alter table clinicas add column if not exists fecha_vencimiento date;

-- Restricciones de valores (idempotentes).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clinicas_estado_check') then
    alter table clinicas
      add constraint clinicas_estado_check check (estado in ('activa', 'suspendida'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clinicas_plan_check') then
    alter table clinicas
      add constraint clinicas_plan_check check (plan in ('basico', 'profesional', 'clinica'));
  end if;
end $$;

-- El owner solo puede actualizar columnas de configuración de su clínica,
-- NO las de plan/estado/límites. (Las columnas de folio se incluyen porque
-- las actualizan los triggers de folio consecutivo.)
revoke update on clinicas from authenticated;
grant update (
  nombre,
  tipo_establecimiento,
  clave_unidad_medica,
  direccion,
  telefono,
  correo,
  responsable_sanitario,
  siguiente_folio_paciente,
  siguiente_folio_recibo
) on clinicas to authenticated;
