-- 123, paso 1/2 (se corre SIN la 123): clínicas «viejas» cuya suscripción se creó antes de que existieran la reserva en
-- línea (117) y el inventario (118). Se reproduce quitándoles esas filas, como están en producción.
\set ON_ERROR_STOP on
\set QUIET on
begin;
insert into clinicas (id, nombre) values
  ('c1230000-0000-0000-0000-00000000000e', 'Vieja esencial'),
  ('c1230000-0000-0000-0000-00000000000c', 'Vieja profesional'),
  ('c1230000-0000-0000-0000-00000000000d', 'Vieja ajustada a mano');
select fn_asignar_plan_interno(null, 'c1230000-0000-0000-0000-00000000000e', 'esencial', 'mensual'),
       fn_asignar_plan_interno(null, 'c1230000-0000-0000-0000-00000000000c', 'profesional', 'mensual'),
       fn_asignar_plan_interno(null, 'c1230000-0000-0000-0000-00000000000d', 'profesional', 'mensual');
delete from suscripcion_funcionalidades
 where funcionalidad in ('reserva_en_linea', 'inventario')
   and suscripcion_id in (select fn_suscripcion_vigente(c) from unnest(array['c1230000-0000-0000-0000-00000000000e','c1230000-0000-0000-0000-00000000000c']::uuid[]) c);
-- La tercera ya tenía la reserva APAGADA a mano por el superadmin (y le falta el inventario): eso no se debe tocar.
delete from suscripcion_funcionalidades where funcionalidad = 'inventario' and suscripcion_id = fn_suscripcion_vigente('c1230000-0000-0000-0000-00000000000d');
update suscripcion_funcionalidades set habilitada = false where funcionalidad = 'reserva_en_linea' and suscripcion_id = fn_suscripcion_vigente('c1230000-0000-0000-0000-00000000000d');
commit;
select 'ANTES: filas de reserva/inventario en las 3 clínicas = ' || count(*) from suscripcion_funcionalidades
 where funcionalidad in ('reserva_en_linea','inventario') and suscripcion_id in (select fn_suscripcion_vigente(c) from unnest(array['c1230000-0000-0000-0000-00000000000e','c1230000-0000-0000-0000-00000000000c','c1230000-0000-0000-0000-00000000000d']::uuid[]) c);
