-- ============================================================
-- SIRO — Detalle clínico adicional por pieza: material de corona,
-- tipo de incrustación, tipo de ausencia
-- Migración 068
-- ------------------------------------------------------------
-- Mismo patrón exacto que ya usó la migración 005 para
-- diagnóstico/tratamiento_id/notas: columnas nuevas, opcionales,
-- aditivas sobre odontograma_piezas — nunca se toca el enum de
-- `estado`, ni estadoClinico.js, ni ningún color o símbolo que se
-- dibuja sobre el diente. Estos 3 campos son texto libre porque el
-- catálogo de materiales/tipos varía por clínica; el frontend ofrece
-- opciones comunes en un <select>, pero la columna no está restringida
-- por un check — igual que diagnostico y notas ya no lo estaban.
--
-- Quedan a nivel de PIEZA completa, no por cara — una incrustación
-- real puede ser específica de una superficie, pero desde clínica se
-- puede anotar el detalle exacto en "notas" si hace falta esa
-- precisión; ir a nivel de cara hubiera significado tocar también la
-- UI de edición de caras, con más riesgo del que amerita esta pieza.
-- ============================================================

alter table odontograma_piezas add column if not exists material_corona text;
alter table odontograma_piezas add column if not exists tipo_incrustacion text;
alter table odontograma_piezas add column if not exists tipo_ausencia text;
