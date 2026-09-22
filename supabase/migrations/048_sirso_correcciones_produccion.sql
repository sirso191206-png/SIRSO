-- ============================================================
-- SIRO — Correcciones post-producción: 2 bugs reales reportados
-- Migración 048
-- ------------------------------------------------------------
-- HALLAZGO 1 (reportado, confirmado con captura de pantalla real):
-- Al eliminar un usuario dentista desde Edge Function eliminar-usuario
-- (que corre con service_role, sin auth.uid()), Postgres cascadea
-- `pacientes.dentista_responsable_id := null` vía el FK `on delete set
-- null`. Esa UPDATE disparó fn_restringir_columnas_pacientes_update
-- (migración 044) — como auth_rol() es NULL en ese contexto, la
-- condición `auth_rol() in ('owner','dentista')` nunca es verdadera
-- para NULL, así que cayó a la rama restrictiva (pensada para
-- recepción/asistente) y RECHAZÓ el cambio legítimo del sistema.
-- Mensaje visto: "El rol <NULL> solo puede modificar los datos
-- administrativos permitidos...".
--
-- HALLAZGO 2 (reportado, confirmado con captura de pantalla real):
-- Al finalizar una consulta y programar una cita de seguimiento para
-- un horario cercano al actual, Postgres respondió con
-- error 23P01 (exclusion_violation) — "Ese horario ya está ocupado".
-- Causa raíz: el EXCLUDE CONSTRAINT de citas (desde la migración 001,
-- nunca modificado desde entonces) usa
--   where (estado not in ('cancelada'))
-- — es decir, bloquea traslapes contra CUALQUIER cita que no esté
-- cancelada, incluidas las que ya están 'completada' o 'no_asistio'.
-- Una cita terminada ya no ocupa el horario del dentista; no debería
-- seguir bloqueando citas nuevas en ese mismo espacio.
--
-- HALLAZGO 3 (auditoría adicional, no reportado por el usuario, pero
-- encontrado al revisar los otros triggers que dependen de
-- auth_rol() — pedido explícito de "verifica todo"):
-- fn_validar_reasignacion_paciente usa `if auth_rol() <> 'owner'` —
-- cuando auth_rol() es NULL (contexto service_role), esa comparación
-- da NULL (no true), así que el IF nunca se ejecuta y el cambio pasa
-- SIN validar que el nuevo dentista_responsable_id sea de la misma
-- clínica. Hoy no es explotable (ninguna Edge Function actual cambia
-- ese campo vía service_role), pero es un comportamiento accidental,
-- no intencional — se hace explícito para que quede seguro aunque
-- eso cambie en el futuro.
-- ============================================================

-- ---------- 1. fn_restringir_columnas_pacientes_update ----------
-- auth_rol() IS NULL significa "no hay un usuario final autenticado
-- en este contexto" — es decir, una operación de sistema (service_role
-- de una Edge Function, o un cascade de FK como este). Esas operaciones
-- ya están autorizadas por la propia Edge Function (p. ej.
-- eliminar-usuario ya verificó que quien la llamó es owner) — esta
-- restricción es para USUARIOS FINALES actuando a través de la app, no
-- para el sistema mismo.
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
  if auth_rol() in ('owner', 'dentista') or auth_rol() is null then
    return new;
  end if;

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

-- ---------- 2. fn_validar_reasignacion_paciente ----------
-- Mismo criterio: se hace explícito que auth_rol() IS NULL (contexto
-- de sistema) se trata igual que owner para efectos de esta
-- restricción — nunca se bloquea un cascade/operación de sistema, pero
-- tampoco se deja pasar SIN VALIDAR el destino si algo en el futuro sí
-- cambiara dentista_responsable_id vía service_role: se sigue
-- exigiendo que el dentista elegido sea de la misma clínica.
create or replace function fn_validar_reasignacion_paciente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.dentista_responsable_id is distinct from old.dentista_responsable_id then
    if auth_rol() is not null and auth_rol() <> 'owner' then
      raise exception 'Solo el owner de la clínica puede reasignar el odontólogo responsable de un paciente.';
    end if;
    if new.dentista_responsable_id is not null and not exists (
      select 1 from usuarios u
      where u.id = new.dentista_responsable_id
        and u.rol = 'dentista'
        and u.clinica_id = new.clinica_id
    ) then
      raise exception 'El odontólogo responsable debe ser un dentista de la misma clínica del paciente.';
    end if;
  end if;
  return new;
end;
$$;

-- ---------- 3. Traslape de citas: excluir completada/no_asistio ----------
-- No se conoce el nombre exacto del constraint original (se creó sin
-- nombre explícito en la migración 001, Postgres le asignó uno
-- automático) — se busca dinámicamente por tipo (exclusion constraint,
-- 'x') sobre la tabla citas, excluyendo explícitamente
-- chk_sillon_no_traslape (047, sí tiene nombre propio, no se toca).
do $$
declare
  v_nombre_restriccion text;
begin
  select conname into v_nombre_restriccion
  from pg_constraint
  where conrelid = 'citas'::regclass
    and contype = 'x'
    and conname <> 'chk_sillon_no_traslape'
  limit 1;

  if v_nombre_restriccion is not null then
    execute format('alter table citas drop constraint %I', v_nombre_restriccion);
  end if;
end $$;

alter table citas add constraint chk_dentista_no_traslape
  exclude using gist (
    dentista_id with =,
    tstzrange(inicio, fin) with &&
  ) where (estado not in ('cancelada', 'completada', 'no_asistio'));
