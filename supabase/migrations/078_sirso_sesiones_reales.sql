-- ============================================================
-- SIRO — Sesiones por dispositivo: control REAL, del lado del servidor
-- Migración 078
-- ------------------------------------------------------------
-- PROBLEMA. Hasta hoy "sesión" era una fila de `sesiones_usuario` que escribe el propio
-- navegador, sin relación con la sesión real de Supabase Auth. Por eso:
--   * no se podía cerrar UNA sesión de otro dispositivo (solo "cerrar todas");
--   * el límite del plan solo marcaba una fila: el dispositivo "cerrado" seguía trabajando si
--     estaba sin conexión cuando se avisó por Realtime, o si el cliente estaba alterado,
--     porque conservaba su sesión y su refresh token de Auth.
--
-- SOLUCIÓN. Se usa `auth.sessions` (la tabla donde Supabase Auth guarda cada sesión real) como
-- fuente de verdad. Todo access token trae el claim `session_id`.
--   * mis_sesiones_activas(): lista las sesiones reales del usuario (dispositivo, fechas).
--   * cerrar_sesion_remota(id): borra ESA sesión de auth.sessions → su refresh token deja de
--     servir y ya no puede renovarse. Solo sesiones propias.
--   * Límite del plan: solo cuentan como válidas las N sesiones MÁS RECIENTES del usuario (N =
--     límite efectivo de la suscripción; NULL = ilimitado). La más antigua queda inválida sola.
--     No hace falta ningún trigger sobre el esquema auth.
--   * Corte inmediato: una política RESTRICTIVA en cada tabla con RLS exige sesión válida, así
--     un token ya emitido de una sesión cerrada deja de leer y escribir de inmediato (sin
--     esperar a que caduque, normalmente 1 h).
--   * mi_sesion_estado(): el cliente la consulta para enterarse y cerrar sesión local.
--
-- INTERRUPTOR. El corte en RLS viene APAGADO (plataforma_config.control_sesiones_estricto =
-- 'off'). Con él apagado, listar y cerrar sesiones funciona y los dispositivos se enteran por
-- mi_sesion_estado(), pero la base de datos no corta nada. Se enciende solo después de
-- verificar en staging (ver GUIA_SESIONES.md):
--     update plataforma_config set valor = 'on' where clave = 'control_sesiones_estricto';
-- y se apaga igual con 'off'. Si algo no se puede verificar (p. ej. permisos sobre auth), las
-- funciones fallan ABIERTAS: nunca dejan a todos afuera por un problema de infraestructura.
--
-- LÍMITES CONOCIDOS: Storage (esquema storage, administrado por Supabase) no pasa por estas
-- políticas; un token revocado podría seguir usándolo hasta que caduque. Una tabla nueva con RLS
-- necesita su política (ver fn_proteger_tablas_con_sesion, que se puede volver a ejecutar).
-- Requiere 075 (fn_limite_sesiones_de). Seguro de re-ejecutar.
-- ============================================================
begin;

do $$
begin
  if to_regprocedure('fn_limite_sesiones_de(uuid)') is null then
    raise exception 'Aplica primero la migración 075 (planes y suscripciones).';
  end if;
end $$;

-- ---------- 1. Interruptor ----------
create table if not exists plataforma_config (
  clave text primary key,
  valor text not null,
  actualizado_en timestamptz not null default now()
);
alter table plataforma_config enable row level security;   -- sin políticas: nadie por la API
revoke all on plataforma_config from anon, authenticated;
insert into plataforma_config (clave, valor) values ('control_sesiones_estricto', 'off')
  on conflict (clave) do nothing;

