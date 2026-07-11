-- ============================================================
-- SIRSO — FASE 6: Tratamientos — catálogo, categorías, sesiones
-- ============================================================

-- ------------------------------------------------------------
-- 1. Catálogo de tratamientos, compartido por toda la clínica
-- ------------------------------------------------------------
create table catalogo_tratamientos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id),
  categoria text,
  nombre text not null,
  descripcion text,
  precio numeric(10, 2) not null default 0,
  activo boolean not null default true,
  creado_por uuid references usuarios(id) on delete set null,
  creado_en timestamptz default now()
);

alter table catalogo_tratamientos enable row level security;

-- Toda la clínica puede VER el catálogo (lo necesitan para cotizar y
-- para elegir tratamientos), pero solo owner/dentista lo administran.
create policy catalogo_tratamientos_select on catalogo_tratamientos
  for select using (clinica_id = auth_clinica_id());

create policy catalogo_tratamientos_write on catalogo_tratamientos
  for all using (clinica_id = auth_clinica_id() and auth_rol() in ('owner', 'dentista'));

create trigger trg_set_clinica_catalogo_tratamientos
before insert on catalogo_tratamientos
for each row execute function fn_set_clinica_generico();

-- ------------------------------------------------------------
-- 2. Columnas nuevas en tratamientos (todas opcionales, no rompen
--    tratamientos ya existentes)
-- ------------------------------------------------------------
alter table tratamientos add column if not exists catalogo_id uuid references catalogo_tratamientos(id) on delete set null;
alter table tratamientos add column if not exists categoria text;
alter table tratamientos add column if not exists diagnostico_relacionado text;
alter table tratamientos add column if not exists numero_sesiones integer not null default 1;
alter table tratamientos add column if not exists sesiones_completadas integer not null default 0;
alter table tratamientos add column if not exists fecha_inicio date;
alter table tratamientos add column if not exists fecha_estimada_fin date;
alter table tratamientos add column if not exists descuento numeric(10, 2) not null default 0;
alter table tratamientos add column if not exists notas text;

-- ------------------------------------------------------------
-- 3. Ampliar estados: se agregan 'aceptado' y 'pausado', se conservan
--    los que ya existían.
-- ------------------------------------------------------------
do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'tratamientos'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%estado%';
  if v_constraint_name is not null then
    execute format('alter table tratamientos drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table tratamientos add constraint tratamientos_estado_check check (estado in (
  'planeado', 'aceptado', 'en_progreso', 'pausado', 'completado', 'cancelado'
));
