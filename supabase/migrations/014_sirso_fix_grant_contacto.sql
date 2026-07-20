-- ============================================================
-- SIRO — Fix: falta el permiso base (GRANT) para insertar en
-- mensajes_contacto
-- ============================================================
-- La política RLS (with check true) ya estaba bien, pero en Postgres
-- una política RLS solo decide QUÉ filas puede tocar un rol que YA
-- tiene permiso — no otorga el permiso en sí. Como esta es la primera
-- tabla del proyecto pensada para escribirse sin sesión, faltó darle a
-- `anon` (visitantes sin login) el GRANT de INSERT.

grant insert on mensajes_contacto to anon, authenticated;
