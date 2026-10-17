-- ROLLBACK de la migración 094: vuelve a permitir el cambio directo de estado de una cita completada. NO borra la auditoría ya registrada. Seguro de re-ejecutar.
begin;
drop trigger if exists trg_proteger_cita_completada on citas;
drop function if exists fn_corregir_estado_cita(uuid, text, text);
drop function if exists fn_proteger_cita_completada();
commit;
