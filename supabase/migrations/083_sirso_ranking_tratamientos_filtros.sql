-- ============================================================
-- SIRO — Ranking de tratamientos con período, estado y odontólogo
-- Migración 083
-- ------------------------------------------------------------
-- `fn_tratamientos_mas_realizados(p_limite)` contaba TODOS los tratamientos de la clínica sin poder acotar por
-- fecha, estado ni odontólogo, y el dashboard necesita "este mes / este trimestre / este año". Se reemplaza por una
-- versión con parámetros opcionales (NULL = sin filtro):
--     p_desde, p_hasta (el rango es [desde, hasta) sobre creado_en), p_estado, p_dentista.
-- La firma vieja se ELIMINA (si no, PostgREST vería dos funciones candidatas y llamarla solo con p_limite fallaría
-- por ambigüedad).
-- Sigue siendo SECURITY INVOKER (no DEFINER): la cuenta cada quien sobre lo que RLS le deja ver, así el aislamiento
-- entre clínicas lo da la base y no este código. El límite se acota a 1–50.
-- Seguro de re-ejecutar.
-- ============================================================
begin;

drop function if exists fn_tratamientos_mas_realizados(integer);

create or replace function fn_tratamientos_mas_realizados(
  p_limite integer default 5,
  p_desde timestamptz default null,
  p_hasta timestamptz default null,
  p_estado text default null,
  p_dentista uuid default null
) returns table (descripcion text, cantidad bigint)
language sql stable set search_path = public as $$
  select t.descripcion, count(*) as cantidad
    from tratamientos t
   where (p_desde is null or t.creado_en >= p_desde)
     and (p_hasta is null or t.creado_en < p_hasta)
     and (p_estado is null or t.estado = p_estado)
     and (p_dentista is null or t.dentista_id = p_dentista)
   group by t.descripcion
   order by count(*) desc, t.descripcion
   limit least(greatest(coalesce(p_limite, 5), 1), 50)
$$;

revoke all on function fn_tratamientos_mas_realizados(integer, timestamptz, timestamptz, text, uuid) from public, anon;
grant execute on function fn_tratamientos_mas_realizados(integer, timestamptz, timestamptz, text, uuid) to authenticated;

commit;
