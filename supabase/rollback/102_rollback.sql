-- ROLLBACK de la migración 102: retira el disparador, las funciones y los índices. No toca datos. Seguro de re-ejecutar.
begin;
drop trigger if exists trg_limitar_frecuencia_contacto on public.mensajes_contacto;
drop function if exists fn_limitar_frecuencia_contacto();
drop function if exists fn_config_limite(text, integer);
drop index if exists public.idx_mensajes_contacto_creado;
drop index if exists public.idx_mensajes_contacto_correo_creado;
commit;
