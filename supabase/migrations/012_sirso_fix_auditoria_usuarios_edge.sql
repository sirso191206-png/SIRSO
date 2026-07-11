-- ============================================================
-- SIRSO — Fix: auditoría correcta para usuarios creados/eliminados
-- vía Edge Function (service_role, sin sesión de usuario)
-- ============================================================
-- El trigger genérico (fn_auditoria) usa auth.uid(), que es NULL cuando
-- la conexión es de service_role — por eso crear/eliminar un usuario
-- desde las Edge Functions no podía identificar quién lo hizo.
--
-- Solución: un trigger propio para `usuarios` que:
--   - Si hay sesión de usuario (auth.uid() no es null) → audita normal,
--     esto cubre acciones directas como desactivar/reactivar.
--   - Si NO hay sesión (service_role, viene de una Edge Function) → no
--     inserta nada, porque la propia Edge Function ya va a insertar el
--     registro de auditoría con el actor correcto (evita duplicados).

drop trigger if exists trg_auditoria_usuarios on usuarios;

create or replace function fn_auditoria_usuarios()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  insert into auditoria (usuario_id, accion, entidad, entidad_id, detalle)
  values (
    auth.uid(),
    case
      when tg_op = 'INSERT' then 'crear_usuarios'
      when tg_op = 'UPDATE' then 'editar_usuarios'
      when tg_op = 'DELETE' then 'eliminar_usuarios'
    end,
    'usuarios',
    coalesce(new.id, old.id),
    case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end
  );

  return coalesce(new, old);
end;
$$;

create trigger trg_auditoria_usuarios
after insert or update or delete on usuarios
for each row execute function fn_auditoria_usuarios();
