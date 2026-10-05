-- ============================================================
-- SIRO — Hotfix de seguridad: RLS en planes_catalogo
-- Migración 074
-- ------------------------------------------------------------
-- HALLAZGO (reproducido, no supuesto): la migración 064 creó
-- `planes_catalogo` SIN habilitar RLS. En Supabase, las tablas nuevas
-- del esquema public reciben por defecto permisos completos para el
-- rol `authenticated`; sin RLS, esos permisos quedan abiertos. Resultado:
-- cualquier empleado con sesión iniciada (de cualquier clínica, sin ser
-- superadmin) podía hacer
--     PATCH /rest/v1/planes_catalogo?plan=eq.clinica
-- y cambiar los límites de sesiones/sucursales de TODAS las clínicas de
-- ese plan (degradarlas, o regalarse límites más altos).
--
-- Es la única tabla de public sin RLS. Este archivo es deliberadamente
-- mínimo y autónomo: se puede desplegar solo y de inmediato, sin esperar
-- al resto del sistema de planes (075).
--
-- Seguro de re-ejecutar. No cambia ningún dato.
-- ============================================================

alter table planes_catalogo enable row level security;

-- Defensa en profundidad: aunque algún día alguien agregue una política
-- por error, los roles de la API no deben poder escribir aquí. Las
-- escrituras legítimas pasan por funciones SECURITY DEFINER del
-- superadmin (075) o por service_role (ignora RLS).
revoke insert, update, delete, truncate on planes_catalogo from anon, authenticated;
revoke all on planes_catalogo from anon;

-- Lectura: cualquier usuario con sesión puede ver los planes (nombre,
-- límites). Es información comercial, no de otras clínicas.
drop policy if exists planes_catalogo_select on planes_catalogo;
create policy planes_catalogo_select on planes_catalogo
  for select to authenticated using (true);
