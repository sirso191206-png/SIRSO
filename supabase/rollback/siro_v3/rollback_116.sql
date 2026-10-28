-- ROLLBACK de la 116 (registro de errores). Deja el esquema como 001–115. Borra el registro de errores (solo datos técnicos). Re-ejecutable.
begin;
drop function if exists sa_errores_app(integer);
drop function if exists fn_alerta_reciente(text);
drop function if exists fn_registrar_error_cliente(text, text, text, text);
drop table if exists errores_app;
commit;
