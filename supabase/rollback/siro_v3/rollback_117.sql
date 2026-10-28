-- ROLLBACK de la 117 (reserva en línea). Deja el esquema como 001–116. Borra la configuración, los servicios y las
-- solicitudes de reserva (las citas y pacientes que ya se crearon al confirmar se CONSERVAN: son citas normales).
-- Quita la funcionalidad `reserva_en_linea` del catálogo, de los planes y de los snapshots (cascada). Re-ejecutable.
begin;
drop function if exists reserva_rechazar_solicitud(uuid, text);
drop function if exists reserva_confirmar_solicitud(uuid, uuid);
drop function if exists fn_reserva_solicitud_para_resolver(uuid);
drop function if exists reserva_solicitar_cita(text, uuid, timestamptz, text, text, text, text, uuid, text);
drop function if exists reserva_horarios_libres(text, uuid, date, uuid);
drop function if exists reserva_publica_info(text);
drop function if exists fn_reserva_ip_hash();
drop function if exists fn_reserva_recurso_libre(uuid, uuid, timestamptz, timestamptz);
do $$ begin
  if to_regtype('public.reserva_config') is not null then
    drop function if exists fn_reserva_horarios_del_dia(reserva_config, integer, date);
    drop function if exists fn_reserva_config_publica(text);
  end if;
  if to_regtype('public.reserva_servicios') is not null then
    drop function if exists fn_reserva_servicio(uuid, uuid);
  end if;
end $$;
drop function if exists fn_reserva_sucursal(uuid, uuid);
drop table if exists solicitudes_cita;
drop table if exists reserva_servicios;
drop table if exists reserva_config;
drop function if exists fn_validar_reserva_config();
delete from plataforma_config where clave = 'reserva_sal_ip';
delete from funcionalidades where codigo = 'reserva_en_linea';   -- cascada: plan_funcionalidades y suscripcion_funcionalidades
commit;
