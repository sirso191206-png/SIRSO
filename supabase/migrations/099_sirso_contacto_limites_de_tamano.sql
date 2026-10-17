-- ============================================================
-- SIRO — Formulario de contacto: límites de tamaño en la tabla pública `mensajes_contacto`
-- Migración 099 (fase 8, auditoría local de las Edge Functions).
-- ------------------------------------------------------------
-- DEFECTO (reproducido, ver supabase/tests/contacto_limites_test.sql): la política `mensajes_contacto_insert` permite INSERT a CUALQUIER persona (WITH CHECK true)
-- y la tabla no limitaba el tamaño de ningún campo: un anónimo podía guardar un mensaje de varios megabytes (o millones de filas grandes) y, con la Edge
-- Function enviar-contacto, enviarlo por correo al buzón de soporte. El formulario del frontend tampoco ponía límites.
-- CORRECCIÓN: restricciones CHECK de longitud (nombre 1–120, correo 1–254, mensaje 1–5000 caracteres; valores técnicos, ajustables con una migración posterior).
-- Se crean `NOT VALID`: se aplican a TODA fila NUEVA o modificada, pero NO revisan ni tocan las filas existentes (no puede fallar por datos antiguos ni borrar nada).
-- NO resuelto aquí (decisión humana): limitar la FRECUENCIA de envíos (CAPTCHA o límite por IP en Supabase/Vercel/Resend); una tabla pública sin autenticación
-- sigue pudiendo recibir muchas filas pequeñas. Seguro de re-ejecutar. Rollback: supabase/rollback/099_rollback.sql.
-- ============================================================
begin;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'mensajes_contacto_nombre_longitud' and conrelid = 'public.mensajes_contacto'::regclass) then
    alter table public.mensajes_contacto add constraint mensajes_contacto_nombre_longitud check (char_length(nombre) between 1 and 120) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'mensajes_contacto_correo_longitud' and conrelid = 'public.mensajes_contacto'::regclass) then
    alter table public.mensajes_contacto add constraint mensajes_contacto_correo_longitud check (char_length(correo) between 1 and 254) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'mensajes_contacto_mensaje_longitud' and conrelid = 'public.mensajes_contacto'::regclass) then
    alter table public.mensajes_contacto add constraint mensajes_contacto_mensaje_longitud check (char_length(mensaje) between 1 and 5000) not valid;
  end if;
end $$;
commit;
