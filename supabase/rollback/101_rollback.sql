-- ROLLBACK de la migración 101: retira los disparadores y la función. No toca datos. Seguro de re-ejecutar.
begin;
drop trigger if exists trg_firmante on recetas;
drop trigger if exists trg_firmante on consentimientos_informados;
drop trigger if exists trg_firmante on referencias_medicas;
drop function if exists fn_validar_firmante();
commit;
