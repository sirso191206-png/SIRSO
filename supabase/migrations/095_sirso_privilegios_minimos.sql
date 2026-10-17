-- ============================================================
-- SIRO — Privilegios mínimos: quitar TRUNCATE, REFERENCES y TRIGGER a anon y authenticated
-- Migración 095 (fase 7). Cierra la decisión de la propuesta 001.
-- ------------------------------------------------------------
-- Con los privilegios por defecto de Supabase, `anon` y `authenticated` tenían TRUNCATE en 38 tablas y REFERENCES/TRIGGER en 44 relaciones de `public`
-- (tablas y 3 vistas). TRUNCATE no está sujeto a RLS; ninguna API del producto lo expone (PostgREST no ofrece TRUNCATE), pero ningún flujo legítimo de la
-- aplicación, función SQL ni migración los necesita: los triggers y las FK los ejercen el propietario de la tabla y las funciones SECURITY DEFINER.
-- ES EL CAMBIO MÍNIMO: no toca SELECT/INSERT/UPDATE/DELETE, ni RLS, ni a service_role. Comprobado (fases 6 y 7): DML y RLS con huella idéntica y baterías verdes.
-- ROLLBACK EXACTO: antes de revocar, la migración guarda una INSTANTÁNEA de lo que había en plataforma_config (clave `rollback_095_privilegios`, JSON; esa tabla ya está
-- protegida por RLS y solo la escribe el servicio, así que NO se crea ninguna tabla nueva que las guardas de aislamiento tengan que declarar);
-- supabase/rollback/095_rollback.sql restituye exactamente eso, sea cual sea el estado de cada entorno, y borra la clave.
-- Se añade además el privilegio por defecto para las tablas FUTURAS creadas por quien ejecuta las migraciones.
-- ============================================================
begin;

-- Instantánea (si se vuelve a ejecutar, `on conflict do nothing` conserva la ORIGINAL: lo que ya está revocado no aparece de nuevo). Los privilegios POR DEFECTO que había
-- para las tablas futuras de public se guardan con r = '*default*'.
insert into public.plataforma_config (clave, valor)
select 'rollback_095_privilegios', coalesce(jsonb_agg(jsonb_build_object('r', x.r, 'rol', x.rol, 'p', x.p))::text, '[]')
  from (
    select c.relname::text as r, g.grantee::text as rol, g.privilege_type::text as p
      from information_schema.role_table_grants g
      join pg_class c on c.relname = g.table_name and c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f')
     where g.table_schema = 'public' and g.grantee in ('anon', 'authenticated') and g.privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')
    union all
    select '*default*', r.rolname::text, a.privilege_type::text
      from pg_default_acl d, lateral aclexplode(d.defaclacl) a
      join pg_roles r on r.oid = a.grantee
     where d.defaclnamespace = 'public'::regnamespace and d.defaclobjtype = 'r' and d.defaclrole = (select oid from pg_roles where rolname = current_user)
       and r.rolname in ('anon', 'authenticated') and a.privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')
  ) x
on conflict (clave) do nothing;

do $$ declare r record; begin
  for r in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f') loop
    execute format('revoke truncate, references, trigger on public.%I from anon, authenticated', r.relname);
  end loop;
end $$;
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;
commit;
