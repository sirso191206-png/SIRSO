-- ============================================================
-- SIRO — Datos profesionales permanentes del odontólogo + snapshot
-- histórico en recetas
-- Migración 037
-- ------------------------------------------------------------
-- No se crea una tabla "perfil_profesional" nueva: `usuarios` ya es
-- el perfil del profesional (ya tiene nombre, cedula_profesional
-- desde la migración 020) — solo le faltaban RFC y escuela de
-- procedencia. Reutilizar en vez de duplicar.
-- ============================================================

alter table usuarios add column if not exists rfc text;
alter table usuarios add column if not exists escuela_procedencia text;

-- ---------- Snapshot histórico en recetas ----------
-- Por qué: si el odontólogo corrige su cédula el año que viene, una
-- receta emitida HOY debe seguir mostrando los datos con los que
-- realmente se expidió — no los datos actuales. Se guarda una copia
-- de los 4 campos profesionales al momento de crear la receta, no una
-- referencia que se recalcule después.
alter table recetas add column if not exists nombre_medico_snapshot text;
alter table recetas add column if not exists rfc_snapshot text;
alter table recetas add column if not exists cedula_profesional_snapshot text;
alter table recetas add column if not exists escuela_snapshot text;

-- ---------- Autoedición del perfil profesional ----------
-- Hasta ahora, la ÚNICA policy de UPDATE en usuarios era
-- usuarios_update_owner — un dentista no podía editar ni su propia
-- fila. Sin esto, un dentista jamás podría capturar su propio RFC/
-- cédula/escuela: solo el owner podría hacerlo por él, uno por uno.
--
-- Esta policy nueva permite que cualquier usuario actualice SU PROPIA
-- fila (id = auth.uid()) — pero el WITH CHECK compara cada campo
-- sensible contra su valor ACTUAL en la base (no contra el valor que
-- se intenta escribir), así que un intento de colarse cambiando
-- rol/clinica_id/es_super_admin/activo en la misma llamada
-- simplemente hace que la fila completa sea rechazada por RLS — no
-- silenciosamente ignorada, la actualización entera falla.
drop policy if exists usuarios_update_self on usuarios;
create policy usuarios_update_self on usuarios
  for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and rol = (select u.rol from usuarios u where u.id = auth.uid())
    and clinica_id = (select u.clinica_id from usuarios u where u.id = auth.uid())
    and es_super_admin = (select u.es_super_admin from usuarios u where u.id = auth.uid())
    and activo = (select u.activo from usuarios u where u.id = auth.uid())
  );
