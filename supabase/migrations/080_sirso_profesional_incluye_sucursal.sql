-- ============================================================
-- SIRO — El plan Profesional incluye 1 sucursal
-- Migración 080
-- ------------------------------------------------------------
-- Con la 079, crear sucursales exige la funcionalidad `multisucursal`. Profesional tiene tope de 1
-- sucursal (`limite_sucursales` = 1) pero no incluía la funcionalidad, así que no podía crear ninguna.
-- Esta migración se la da: Profesional puede crear 1 sucursal (el tope sigue en 1). Esencial no cambia.
--
-- ALCANCE (importante):
--   * Cambia el CATÁLOGO del plan: las clínicas que contraten Profesional a partir de ahora la reciben.
--   * NO modifica las clínicas que ya tienen Profesional contratado: conservan su snapshot (diseño de
--     la 075). Para dárselas, el superadmin usa "Aplicar condiciones actuales del plan" en la clínica
--     (o la activa solo a esa clínica en "Ajustar condiciones").
--   * Las clínicas heredadas ya tienen todas las funcionalidades: no les afecta.
--   * Es un valor de catálogo, editable luego desde el panel de planes; deja rastro en auditoria.
-- Requiere 075. Seguro de re-ejecutar (no duplica auditoría si ya estaba así).
-- ============================================================
begin;

do $$
declare
  v_antes boolean;
begin
  if to_regprocedure('fn_auditar_plan(uuid,text,text,uuid,uuid,jsonb)') is null then
    raise exception 'Aplica primero la migración 075 (planes y suscripciones).';
  end if;
  if not exists (select 1 from planes_catalogo where plan = 'profesional') then
    return;   -- el catálogo ya no tiene ese plan: nada que hacer
  end if;

  select habilitada into v_antes from plan_funcionalidades where plan = 'profesional' and funcionalidad = 'multisucursal';
  insert into plan_funcionalidades (plan, funcionalidad, habilitada) values ('profesional', 'multisucursal', true)
    on conflict (plan, funcionalidad) do update set habilitada = true;

  -- Debe poder crear al menos 1 (NULL = ilimitado se respeta).
  update planes_catalogo set limite_sucursales = 1, updated_at = now()
   where plan = 'profesional' and limite_sucursales is not null and limite_sucursales < 1;

  if coalesce(v_antes, false) is distinct from true then
    update planes_catalogo set updated_at = now() where plan = 'profesional';
    perform fn_auditar_plan(null, 'editar_funcionalidades_plan', 'planes_catalogo', null, null,
      jsonb_build_object('plan', 'profesional', 'origen', 'migración 080',
                         'cambios', jsonb_build_object('multisucursal', jsonb_build_object('antes', coalesce(v_antes, false), 'despues', true))));
  end if;
end $$;

commit;
