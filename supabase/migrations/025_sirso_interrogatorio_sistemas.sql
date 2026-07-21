-- ============================================================
-- SIRO — Interrogatorio por aparatos y sistemas
-- ============================================================
-- A diferencia de alergias/antecedentes (que son datos fijos del
-- expediente), el interrogatorio por sistemas se hace EN CADA consulta
-- — por eso vive en notas_clinicas, no en expedientes. Se guarda
-- siempre la lista completa de sistemas revisados, aunque nada haya
-- salido positivo: en clínica, "se interrogó y se negó fiebre/tos/etc."
-- es información igual de valiosa que un síntoma presente.
alter table notas_clinicas add column if not exists interrogatorio_sistemas jsonb;
