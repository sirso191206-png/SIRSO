-- ============================================================
-- SIRO — Exploración física
-- ============================================================
-- 1) Signos vitales: le faltaban tres mediciones del documento.
alter table signos_vitales add column if not exists frecuencia_respiratoria integer;
alter table signos_vitales add column if not exists saturacion_oxigeno integer;
alter table signos_vitales add column if not exists glucosa_capilar integer;

-- El IMC no se guarda como columna — se calcula en el frontend a partir
-- de peso/estatura cada vez que se muestra, para que nunca quede
-- desactualizado si se corrige un valor después.

-- 2) Exploración general y por sistemas: igual que el interrogatorio,
-- es un dato POR CONSULTA (cambia en cada visita), no un dato fijo del
-- expediente — vive en notas_clinicas.
alter table notas_clinicas add column if not exists exploracion_fisica jsonb;
