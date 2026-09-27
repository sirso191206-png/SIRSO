-- ============================================================
-- SIRO — Agregación en SQL para "tratamientos más realizados"
-- Migración 066
-- ------------------------------------------------------------
-- Hallazgo real: obtenerTratamientosMasRealizados() (dashboard.js)
-- traía TODA la tabla tratamientos (solo la columna descripcion, pero
-- cada fila) al navegador, solo para contar en JavaScript cuál se
-- repite más y quedarse con el top 5. Con pocos tratamientos esto no
-- se nota; con años de historial, es traer miles de filas al
-- navegador para calcular algo que la base de datos puede resolver
-- directo con GROUP BY, sin mover los datos de su lugar.
--
-- No se puede arreglar con un simple `.limit()` del lado del cliente:
-- cortar las filas ANTES de contar daría un top 5 incorrecto (no es
-- lo mismo "las primeras 5 filas que llegaron" que "las 5 descripciones
-- que más se repiten"). Por eso el conteo se mueve a SQL.
--
-- security invoker (no definer): así la función hereda exactamente el
-- mismo filtro de RLS que ya aplicaba la consulta anterior
-- (tratamientos_select usa auth_paciente_asignado(paciente_id) — un
-- dentista ve el conteo de sus propios pacientes asignados, un owner
-- ve el de toda la clínica) sin tener que reimplementar esa lógica
-- aquí ni arriesgarse a que se desincronice de la política real.
-- ============================================================

create or replace function fn_tratamientos_mas_realizados(p_limite integer default 5)
returns table(descripcion text, cantidad bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select descripcion, count(*) as cantidad
  from tratamientos
  group by descripcion
  order by cantidad desc
  limit p_limite
$$;

grant execute on function fn_tratamientos_mas_realizados(integer) to authenticated;
