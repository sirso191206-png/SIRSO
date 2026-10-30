-- ============================================================
-- SIRO — 123: las clínicas que ya existían pueden recibir las funcionalidades nuevas (reserva en línea, inventario).
-- ------------------------------------------------------------
-- Hallazgo (29/10/2026): «Clínica Betty» activó su enlace de reserva y la página pública decía «no disponible». Causa:
--  * Su suscripción se creó ANTES de que existieran reserva_en_linea (117) e inventario (118): no tiene fila para ellas en
--    suscripcion_funcionalidades, así que fn_clinica_tiene_funcionalidad da false.
--  * Y el panel del superadmin (sa_suscripcion_de_clinica) solo listaba las funcionalidades que la suscripción YA tenía
--    registradas: las nuevas ni siquiera aparecían para poder activarlas.
-- Solución:
--  1. Cada suscripción vigente recibe una fila por cada funcionalidad activa que le falte, con lo que su PLAN incluye
--     (plan_funcionalidades; si el plan no la menciona, apagada). No se toca ninguna fila existente: lo que ya se ajustó a
--     mano para una clínica se conserva. Así un plan Esencial queda con la reserva APAGADA (su plan no la incluye) pero
--     visible para que el superadmin la active si lo decide.
--  2. sa_suscripcion_de_clinica lista TODAS las funcionalidades activas (las que no tienen fila, como apagadas): una
--     funcionalidad que se agregue en el futuro aparece sola en el panel.
-- Re-ejecutable. Rollback: supabase/rollback/siro_v3/rollback_123.sql (borra solo las filas que agregó esta migración).
-- ============================================================
begin;

create table if not exists suscripcion_funcionalidades_123 (
  suscripcion_id uuid not null,
  funcionalidad text not null,
  primary key (suscripcion_id, funcionalidad)
);
alter table suscripcion_funcionalidades_123 enable row level security;
revoke all on suscripcion_funcionalidades_123 from anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'suscripcion_funcionalidades_123' and policyname = 'sesion_activa_suscripcion_funcionalidades_123') then
    create policy sesion_activa_suscripcion_funcionalidades_123 on public.suscripcion_funcionalidades_123 as restrictive for all to authenticated
      using ((select fn_sesion_activa())) with check ((select fn_sesion_activa()));
  end if;
end $$;

with faltantes as (
  insert into suscripcion_funcionalidades (suscripcion_id, funcionalidad, habilitada)
  select s.id, f.codigo, coalesce(pf.habilitada, false)
  from suscripciones s
  cross join funcionalidades f
  left join plan_funcionalidades pf on pf.plan = s.plan and pf.funcionalidad = f.codigo
  where s.estado <> 'reemplazada'
    and f.activo
    and not exists (select 1 from suscripcion_funcionalidades sf where sf.suscripcion_id = s.id and sf.funcionalidad = f.codigo)
  on conflict (suscripcion_id, funcionalidad) do nothing
  returning suscripcion_id, funcionalidad
)
insert into suscripcion_funcionalidades_123 (suscripcion_id, funcionalidad)
select suscripcion_id, funcionalidad from faltantes
on conflict do nothing;

create or replace function sa_suscripcion_de_clinica(p_clinica uuid)
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $$
declare v_sus uuid := fn_suscripcion_vigente(p_clinica);
begin
  if not fn_es_super_admin() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'vigente', (select to_jsonb(s) || jsonb_build_object('plan_nombre', p.nombre,
         'limites', (select to_jsonb(l) - 'suscripcion_id' from suscripcion_limites l where l.suscripcion_id = s.id),
         -- TODAS las funcionalidades activas; sin fila en la suscripción = apagada (antes no aparecían y no se podían activar).
         'funcionalidades', (select coalesce(jsonb_agg(jsonb_build_object('codigo', f.codigo, 'nombre', f.nombre, 'categoria', f.categoria,
              'aplicacion', f.aplicacion, 'nucleo', f.nucleo, 'habilitada', coalesce(sf.habilitada, false)) order by f.orden, f.codigo), '[]'::jsonb)
            from funcionalidades f
            left join suscripcion_funcionalidades sf on sf.suscripcion_id = s.id and sf.funcionalidad = f.codigo
            where f.activo))
       from suscripciones s join planes_catalogo p on p.plan = s.plan where s.id = v_sus),
    'historial', coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc) from suscripciones h where h.clinica_id = p_clinica), '[]'::jsonb),
    'uso', fn_uso_clinica(p_clinica),
    'excesos', fn_excesos_clinica(p_clinica));
end $$;

commit;
