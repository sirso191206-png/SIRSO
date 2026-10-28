-- ROLLBACK de la 118 (inventario de materiales). Deja el esquema como 001–117.
-- BORRA el inventario (materiales, movimientos y recetas) y el contador tratamientos.inventario_sesiones_descontadas;
-- los tratamientos no se tocan. Quita la funcionalidad `inventario` de planes y suscripciones. Re-ejecutable.
begin;
drop trigger if exists trg_inventario_tratamiento on tratamientos;
drop function if exists fn_inventario_tratamiento();
drop function if exists fn_inventario_stock_bajo(uuid);
drop function if exists fn_inventario_avisos_tratamiento(uuid);
drop function if exists fn_inventario_descontar_tratamiento(uuid, uuid, uuid, integer, text);
drop function if exists fn_inventario_sesiones_efectivas(text, integer);
drop function if exists fn_inventario_registrar_movimiento(uuid, text, numeric, text, uuid);
drop function if exists fn_inventario_aplicar(uuid, numeric, text, text, text, uuid, uuid);   -- antes que la tabla: devuelve su tipo de fila
drop table if exists receta_materiales;
drop table if exists movimientos_inventario;
drop table if exists materiales;
drop function if exists fn_inventario_validar_receta();
drop function if exists fn_inventario_validar_material();
alter table tratamientos drop column if exists inventario_sesiones_descontadas;
delete from suscripcion_funcionalidades where funcionalidad = 'inventario';
delete from plan_funcionalidades where funcionalidad = 'inventario';
delete from funcionalidades where codigo = 'inventario';
commit;
