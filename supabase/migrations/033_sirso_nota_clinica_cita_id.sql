-- ============================================================
-- SIRO — Interoperabilidad SIS: enlace nota_clinica → cita
-- Migración 033
-- ------------------------------------------------------------
-- notas_clinicas se relaciona con expediente_id, no con una cita
-- específica — no hay forma confiable de saber "esta nota es de
-- ESTA consulta" más que por cercanía de fecha (heurística). Para
-- generar el reporte SIS por periodo (que necesita saber, por cada
-- cita, cuál fue su diagnóstico y sus acciones de salud bucal) esto
-- no es aceptable: asociar mal una nota a una fecha equivocada
-- produciría un reporte oficial con datos incorrectos.
--
-- Aditiva y sin riesgo: nullable, no rompe nada existente. El
-- guardado de la consulta (useConsultaForm.js) ya conoce el citaId
-- de la consulta activa — solo hace falta pasarlo.
-- ============================================================

alter table notas_clinicas add column if not exists cita_id uuid references citas(id) on delete set null;

create index if not exists idx_notas_clinicas_cita_id on notas_clinicas (cita_id);
