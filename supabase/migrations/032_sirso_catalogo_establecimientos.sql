-- ============================================================
-- SIRO — Interoperabilidad SIS: catálogo de Establecimientos (CLUES)
-- Migración 032
-- ------------------------------------------------------------
-- El catálogo nacional de Establecimientos de Salud de la DGIS tiene
-- 64,006 filas — demasiado grande para el frontend (~10 MB incluso
-- recortado a las columnas mínimas). El mapper SIS (sis-mapper.ts)
-- solo necesita consultar UNA fila a la vez: la CLUES de la propia
-- clínica, para saber si programaSMyMG aplica (institución SSA/IMB) y
-- si la CLUES está "en operación". Postgres maneja 64,006 filas sin
-- ningún problema — el límite real era el tamaño del bundle JS, no la
-- base de datos.
--
-- Es una tabla de referencia GLOBAL (no por clínica, igual para
-- todos), de solo lectura para la app — se actualiza periódicamente
-- reimportando el catálogo oficial (ver establecimientos_sis.csv),
-- no por los usuarios.
--
-- Fuente: ESTABLECIMIENTO_SALUD_202606.xlsx (DGIS, actualización
-- junio 2026), hoja CLUES_202606.
-- ============================================================

create table if not exists sis_catalogo_establecimientos (
  clues text primary key,
  institucion text,        -- p. ej. "SSA", "IMB" — usado por programaSMyMG
  entidad text,             -- 2 caracteres, para la nomenclatura del archivo
  en_operacion boolean not null default false,
  nombre_unidad text,
  actualizado_en timestamptz not null default now()
);

alter table sis_catalogo_establecimientos enable row level security;

drop policy if exists sis_catalogo_establecimientos_select on sis_catalogo_establecimientos;
create policy sis_catalogo_establecimientos_select on sis_catalogo_establecimientos
  for select using (true); -- dato público de referencia, igual para todas las clínicas

-- Ningún grant de insert/update/delete para `authenticated`: esta
-- tabla solo se actualiza reimportando el catálogo oficial (service_role
-- o el propio SQL Editor), nunca desde la app.
grant select on sis_catalogo_establecimientos to authenticated;

create index if not exists idx_sis_catalogo_establecimientos_entidad
  on sis_catalogo_establecimientos (entidad);
