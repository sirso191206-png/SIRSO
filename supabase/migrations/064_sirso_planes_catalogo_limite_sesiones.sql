-- ============================================================
-- SIRO — Tabla central de planes + límite de sesiones simultáneas
-- Migración 064
-- ------------------------------------------------------------
-- Resuelve una deuda técnica señalada varias veces en esta
-- conversación: no existía una fuente central de configuración de
-- planes — cada clínica tenía sus propios números sueltos
-- (clinicas.limite_usuarios/limite_pacientes). Esta migración crea esa
-- fuente central, pero SOLO para lo nuevo (sesiones simultáneas y
-- sucursales) — deliberadamente NO cambia la semántica de
-- limite_usuarios/limite_pacientes (029): ahí NULL sigue significando
-- "ilimitado" exactamente como antes, para no romper ninguna clínica
-- que ya esté usando el sistema sin límite explícito.
--
-- Para sesiones simultáneas SÍ hay una diferencia deliberada: no
-- existe comportamiento previo que preservar (esto es enteramente
-- nuevo), así que aquí NULL en el override de la clínica significa
-- "usa el límite de su plan" — nunca "ilimitado" — porque un límite
-- que por defecto no limita nada no resolvería el problema que se
-- pidió resolver.
-- ============================================================

-- ---------- 1. Catálogo central de planes ----------
create table if not exists planes_catalogo (
  plan text primary key,
  limite_sesiones_simultaneas integer not null,
  limite_sucursales integer,  -- null = ilimitado
  descripcion text
);

insert into planes_catalogo (plan, limite_sesiones_simultaneas, limite_sucursales, descripcion) values
  ('basico', 1, 1, 'Odontólogo independiente — un consultorio, una sesión a la vez por usuario.'),
  ('profesional', 3, 2, 'Consultorio pequeño — varios usuarios, hasta 2 sucursales.'),
  ('clinica', 10, null, 'Clínica — múltiples usuarios y sucursales.'),
  ('empresarial', 25, null, 'Clínicas grandes — mayor volumen de usuarios y sucursales.')
on conflict (plan) do nothing;

-- 'empresarial' no era un valor permitido en clinicas.plan hasta ahora
-- — señalado como faltante en una ronda anterior de diagnóstico.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'clinicas_plan_check') then
    alter table clinicas drop constraint clinicas_plan_check;
  end if;
  alter table clinicas add constraint clinicas_plan_check
    check (plan in ('basico', 'profesional', 'clinica', 'empresarial'));
end $$;

-- clinicas.plan ahora referencia el catálogo — asegura que nunca se
-- use un plan que no tenga fila en planes_catalogo.
alter table clinicas add constraint clinicas_plan_fkey foreign key (plan) references planes_catalogo(plan);

-- ---------- 2. Override opcional por clínica ----------
-- NULL = usa el límite de su plan (vía planes_catalogo). Solo se usa
-- si una clínica concreta necesita un número distinto al de su plan.
alter table clinicas add column if not exists limite_sesiones_override integer;

-- Mismo criterio de seguridad que 029: solo super_admin cambia esto
-- (vía service_role) — se excluye explícitamente del grant de columnas
-- editables por el owner, reconstruyendo el grant igual que antes.
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'clinicas'
    and column_name not in (
      'id', 'creado_en',
      'estado', 'plan', 'limite_usuarios', 'limite_pacientes',
      'fecha_inicio', 'fecha_vencimiento', 'limite_sesiones_override'
    );

  execute 'revoke update on clinicas from authenticated';
  if cols is not null then
    execute 'grant update (' || cols || ') on clinicas to authenticated';
  end if;
end $$;

-- ---------- 3. Resolver el límite efectivo de un usuario ----------
-- super_admin siempre queda exento (necesita poder entrar desde
-- varios lugares para administrar la plataforma).
create or replace function fn_limite_sesiones_de(p_usuario_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when u.es_super_admin then null  -- null aquí sí significa sin límite, a propósito
    else coalesce(c.limite_sesiones_override, pc.limite_sesiones_simultaneas)
  end
  from usuarios u
  left join clinicas c on c.id = u.clinica_id
  left join planes_catalogo pc on pc.plan = c.plan
  where u.id = p_usuario_id
$$;

-- ---------- 4. Aplicar el límite al registrar una sesión nueva ----------
-- Si ya se alcanzó el límite, se cierra la sesión ACTIVA más antigua
-- de ese usuario para hacer espacio — no se rechaza el nuevo inicio de
-- sesión (sería una experiencia confusa). Gracias a Realtime
-- (migración 060), el dispositivo que se queda fuera se entera en
-- segundos y cierra sesión ahí solo.
create or replace function fn_limitar_sesiones_simultaneas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limite integer;
  v_activas integer;
  v_id_mas_antigua uuid;
begin
  v_limite := fn_limite_sesiones_de(new.usuario_id);
  if v_limite is null then
    return new;  -- sin límite (super_admin)
  end if;

  select count(*) into v_activas
  from sesiones_usuario
  where usuario_id = new.usuario_id and finalizada_en is null;

  if v_activas >= v_limite then
    select id into v_id_mas_antigua
    from sesiones_usuario
    where usuario_id = new.usuario_id and finalizada_en is null
    order by iniciada_en asc
    limit 1;

    if v_id_mas_antigua is not null then
      update sesiones_usuario set finalizada_en = now() where id = v_id_mas_antigua;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_limitar_sesiones_simultaneas on sesiones_usuario;
create trigger trg_limitar_sesiones_simultaneas
before insert on sesiones_usuario
for each row execute function fn_limitar_sesiones_simultaneas();
