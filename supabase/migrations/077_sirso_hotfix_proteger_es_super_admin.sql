-- ============================================================
-- SIRO — Hotfix de seguridad: nadie se hace superadmin por la API
-- Migración 077
-- ------------------------------------------------------------
-- HALLAZGO (reproducido contra el esquema real): `usuarios.es_super_admin` no estaba
-- protegida contra escritura. La política `usuarios_update_owner` deja que el dueño de una
-- clínica actualice CUALQUIER fila de su clínica —incluida la suya— sin limitar columnas
-- (`usuarios_update_self` sí fija es_super_admin, pero las políticas permisivas se combinan
-- con OR, así que no protege), y `usuarios_insert_owner` tampoco la restringe. Resultado:
--     PATCH /rest/v1/usuarios?id=eq.<su id>      { "es_super_admin": true }
-- o insertar un usuario con es_super_admin = true, volvía superadmin de plataforma a
-- cualquier dueño: podía invocar todas las sa_* y las Edge Functions de administración.
--
-- Cierre: trigger que impide a los roles de la API (authenticated/anon) activar o cambiar
-- es_super_admin. service_role y el propietario de la BD sí pueden (el alta de un superadmin
-- se hace con SQL / service_role, nunca desde la interfaz). No cambia datos ni políticas.
-- Independiente de los planes: se despliega sola, de inmediato, igual que la 074.
-- Seguro de re-ejecutar.
-- ============================================================
begin;

create or replace function fn_proteger_es_super_admin()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and coalesce(new.es_super_admin, false) then
      raise exception 'No puedes crear un superadmin: ese privilegio no se puede otorgar desde la aplicación.'
        using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.es_super_admin is distinct from old.es_super_admin then
      raise exception 'No puedes cambiar el privilegio de superadmin desde la aplicación.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_proteger_es_super_admin on usuarios;
create trigger trg_proteger_es_super_admin
  before insert or update of es_super_admin on usuarios
  for each row execute function fn_proteger_es_super_admin();

commit;
