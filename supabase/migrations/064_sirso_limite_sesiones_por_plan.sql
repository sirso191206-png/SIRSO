-- ============================================================
-- SIRO — Límite de sesiones simultáneas por plan
-- Migración 064
-- ------------------------------------------------------------
-- Reutiliza TODO lo que ya existe, no se construye nada paralelo:
--   - sesiones_usuario (057) ya registra cada sesión activa.
--   - La publicación de Realtime sobre esa tabla (060) ya hace que un
--     dispositivo se entere en segundos si su fila se marca
--     finalizada — el mismo mecanismo de "cerrar todas mis sesiones"
--     sirve aquí sin cambiar nada del frontend para el cierre en sí.
--   - clinicas.plan (029) ya existe con 3 niveles.
-- Solo faltaba conectar los tres: un límite por plan, y qué pasa
-- cuando se excede.
--
-- LA REGLA: si iniciar una sesión nueva excedería el límite del plan,
-- se cierran automáticamente las sesiones MÁS ANTIGUAS del mismo
-- usuario hasta volver a quedar dentro del límite — nunca se bloquea
-- el nuevo inicio de sesión (eso confundiría más de lo que ayuda);
-- simplemente el dispositivo más viejo pierde el acceso.
--
-- Los límites (básico: 1, profesional: 3, clínica: 10) viven en UNA
-- sola función — no repartidos en el frontend ni en cada Edge
-- Function — para que cambiarlos después sea un solo lugar.
-- ============================================================

create or replace function fn_limite_sesiones_por_plan(p_plan text)
returns integer
language sql
immutable
as $$
  select case p_plan
    when 'basico' then 1
    when 'profesional' then 3
    when 'clinica' then 10
    else 1
  end
$$;

-- Callable desde el frontend — para poder mostrar "tu plan permite
-- hasta N sesiones" sin duplicar la tabla de límites ahí también.
create or replace function mi_limite_sesiones()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select fn_limite_sesiones_por_plan(c.plan)
  from usuarios u
  join clinicas c on c.id = u.clinica_id
  where u.id = auth.uid()
$$;

grant execute on function mi_limite_sesiones() to authenticated;

-- Al insertar una sesión nueva, si ya se alcanzó o se excedería el
-- límite del plan, cierra las sesiones activas más antiguas de ese
-- mismo usuario — justo las necesarias para dejar espacio a la nueva.
create or replace function fn_aplicar_limite_sesiones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_limite integer;
  v_activas integer;
begin
  select c.plan into v_plan
  from usuarios u
  join clinicas c on c.id = u.clinica_id
  where u.id = new.usuario_id;

  v_limite := fn_limite_sesiones_por_plan(v_plan);

  select count(*) into v_activas
  from sesiones_usuario
  where usuario_id = new.usuario_id and finalizada_en is null;

  if v_activas >= v_limite then
    update sesiones_usuario
    set finalizada_en = now()
    where id in (
      select id from sesiones_usuario
      where usuario_id = new.usuario_id and finalizada_en is null
      order by iniciada_en asc
      limit (v_activas - v_limite + 1)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_aplicar_limite_sesiones on sesiones_usuario;
create trigger trg_aplicar_limite_sesiones
before insert on sesiones_usuario
for each row execute function fn_aplicar_limite_sesiones();
