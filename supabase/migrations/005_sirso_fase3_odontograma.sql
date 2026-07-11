-- ============================================================
-- SIRSO — FASE 3: Mejoras del odontograma
-- ============================================================
-- No se toca ninguna fila existente. Solo se agregan columnas opcionales
-- a odontograma_piezas. La comparación "inicial vs actual" no necesita
-- tabla nueva: se reconstruye en el frontend a partir de
-- odontograma_historial, que ya registra cada cambio con fecha.

alter table odontograma_piezas add column if not exists diagnostico text;
alter table odontograma_piezas add column if not exists tratamiento_id uuid references tratamientos(id) on delete set null;
alter table odontograma_piezas add column if not exists notas text;
