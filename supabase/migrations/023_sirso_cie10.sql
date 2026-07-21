-- ============================================================
-- SIRO — Diagnóstico con CIE-10
-- ============================================================
-- El campo `diagnostico` (texto libre) se conserva tal cual — sigue
-- siendo el lugar para la descripción clínica en palabras del
-- odontólogo. Estos dos campos nuevos son el código estandarizado, para
-- que el diagnóstico también sea un dato consultable/comparable, no
-- solo texto narrativo.
alter table notas_clinicas add column if not exists diagnostico_cie10_codigo text;
alter table notas_clinicas add column if not exists diagnostico_cie10_descripcion text;
