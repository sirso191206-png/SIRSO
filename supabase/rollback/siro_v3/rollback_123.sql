-- ROLLBACK de la 123. Quita SOLO las filas que agregó la 123 (las que se registraron en suscripcion_funcionalidades_123) y
-- devuelve sa_suscripcion_de_clinica a como estaba (solo las funcionalidades ya registradas). Re-ejecutable.
begin;

do $$ begin
  if to_regclass('public.suscripcion_funcionalidades_123') is not null then
    delete from suscripcion_funcionalidades sf
    using suscripcion_funcionalidades_123 x
    where sf.suscripcion_id = x.suscripcion_id and sf.funcionalidad = x.funcionalidad;
  end if;
end $$;
drop table if exists suscripcion_funcionalidades_123;

CREATE OR REPLACE FUNCTION public.sa_suscripcion_de_clinica(p_clinica uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$;

commit;
