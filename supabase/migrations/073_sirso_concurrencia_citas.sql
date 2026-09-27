-- ============================================================
-- SIRO — Concurrencia real para citas
-- Migración 073
-- ------------------------------------------------------------
-- citas nunca tuvo actualizado_en — a diferencia de expedientes y
-- odontograma/periodontograma, aquí ni siquiera existía la columna.
-- Se agrega y se conecta al mismo fn_set_actualizado_en() (069) de
-- siempre — es el prerrequisito real para poder encolar "finalizar
-- consulta" sin conexión: sin esto, no hay forma de detectar si
-- alguien más ya cambió el estado de la cita mientras estaba offline.
-- ============================================================

alter table citas add column if not exists actualizado_en timestamptz default now();

drop trigger if exists trg_set_actualizado_en_citas on citas;
create trigger trg_set_actualizado_en_citas
before update on citas
for each row execute function fn_set_actualizado_en();
