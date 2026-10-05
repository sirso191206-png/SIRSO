-- Paso 1/2: clínicas "heredadas" como estaban ANTES de la migración 075.
\set ON_ERROR_STOP on
\set QUIET on
insert into clinicas (id, nombre, plan, limite_pacientes, limite_usuarios) values
  ('c1000000-0000-0000-0000-000000000001', 'L1 básico con topes', 'basico', 10, 2);
insert into clinicas (id, nombre, plan) values
  ('c1000000-0000-0000-0000-000000000002', 'L2 profesional', 'profesional'),
  ('c1000000-0000-0000-0000-000000000004', 'L4 empresarial', 'empresarial');
insert into clinicas (id, nombre, plan, estado, limite_sesiones_override, fecha_inicio, fecha_vencimiento) values
  ('c1000000-0000-0000-0000-000000000003', 'L3 clínica suspendida', 'clinica', 'suspendida', 7, '2025-03-01', '2026-03-01');
insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-000000000001', 'l1@x.mx'), ('a1000000-0000-0000-0000-000000000002', 'l2@x.mx');
insert into usuarios (id, clinica_id, nombre, correo, rol) values
  ('a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Dueño L1', 'l1@x.mx', 'owner'),
  ('a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', 'Dueño L2', 'l2@x.mx', 'owner');
insert into pacientes (clinica_id, nombre_completo) select 'c1000000-0000-0000-0000-000000000001', 'Pac ' || g from generate_series(1, 4) g;
select 'ANTES: ' || count(*) || ' clínicas, planes: ' || string_agg(distinct plan, ',') from clinicas where id::text like 'c1000000%';