-- ---------- 2. Estado de una sesión (núcleo; ignora el interruptor) ----------
create or replace function fn_estado_sesion(p_uid uuid, p_sesion uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_limite integer;
  v_activas integer;
  v_posicion integer;
begin
  -- Sin usuario o sin session_id (service_role, tokens antiguos): no es identificable → válida.
  if p_uid is null or p_sesion is null then
    return jsonb_build_object('valida', true, 'motivo', 'no_identificable');
  end if;
  if not exists (select 1 from auth.sessions s where s.id = p_sesion and s.user_id = p_uid) then
    return jsonb_build_object('valida', false, 'motivo', 'revocada');
  end if;
  v_limite := fn_limite_sesiones_de(p_uid);
  select count(*) into v_activas from auth.sessions where user_id = p_uid;
  if v_limite is not null then
    select t.pos into v_posicion
      from (select id, row_number() over (order by created_at desc, id desc) as pos
              from auth.sessions where user_id = p_uid) t
     where t.id = p_sesion;
    if v_posicion > v_limite then
      return jsonb_build_object('valida', false, 'motivo', 'excedida', 'limite', v_limite, 'activas', v_activas);
    end if;
  end if;
  return jsonb_build_object('valida', true, 'motivo', 'activa', 'limite', v_limite, 'activas', v_activas);
exception when others then
  -- Falla ABIERTA: un problema de permisos/estructura sobre auth nunca debe dejar a todos afuera.
  return jsonb_build_object('valida', true, 'motivo', 'no_verificable');
end $$;
revoke all on function fn_estado_sesion(uuid, uuid) from public, anon, authenticated;

create or replace function fn_sesion_jwt() returns uuid
language sql stable as $$ select nullif(auth.jwt() ->> 'session_id', '')::uuid $$;
grant execute on function fn_sesion_jwt() to authenticated;

-- ---------- 3. Lo que usan las políticas (respeta el interruptor) ----------
create or replace function fn_sesion_activa() returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when coalesce((select valor from plataforma_config where clave = 'control_sesiones_estricto'), 'off') <> 'on' then true
    else coalesce((fn_estado_sesion(auth.uid(), fn_sesion_jwt()) ->> 'valida')::boolean, true)
  end
$$;
grant execute on function fn_sesion_activa() to authenticated;

-- ---------- 4. Lo que usa el cliente ----------
create or replace function mi_sesion_estado() returns jsonb
language sql stable security definer set search_path = public as $$
  select fn_estado_sesion(auth.uid(), fn_sesion_jwt()) || jsonb_build_object(
    'estricto', coalesce((select valor from plataforma_config where clave = 'control_sesiones_estricto'), 'off') = 'on')
$$;
grant execute on function mi_sesion_estado() to authenticated;

create or replace function mis_sesiones_activas()
returns table (id uuid, creada_en timestamptz, ultima_actividad timestamptz, user_agent text, es_actual boolean, vigente boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_limite integer := fn_limite_sesiones_de(auth.uid());
begin
  if auth.uid() is null then return; end if;
  return query
    select t.id, t.created_at, t.updated_at, t.user_agent::text,
           (t.id = fn_sesion_jwt()),
           (v_limite is null or t.pos <= v_limite)
      from (select s.id, s.created_at, s.updated_at, s.user_agent,
                   row_number() over (order by s.created_at desc, s.id desc) as pos
              from auth.sessions s where s.user_id = auth.uid()) t
     order by t.created_at desc;
end $$;
grant execute on function mis_sesiones_activas() to authenticated;

create or replace function cerrar_sesion_remota(p_sesion_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_borradas integer;
begin
  if v_uid is null then raise exception 'No autorizado.' using errcode = '42501'; end if;
  if p_sesion_id is null then raise exception 'Falta la sesión.'; end if;
  if p_sesion_id = fn_sesion_jwt() then
    raise exception 'Esa es la sesión de este dispositivo: usa "Cerrar sesión".' using errcode = 'P0001';
  end if;
  -- Solo sesiones PROPIAS: el filtro por user_id es lo que lo garantiza.
  delete from auth.sessions where id = p_sesion_id and user_id = v_uid;
  get diagnostics v_borradas = row_count;
  if v_borradas = 0 then raise exception 'No se encontró esa sesión.' using errcode = 'P0001'; end if;
  insert into auditoria (usuario_id, accion, entidad, entidad_id, clinica_id, detalle)
    select v_uid, 'cerrar_sesion_remota', 'sesiones', p_sesion_id, u.clinica_id, '{}'::jsonb
      from usuarios u where u.id = v_uid;
end $$;
grant execute on function cerrar_sesion_remota(uuid) to authenticated;

-- ---------- 5. Corte inmediato: política RESTRICTIVA en cada tabla con RLS ----------
-- Se SUMA (AND) a las existentes: no afloja ninguna. `(select …)` se evalúa una vez por consulta.
create or replace function fn_proteger_tablas_con_sesion() returns integer
language plpgsql security definer set search_path = public as $$
declare t record; n integer := 0; v_expr text;
begin
  for t in
    select c.relname from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity and c.relname <> 'plataforma_config'
  loop
    -- `(select …)` hace que se evalúe UNA vez por consulta y no por fila. En `usuarios` esa forma
    -- provoca "infinite recursion detected in policy" al hacer UPDATE (medido sobre el esquema
    -- real: es la única de las 41 tablas con ese problema); ahí se llama directo — la tabla es
    -- pequeña, así que evaluarla por fila no cuesta nada.
    v_expr := case when t.relname = 'usuarios' then 'fn_sesion_activa()' else '(select fn_sesion_activa())' end;
    execute format('drop policy if exists %I on public.%I', 'sesion_activa_' || t.relname, t.relname);
    execute format('create policy %I on public.%I as restrictive for all to authenticated using (%s) with check (%s)',
                   'sesion_activa_' || t.relname, t.relname, v_expr, v_expr);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function fn_proteger_tablas_con_sesion() from public, anon, authenticated;

select fn_proteger_tablas_con_sesion();

commit;
