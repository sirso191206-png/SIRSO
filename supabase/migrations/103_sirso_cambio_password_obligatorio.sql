-- ============================================================
-- SIRO — Cambio OBLIGATORIO de la contraseña temporal (validado en el servidor)
-- Migración 103. NUEVA (no modifica ninguna migración anterior); segura para instalaciones existentes.
-- ------------------------------------------------------------
-- PROBLEMA: crear-usuario y admin-crear-clinica crean cuentas con una contraseña temporal y nada obligaba a cambiarla; la guardia de rutas del frontend es solo de interfaz.
-- DISEÑO: un indicador PERSISTENTE `usuarios.debe_cambiar_password` (por omisión false: ningún usuario existente queda bloqueado) que SOLO el servidor puede escribir.
--  · Mientras sea true, `auth_clinica_id()`, `auth_clinica_id_raw()`, `auth_rol()` y `fn_es_super_admin()` devuelven «nadie» (NULL/false). Como TODAS las políticas de tenant, las de
--    Storage y las funciones del servidor (finalizar consulta, corregir citas, eliminar clínicas…) pasan por esos ayudantes, el bloqueo se aplica EN LA BASE DE DATOS a cualquier
--    llamada directa a la API, no solo a la interfaz. Se sigue pudiendo leer la propia fila de `usuarios` (política por `id = auth.uid()`) y gestionar la propia sesión.
--  · Un disparador impide que un usuario con sesión toque el indicador (ni ponerlo ni quitarlo), y que un usuario con el cambio pendiente modifique su perfil.
--    Solo `service_role` (Edge Functions) lo escribe: crear-usuario y admin-crear-clinica lo ponen en true; cambiar-password lo quita DESPUÉS de cambiar la contraseña.
-- LÍMITES (ver docs/CAMBIO_PASSWORD_OBLIGATORIO.md): no se puede impedir que la cuenta cambie su contraseña directamente en Supabase Auth con su propio token (no hay forma de
-- hacerlo sin un hook de Auth); eso NO levanta el bloqueo, porque el indicador solo lo quita la Edge Function. Las Edge Functions deben comprobar el indicador (lo hacen).
-- Seguro de re-ejecutar. Rollback: supabase/rollback/103_rollback.sql.
-- ============================================================
begin;

alter table public.usuarios add column if not exists debe_cambiar_password boolean not null default false;

create or replace function public.auth_clinica_id() returns uuid
language sql stable security definer set search_path = public as $$
  select u.clinica_id from usuarios u join clinicas c on c.id = u.clinica_id where u.id = auth.uid() and c.estado = 'activa' and not u.debe_cambiar_password
$$;
create or replace function public.auth_clinica_id_raw() returns uuid
language sql stable security definer set search_path = public as $$
  select clinica_id from usuarios where id = auth.uid() and not debe_cambiar_password
$$;
create or replace function public.auth_rol() returns text
language sql stable security definer set search_path = public as $$
  select rol from usuarios where id = auth.uid() and not debe_cambiar_password
$$;
create or replace function public.fn_es_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select es_super_admin from usuarios where id = auth.uid() and not debe_cambiar_password), false)
$$;

create or replace function fn_proteger_debe_cambiar_password() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pendiente boolean;
begin
  if auth.uid() is null then return new; end if;   -- service_role / mantenimiento (Edge Functions): única vía para escribir el indicador
  if tg_op = 'INSERT' then
    if new.debe_cambiar_password then
      raise exception 'El indicador de cambio de contraseña solo lo gestiona el servidor.' using errcode = 'P0001', hint = 'CAMBIO_PASSWORD_INDICADOR_PROTEGIDO';
    end if;
    return new;
  end if;
  if new.debe_cambiar_password is distinct from old.debe_cambiar_password then
    raise exception 'El indicador de cambio de contraseña solo lo gestiona el servidor.' using errcode = 'P0001', hint = 'CAMBIO_PASSWORD_INDICADOR_PROTEGIDO';
  end if;
  select u.debe_cambiar_password into v_pendiente from usuarios u where u.id = auth.uid();
  if coalesce(v_pendiente, false) and (to_jsonb(new) - 'ultimo_acceso') is distinct from (to_jsonb(old) - 'ultimo_acceso') then
    raise exception 'Debes cambiar tu contraseña temporal antes de continuar.' using errcode = 'P0001', hint = 'CAMBIO_PASSWORD_PENDIENTE';
  end if;
  return new;
end;
$$;
revoke all on function fn_proteger_debe_cambiar_password() from public, anon, authenticated;
drop trigger if exists trg_proteger_debe_cambiar_password on public.usuarios;
create trigger trg_proteger_debe_cambiar_password before insert or update on public.usuarios for each row execute function fn_proteger_debe_cambiar_password();

commit;
