-- ============================================================
-- SIRO — Cierre de las 2 decisiones pendientes de la auditoría RLS
-- Migración 044
-- ------------------------------------------------------------
-- NOTA SOBRE EL NOMBRE: se pidió explícitamente
-- "041_sirso_cierre_permisos_pacientes.sql", pero 041 ya existe
-- (041_sirso_auditoria_fotos_storage_citas.sql, de la ronda anterior)
-- — crear otra "041" habría sido exactamente la duplicación de
-- números que esta misma auditoría lleva varias rondas evitando. Se
-- usa 044, el siguiente número real disponible.
--
-- Dos decisiones cerradas:
--
-- 1) Lista blanca de UPDATE en pacientes: recepción gana `curp` y
--    `tipo_paciente` (confirmado por el usuario). Asistente NO gana
--    estos dos — se queda con la lista anterior, más angosta (el
--    pedido separa explícitamente "recepción" de "asistente no
--    obtiene permisos adicionales"). `estado_expediente` se revisó
--    primero (pedido explícito): ningún trigger ni función automática
--    lo escribe, solo se edita a mano desde TabDatosGenerales.jsx —
--    queda protegido para ambos roles, sin romper nada.
--
-- 2) pacientes_insert + reglas de creación:
--    - Solo owner/dentista/recepción pueden crear pacientes (antes:
--      cualquier rol, incluido asistente).
--    - HALLAZGO al revisar el trigger de autoasignación existente
--      (fn_autoasignar_dentista_responsable, de la 038): solo actuaba
--      "si dentista_responsable_id es NULL" — un dentista que
--      mandara EXPLÍCITAMENTE el UUID de otro dentista se colaba sin
--      que el trigger lo tocara, porque la condición "is null" era
--      falsa. Se corrige forzando el valor SIEMPRE para dentista/
--      recepción (sin importar qué haya llegado en el payload), y
--      validando que el elegido por el owner sea un dentista de la
--      MISMA clínica.
-- ============================================================

-- ---------- 1. Lista blanca ampliada — SOLO para recepción ----------
-- Importante: el pedido separa "recepción" de "asistente no obtiene
-- permisos adicionales" — así que CURP/tipo_paciente se agregan
-- ÚNICAMENTE a la lista de recepción. Asistente se queda con la lista
-- anterior, más angosta (la de la migración 040), sin cambios.
create or replace function fn_restringir_columnas_pacientes_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_columnas_base text[] := array[
    'nombre_completo', 'primer_apellido', 'segundo_apellido',
    'fecha_nacimiento', 'sexo',
    'telefono', 'telefono_secundario', 'whatsapp', 'correo',
    'direccion', 'calle', 'numero_exterior', 'numero_interior',
    'colonia', 'municipio', 'estado_domicilio', 'codigo_postal',
    'nacionalidad', 'referido_por', 'archivado_en'
  ];
  v_columnas_permitidas text[];
  v_old_reducido jsonb;
  v_new_reducido jsonb;
  v_clave text;
begin
  if auth_rol() in ('owner', 'dentista') then
    return new;
  end if;

  -- recepción: lista base + CURP/tipo_paciente (confirmado por el
  -- usuario). asistente: solo la lista base — no obtiene los
  -- permisos nuevos de recepción.
  if auth_rol() = 'recepcion' then
    v_columnas_permitidas := v_columnas_base || array['curp', 'tipo_paciente'];
  else
    v_columnas_permitidas := v_columnas_base;
  end if;

  v_old_reducido := to_jsonb(old);
  v_new_reducido := to_jsonb(new);
  foreach v_clave in array v_columnas_permitidas loop
    v_old_reducido := v_old_reducido - v_clave;
    v_new_reducido := v_new_reducido - v_clave;
  end loop;

  if v_old_reducido is distinct from v_new_reducido then
    raise exception 'El rol % solo puede modificar los datos administrativos permitidos — no información clínica ni estado_expediente.', auth_rol();
  end if;

  return new;
end;
$$;
-- No hace falta recrear el trigger — sigue apuntando a esta misma
-- función por nombre (create or replace la reemplaza en su lugar).

-- ---------- 2. pacientes_insert restringido por rol ----------
drop policy if exists pacientes_insert on pacientes;
create policy pacientes_insert on pacientes
  for insert with check (
    clinica_id = auth_clinica_id()
    and auth_rol() in ('owner', 'dentista', 'recepcion')
  );

-- ---------- 3. Reglas de creación fortalecidas ----------
create or replace function fn_autoasignar_dentista_responsable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth_rol() = 'dentista' then
    -- Un dentista SIEMPRE se autoasigna a sí mismo — sin excepción,
    -- sin importar qué haya llegado en el payload. Antes solo pasaba
    -- si dentista_responsable_id venía NULL; un dentista que mandara
    -- el UUID de otro dentista se colaba.
    new.dentista_responsable_id := auth.uid();
  elsif auth_rol() = 'recepcion' then
    -- Recepción nunca decide el odontólogo responsable — el paciente
    -- queda sin asignar hasta que el owner lo asigne, sin importar
    -- qué haya llegado en el payload.
    new.dentista_responsable_id := null;
  elsif auth_rol() = 'owner' then
    -- El owner sí puede elegir libremente, pero el elegido debe ser
    -- un dentista de SU MISMA clínica — si no, se rechaza el INSERT
    -- completo (nunca se asigna silenciosamente a nadie ni se ignora
    -- el valor mandado).
    if new.dentista_responsable_id is not null and not exists (
      select 1 from usuarios u
      where u.id = new.dentista_responsable_id
        and u.rol = 'dentista'
        and u.clinica_id = new.clinica_id
    ) then
      raise exception 'El odontólogo responsable debe ser un dentista de la misma clínica.';
    end if;
  end if;
  return new;
end;
$$;
-- Mismo trigger existente (trg_autoasignar_dentista_responsable,
-- before insert on pacientes) — no hace falta recrearlo, ya apunta a
-- esta función por nombre.
