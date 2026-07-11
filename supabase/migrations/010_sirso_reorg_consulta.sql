-- ============================================================
-- SIRSO — Reorganización, Fase 6: Consulta unificada
-- ============================================================
-- "Hallazgos clínicos" (sección de exploración) es distinto de
-- "contenido" (la nota libre) y de "diagnóstico" (que ya existía desde
-- la Fase 4 de Expediente) — se agrega como columna nueva, opcional,
-- no rompe notas existentes.

alter table notas_clinicas add column if not exists hallazgos text;
