-- ============================================================
-- SIRO — Concurrencia real para odontograma y periodontograma
-- Migración 072
-- ------------------------------------------------------------
-- Mismo hallazgo que expedientes (071), en 4 tablas: cada una tenía
-- actualizado_en, pero puesta a mano desde el FRONTEND en cada
-- guardado (new Date().toISOString()) — funcionaba para mostrar
-- "última actualización" en pantalla, pero no sirve como candado de
-- concurrencia real, porque el propio cliente decide su valor en vez
-- de que lo decida el servidor.
--
-- Se reutiliza fn_set_actualizado_en() (069) tal cual en las 4 —
-- ninguna necesita lógica propia, es exactamente el mismo patrón.
-- Este es el prerrequisito real para poder encolar cambios de
-- odontograma/periodontograma sin conexión más adelante: sin un
-- candado de concurrencia confiable, dos personas editando la misma
-- pieza (una de ellas offline) no tendrían forma de detectarlo.
-- ============================================================

drop trigger if exists trg_set_actualizado_en_odontograma_piezas on odontograma_piezas;
create trigger trg_set_actualizado_en_odontograma_piezas
before update on odontograma_piezas
for each row execute function fn_set_actualizado_en();

drop trigger if exists trg_set_actualizado_en_odontograma_caras on odontograma_caras;
create trigger trg_set_actualizado_en_odontograma_caras
before update on odontograma_caras
for each row execute function fn_set_actualizado_en();

drop trigger if exists trg_set_actualizado_en_periodontograma_piezas on periodontograma_piezas;
create trigger trg_set_actualizado_en_periodontograma_piezas
before update on periodontograma_piezas
for each row execute function fn_set_actualizado_en();

drop trigger if exists trg_set_actualizado_en_periodontograma_sitios on periodontograma_sitios;
create trigger trg_set_actualizado_en_periodontograma_sitios
before update on periodontograma_sitios
for each row execute function fn_set_actualizado_en();
