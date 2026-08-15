-- ============================================================
-- SIRO — Refuerzo de seguridad: suspensión real + límite de pacientes
-- Migración 030
-- ------------------------------------------------------------
-- Contexto: hasta ahora "suspender" una clínica solo se aplicaba en
-- el FRONTEND (ProtectedRoute bloqueaba la pantalla). Un usuario con
-- su token JWT vigente podía seguir leyendo/escribiendo directo contra
-- la API de Supabase, sin pasar por la interfaz. Esta migración cierra
-- ese hueco a nivel de base de datos.
--
-- PARTE 1 — Suspensión real vía auth_clinica_id().
-- 53 policies en todo el esquema comparan alguna columna contra
-- auth_clinica_id() (ej. `clinica_id = auth_clinica_id()`). Si esta
-- función devuelve NULL cuando la clínica del usuario está
-- suspendida, TODAS esas comparaciones dejan de cumplirse
-- automáticamente (nada es igual a NULL en SQL), bloqueando lectura Y
-- escritura en cada tabla protegida por RLS, sin tocar una sola
-- policy. Es el mismo punto de apalancamiento que ya usa todo el
-- esquema para el aislamiento multi-tenant.
--
-- El super admin NO se ve afectado: sus operaciones administrativas
-- pasan siempre por Edge Functions con `service_role`, que ignora RLS
-- por completo.
--
-- PARTE 2 — Límite de pacientes real.
-- Se agrega la validación al trigger `fn_set_clinica_pacientes` (el
-- mismo que ya asigna el folio consecutivo), reutilizando el
-- `for update` que ya toma sobre la fila de `clinicas` — así no hay
-- condición de carrera entre el conteo y el folio.
-- ============================================================

-- ---------- PARTE 1: auth_clinica_id() respeta la suspensión ----------
create or replace function auth_clinica_id()
returns uuid
language sql stable
security definer
set search_path = public
as $$
  select u.clinica_id
  from usuarios u
  join clinicas c on c.id = u.clinica_id
  where u.id = auth.uid()
    and c.estado = 'activa'
$$;

-- ---------- Excepción mínima: que el bloqueo no rompa la app ----------
-- Si auth_clinica_id() ya no distingue tenant cuando la clínica está
-- suspendida, un usuario suspendido tampoco podría leer SU PROPIA fila
-- en `usuarios` ni la fila de SU PROPIA clínica (ambas policies de
-- select comparan contra auth_clinica_id()) — y el frontend se quedaría
-- en blanco en vez de mostrar "Clínica suspendida", porque ni siquiera
-- puede confirmar que está suspendida.
--
-- `auth_clinica_id_raw()` es una versión SIN el filtro de estado, usada
-- ÚNICAMENTE para permitir la autolectura mínima de abajo. No se usa en
-- ninguna otra policy, así que no reabre acceso a datos de pacientes,
-- citas, pagos, etc. de una clínica suspendida.
create or replace function auth_clinica_id_raw()
returns uuid
language sql stable
security definer
set search_path = public
as $$
  select clinica_id from usuarios where id = auth.uid()
$$;

-- El usuario siempre puede leer SU PROPIA fila (necesario para que la
-- app sepa quién es incluso si su clínica está suspendida). El resto de
-- compañeros de clínica solo se ve si la clínica sigue activa (sin
-- cambios respecto al comportamiento anterior).
drop policy if exists usuarios_select on usuarios;
create policy usuarios_select on usuarios
  for select using (id = auth.uid() or clinica_id = auth_clinica_id());

-- El usuario siempre puede leer los datos de SU PROPIA clínica
-- (nombre + estado, para mostrar el aviso de suspensión). No expone
-- clínicas ajenas: sigue acotado a auth_clinica_id_raw(), que es
-- siempre la clínica del propio usuario.
drop policy if exists clinicas_select on clinicas;
create policy clinicas_select on clinicas
  for select using (id = auth_clinica_id_raw());

-- ---------- PARTE 2: límite de pacientes en el trigger de folio ----------
create or replace function fn_set_clinica_pacientes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_folio integer;
  v_limite integer;
  v_total integer;
begin
  if new.clinica_id is null then
    new.clinica_id := auth_clinica_id();
  end if;
  if new.clinica_id is null then
    raise exception 'No es posible registrar el paciente: tu clínica está suspendida.';
  end if;
  if new.creado_por is null then
    new.creado_por := auth.uid();
  end if;

  -- Bloquea la fila de la clínica (evita condición de carrera con el
  -- folio y con el conteo de pacientes bajo inserciones concurrentes).
  select siguiente_folio_paciente, limite_pacientes
    into v_folio, v_limite
  from clinicas where id = new.clinica_id
  for update;

  if v_limite is not null then
    select count(*) into v_total from pacientes where clinica_id = new.clinica_id;
    if v_total >= v_limite then
      raise exception
        'Has alcanzado el límite de pacientes de tu plan (%). Contacta al administrador para ampliarlo.',
        v_limite;
    end if;
  end if;

  if new.numero_expediente is null then
    new.numero_expediente := 'EXP-' || lpad(v_folio::text, 4, '0');
    update clinicas set siguiente_folio_paciente = v_folio + 1 where id = new.clinica_id;
  end if;

  return new;
end;
$$;
