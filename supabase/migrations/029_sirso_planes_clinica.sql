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
-- columnas de configuración que existan realmente, EXCLUYENDO las de
-- entitlement (estado, plan, limites, fechas). Únicamente el super
-- admin las cambia vía Edge Function (service_role, que ignora grants).
--
-- El grant se arma dinámicamente a partir del esquema en vivo para no
-- depender de columnas que quizá no existan en esta base (p. ej. si la
-- migración 021 no se aplicó). Es idempotente y seguro de re-ejecutar.
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

-- Re-otorga UPDATE al owner solo sobre columnas de configuración EXISTENTES,
-- nunca sobre las de plan/estado/límites. Se construye desde el esquema real.
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'clinicas'
    and column_name not in (
      'id', 'creado_en',
      'estado', 'plan', 'limite_usuarios', 'limite_pacientes',
      'fecha_inicio', 'fecha_vencimiento'
    );

  execute 'revoke update on clinicas from authenticated';
  if cols is not null then
    execute 'grant update (' || cols || ') on clinicas to authenticated';
  end if;
end $$;
