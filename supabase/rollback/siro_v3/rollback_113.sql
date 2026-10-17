-- ROLLBACK de la 113 (v13): devuelve sa_suscripcion_de_clinica EXACTAMENTE a la definición de la 075 (sin el filtro f.activo). Reabre el fallo del panel
-- de suscripción (400 «roles … desactivada»). No toca datos. Re-ejecutable.
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
            from suscripcion_funcionalidades sf join funcionalidades f on f.codigo = sf.funcionalidad where sf.suscripcion_id = s.id))
       from suscripciones s join planes_catalogo p on p.plan = s.plan where s.id = v_sus),
    'historial', coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc) from suscripciones h where h.clinica_id = p_clinica), '[]'::jsonb),
    'uso', fn_uso_clinica(p_clinica),
    'excesos', fn_excesos_clinica(p_clinica));
end $$;
commit;
