-- ============================================================
-- SIRO — 113 (v13): la vista de suscripción del superadmin solo devuelve funcionalidades ACTIVAS del catálogo.
-- DEFECTO (producción, 17/10/2026): «La funcionalidad "roles" no existe o está desactivada» / HTTP 400 en sa_ajustar_condiciones_clinica al
--   ajustar condiciones desde el panel de superadmin. La 082 («catálogo honesto») desactivó 'roles' y 'administracion_avanzada' y filtró
--   `f.activo` en mi_suscripcion, pero NO en sa_suscripcion_de_clinica (075): el panel (PanelSuscripcionClinica.jsx) recibía esas filas,
--   las reenviaba al guardar y sa_ajustar_condiciones_clinica rechazaba todo el ajuste.
-- CAMBIO MÍNIMO: la misma función que en la 075 con un único filtro añadido (`and f.activo`). No toca datos, RLS, permisos ni la validación de
--   sa_ajustar_condiciones_clinica (enviar una funcionalidad desactivada sigue rechazándose). Re-ejecutable.
-- Aplicada en producción el 17/10/2026 con v13/despliegue_113/aplicar_113.sh (marcador: prosrc de sa_suscripcion_de_clinica contiene f.activo).
-- Rollback: supabase/rollback/siro_v3/rollback_113.sql. Prueba: supabase/tests/suscripcion_funcionalidades_activas_test.sql.
-- ============================================================
begin;
create or replace function sa_suscripcion_de_clinica(p_clinica uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_sus uuid := fn_suscripcion_vigente(p_clinica);
begin
  if not fn_es_super_admin() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'vigente', (select to_jsonb(s) || jsonb_build_object('plan_nombre', p.nombre,
         'limites', (select to_jsonb(l) - 'suscripcion_id' from suscripcion_limites l where l.suscripcion_id = s.id),
         'funcionalidades', (select coalesce(jsonb_agg(jsonb_build_object('codigo', f.codigo, 'nombre', f.nombre, 'categoria', f.categoria,
              'aplicacion', f.aplicacion, 'nucleo', f.nucleo, 'habilitada', sf.habilitada) order by f.orden, f.codigo), '[]'::jsonb)
            from suscripcion_funcionalidades sf join funcionalidades f on f.codigo = sf.funcionalidad where sf.suscripcion_id = s.id and f.activo))
       from suscripciones s join planes_catalogo p on p.plan = s.plan where s.id = v_sus),
    'historial', coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc) from suscripciones h where h.clinica_id = p_clinica), '[]'::jsonb),
    'uso', fn_uso_clinica(p_clinica),
    'excesos', fn_excesos_clinica(p_clinica));
end $$;
commit;
