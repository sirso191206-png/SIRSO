-- ROLLBACK de la 120. Quita los triggers de auditoría administrativa y devuelve al rol anónimo los permisos que tenía
-- (SELECT/INSERT/UPDATE/DELETE: los permisos por omisión de Supabase que tenía antes; RLS sigue filtrando). Conserva las filas de auditoría ya escritas. Re-ejecutable.
begin;

do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'catalogo_tratamientos', 'sucursales', 'consultorios', 'sucursal_usuarios', 'reserva_config', 'reserva_servicios',
    'materiales', 'movimientos_inventario', 'receta_materiales', 'horarios_bloqueados', 'clinicas'
  ] loop
    execute format('drop trigger if exists trg_auditoria_admin on %I', v_tabla);
  end loop;
end $$;
drop function if exists fn_auditoria_admin();

do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'pacientes', 'v_pacientes_seguro', 'v_saldo_pacientes', 'v_tratamientos_recepcion', 'expedientes', 'notas_clinicas',
    'citas', 'tratamientos', 'pagos', 'recetas', 'consentimientos_informados', 'referencias_medicas', 'signos_vitales',
    'fotografias', 'documentos_clinicos', 'odontograma_piezas', 'odontograma_caras', 'odontograma_historial',
    'periodontograma_piezas', 'periodontograma_sitios', 'periodontograma_historial', 'usuarios', 'sesiones_usuario',
    'incidentes_seguridad', 'lista_espera', 'horarios_bloqueados', 'asistente_dentista_asignaciones', 'legal_acceptances',
    'sucursal_usuarios', 'sucursales', 'consultorios', 'sillones', 'catalogo_tratamientos', 'clinicas',
    'arco_solicitudes', 'mensajes_contacto'
  ] loop
    if to_regclass('public.' || v_tabla) is not null then
      execute format('grant select, insert, update, delete on %I to anon', v_tabla);
    end if;
  end loop;
end $$;

drop trigger if exists trg_arco_alta_limpia on arco_solicitudes;
drop function if exists fn_arco_alta_limpia();
grant execute on function fn_uso_clinica(uuid) to authenticated;
grant execute on function fn_suscripcion_vigente(uuid) to authenticated;

alter table arco_solicitudes drop constraint if exists arco_solicitudes_longitudes;

drop trigger if exists trg_aa_integridad_pago on pagos;
drop function if exists fn_pago_integridad();

commit;
