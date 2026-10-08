-- ============================================================
-- SIRO — El propietario también puede ejercer como dentista
-- Migración 084
-- ------------------------------------------------------------
-- Problema: en muchas clínicas el dueño ES odontólogo y atiende pacientes, pero el sistema solo reconocía como
-- "dentista" a quien tuviera rol = 'dentista'. El propietario no aparecía en los selectores de odontólogo y, aunque
-- apareciera, la base rechazaba asignarlo (las funciones de abajo exigían rol = 'dentista').
--
-- Solución (sin cambiar el modelo de roles): una marca por propietario, `usuarios.ejerce_como_dentista`.
--   * Solo un propietario puede tenerla en true (CHECK): un dentista, un asistente o recepción no pueden marcarse a
--     sí mismos ni a otros; y un propietario sin la marca sigue sin aparecer como dentista (el dueño que NO atiende
--     pacientes no se mezcla en las listas).
--   * La puede cambiar el propio propietario (su fila) y, como ya ocurría, un propietario sobre usuarios de SU clínica
--     (policies existentes de `usuarios`; no se abre ninguna nueva). Queda en la auditoría por el trigger existente.
--   * Las dos reglas que validaban "debe ser un dentista de la misma clínica" ahora usan UNA sola función
--     (fn_es_dentista_de_clinica): rol = 'dentista' O propietario con la marca.
-- No cambia ningún permiso de lectura: un propietario ya veía todos los pacientes de su clínica.
-- Seguro de re-ejecutar. No requiere migraciones nuevas anteriores (parte de la 038).
-- ============================================================
begin;

do $$
begin
  if to_regprocedure('fn_validar_reasignacion_paciente()') is null or to_regprocedure('fn_autoasignar_dentista_responsable()') is null then
    raise exception 'Aplica primero la migración 038 (permisos por asignación).';
  end if;
end $$;

alter table usuarios add column if not exists ejerce_como_dentista boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'usuarios'::regclass and conname = 'usuarios_ejerce_como_dentista_solo_owner') then
    alter table usuarios add constraint usuarios_ejerce_como_dentista_solo_owner
      check (ejerce_como_dentista = false or rol = 'owner');
  end if;
end $$;

-- ¿Este usuario puede ser el odontólogo responsable de un paciente de esa clínica?
create or replace function fn_es_dentista_de_clinica(p_usuario uuid, p_clinica uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from usuarios u
     where u.id = p_usuario
       and u.clinica_id = p_clinica
       and (u.rol = 'dentista' or (u.rol = 'owner' and u.ejerce_como_dentista))
  )
$$;
revoke all on function fn_es_dentista_de_clinica(uuid, uuid) from public, anon;
grant execute on function fn_es_dentista_de_clinica(uuid, uuid) to authenticated;

create or replace function fn_validar_reasignacion_paciente() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.dentista_responsable_id is distinct from old.dentista_responsable_id then
    if auth_rol() is not null and auth_rol() <> 'owner' then
      raise exception 'Solo el owner de la clínica puede reasignar el odontólogo responsable de un paciente.';
    end if;
    if new.dentista_responsable_id is not null and not fn_es_dentista_de_clinica(new.dentista_responsable_id, new.clinica_id) then
      raise exception 'El odontólogo responsable debe ser un dentista de la misma clínica del paciente.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function fn_autoasignar_dentista_responsable() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth_rol() = 'dentista' then
    -- Un dentista SIEMPRE se autoasigna a sí mismo — sin excepción, sin importar qué haya llegado en el payload.
    new.dentista_responsable_id := auth.uid();
  elsif auth_rol() = 'recepcion' then
    -- Recepción nunca decide el odontólogo responsable.
    new.dentista_responsable_id := null;
  elsif auth_rol() = 'owner' then
    -- El owner puede elegir libremente, pero el elegido debe ser un dentista de SU MISMA clínica (o un propietario que
    -- ejerce como dentista). Si no, se rechaza el INSERT completo: nunca se asigna en silencio ni se ignora el valor.
    if new.dentista_responsable_id is not null and not fn_es_dentista_de_clinica(new.dentista_responsable_id, new.clinica_id) then
      raise exception 'El odontólogo responsable debe ser un dentista de la misma clínica.';
    end if;
  end if;
  return new;
end;
$$;

-- Un asistente también puede apoyar a un propietario que ejerce como dentista. La política de escritura de las
-- asignaciones asistente → dentista exigía rol = 'dentista' en el WITH CHECK; se reemplaza por la misma función. Lo
-- demás queda IGUAL: solo el owner de la clínica escribe, el asistente debe ser un asistente de esa clínica.
drop policy if exists asignaciones_write on asistente_dentista_asignaciones;
create policy asignaciones_write on asistente_dentista_asignaciones
  for all
  using (auth_rol() = 'owner' and clinica_id = auth_clinica_id())
  with check (
    auth_rol() = 'owner'
    and clinica_id = auth_clinica_id()
    and exists (select 1 from usuarios u where u.id = asistente_dentista_asignaciones.asistente_id and u.clinica_id = auth_clinica_id() and u.rol = 'asistente')
    and fn_es_dentista_de_clinica(asistente_dentista_asignaciones.dentista_id, auth_clinica_id())
  );

commit;
