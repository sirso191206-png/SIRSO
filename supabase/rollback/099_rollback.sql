-- ROLLBACK de la migración 099: retira las restricciones de longitud de mensajes_contacto. No toca datos. Seguro de re-ejecutar.
begin;
alter table public.mensajes_contacto drop constraint if exists mensajes_contacto_nombre_longitud;
alter table public.mensajes_contacto drop constraint if exists mensajes_contacto_correo_longitud;
alter table public.mensajes_contacto drop constraint if exists mensajes_contacto_mensaje_longitud;
commit;
