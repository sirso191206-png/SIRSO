-- ============================================================
-- SIRO — Crear sucursales requiere la funcionalidad "multisucursal"
-- Migración 079
-- ------------------------------------------------------------
-- HALLAZGO: la regla de la 075 era "la primera sucursal siempre se puede; la segunda en adelante
-- exige `multisucursal`". Resultado: un plan Esencial (o Profesional), que NO incluye
-- multisucursal, igual podía crear una sucursal. Lo correcto es que sin esa funcionalidad no se
-- creen sucursales.
--
-- NUEVA REGLA
--   * Alta de una sucursal (INSERT): sin `multisucursal` → se rechaza SIEMPRE (PT403 /
--     FEATURE_NOT_AVAILABLE), también la primera. Con ella, manda el límite del plan (PT402).
--   * Reactivar una sucursal ya existente (UPDATE activa false→true): se conserva la regla
--     anterior (sin `multisucursal` se puede reactivar la única), para no dejar sin poder
--     reactivar la suya a una clínica que ya la tenía.
--   * No se toca ninguna sucursal existente ni a las clínicas heredadas (su snapshot tiene todas las
--     funcionalidades). Solo afecta a las altas nuevas de planes sin la funcionalidad.
-- Reemplaza únicamente la función; el trigger de la 075 sigue apuntando a ella.
-- Requiere 075. Seguro de re-ejecutar.
-- ============================================================
begin;

do $$
begin
  if to_regprocedure('fn_clinica_tiene_funcionalidad(uuid,text)') is null then
    raise exception 'Aplica primero la migración 075 (planes y suscripciones).';
  end if;
end $$;

create or replace function fn_validar_limite_sucursales()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_limite integer;
  v_total integer;
begin
  if tg_op = 'UPDATE' and not (new.activa and not old.activa) then return new; end if;
  if not new.activa then return new; end if;

  perform 1 from clinicas where id = new.clinica_id for update;
  select count(*) into v_total from sucursales
   where clinica_id = new.clinica_id and activa and id is distinct from new.id;

  if not fn_clinica_tiene_funcionalidad(new.clinica_id, 'multisucursal') then
    -- Alta: nunca sin la funcionalidad. Reactivación: solo si no hay otra activa (regla anterior).
    if tg_op = 'INSERT' or v_total >= 1 then
      raise exception 'Esta funcionalidad no está disponible en tu plan.'
        using errcode = 'PT403', detail = 'FEATURE_NOT_AVAILABLE', hint = 'multisucursal';
    end if;
  end if;

  v_limite := fn_limite_efectivo(new.clinica_id, 'sucursales');
  if v_limite is not null and v_total >= v_limite then
    raise exception 'Has alcanzado el límite de sucursales de tu plan (%). Contacta al administrador para ampliarlo.', v_limite
      using errcode = 'PT402', detail = 'PLAN_LIMIT_REACHED', hint = 'sucursales';
  end if;
  return new;
end $$;

commit;
