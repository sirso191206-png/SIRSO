-- ============================================================
-- SIRO — Una clínica NUNCA existe sin suscripción
-- Migración 076
-- ------------------------------------------------------------
-- HALLAZGO (auditoría): crear-usuario permitía que un OWNER creara otro owner con una
-- clínica nueva (INSERT en `clinicas` con la service_role): nacía SIN suscripción, sin
-- límites ni restricciones de funcionalidad. Y la alta "oficial" (admin-crear-clinica) hacía
-- DOS peticiones (crear clínica, luego asignar plan): entre ambas existía sin suscripción.
--
-- La función ya se corrigió, pero una regla así no puede depender de que cada Edge Function
-- se porte bien. Esta migración la pone en la base de datos:
--   1. fn_crear_clinica_con_plan(): crea la clínica y su suscripción en UNA transacción.
--      Solo service_role (la usa admin-crear-clinica).
--   2. Trigger de restricción DIFERIDO: al terminar la transacción, toda clínica insertada
--      (o que pase a 'activa') debe tener suscripción vigente; si no, la transacción falla.
--
-- No toca clínicas existentes. Las que ya no tengan suscripción (creadas entre la 075 y esta
-- migración) se regularizan con una acción EXPLÍCITA del superadmin (sa_asignar_plan_clinica);
-- hasta entonces funcionan igual, pero no se pueden REACTIVAR si se suspenden.
-- Requiere la 075. Seguro de re-ejecutar.
-- ============================================================
begin;

do $$
begin
  if to_regprocedure('fn_asignar_plan_interno(uuid,uuid,text,text,numeric,date,date,boolean)') is null then
    raise exception 'Aplica primero la migración 075 (planes y suscripciones).';
  end if;
end $$;

create or replace function fn_crear_clinica_con_plan(
  p_actor uuid, p_nombre text, p_plan text, p_modalidad text,
  p_precio numeric default null, p_fecha_fin date default null, p_auto_renovacion boolean default true
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_suscripcion jsonb;
begin
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'Falta el nombre de la clínica.';
  end if;
  insert into clinicas (nombre) values (trim(p_nombre)) returning id into v_id;
  v_suscripcion := fn_asignar_plan_interno(p_actor, v_id, p_plan, p_modalidad, p_precio, null, p_fecha_fin, p_auto_renovacion);
  return jsonb_build_object('clinica_id', v_id, 'suscripcion', v_suscripcion);
end $$;

revoke all on function fn_crear_clinica_con_plan(uuid, text, text, text, numeric, date, boolean) from public, anon, authenticated;
grant execute on function fn_crear_clinica_con_plan(uuid, text, text, text, numeric, date, boolean) to service_role;

create or replace function fn_exigir_suscripcion_clinica()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.estado is distinct from 'activa' then return null; end if;
  if not exists (select 1 from clinicas where id = new.id) then return null; end if;
  if not exists (select 1 from suscripciones where clinica_id = new.id and estado <> 'reemplazada') then
    raise exception 'Una clínica no puede existir sin suscripción: dala de alta con fn_crear_clinica_con_plan (solo superadmin).'
      using errcode = 'P0001', detail = 'CLINICA_REQUIERE_SUSCRIPCION', hint = new.id::text;
  end if;
  return null;
end $$;

drop trigger if exists trg_clinica_requiere_suscripcion on clinicas;
create constraint trigger trg_clinica_requiere_suscripcion
  after insert or update of estado on clinicas
  deferrable initially deferred
  for each row execute function fn_exigir_suscripcion_clinica();

commit;
