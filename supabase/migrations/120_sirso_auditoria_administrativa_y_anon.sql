-- ============================================================
-- SIRO — 120: auditoría de las acciones administrativas y menos permisos para el rol anónimo.
-- ------------------------------------------------------------
-- Hallazgos de la prueba con personas (29/10/2026):
--  * La auditoría no registraba cambios administrativos: datos de la clínica (RFC, domicilio), sucursales, consultorios y
--    asignaciones, catálogo y precios, inventario, reserva en línea, horarios bloqueados. Se agregan triggers con
--    fn_auditoria_admin: registra solo acciones de una persona (auth.uid() no nulo: lo que hace el sistema —folios,
--    cobros, descuentos automáticos— no se audita aquí) y no registra un UPDATE que no cambió nada. En `clinicas` se
--    ignoran los contadores de folio y el id de Stripe, que cambian solos con cada paciente o recibo.
--  * El rol `anon` (página sin sesión) tenía SELECT sobre tablas clínicas y de personal. RLS ya devolvía 0 filas, pero no
--    hay razón para conservar el permiso: se retira SELECT/INSERT/UPDATE/DELETE en esas tablas (INSERT se conserva en ARCO
--    y contacto). Las páginas públicas usan funciones
--    SECURITY DEFINER (reserva) o solo INSERT (ARCO, contacto), que no cambian. legal_documents sigue legible (es público).
-- Re-ejecutable. Rollback: supabase/rollback/siro_v3/rollback_120.sql.
-- ============================================================
begin;

create or replace function fn_auditoria_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila jsonb := to_jsonb(coalesce(new, old));
  v_ignorar text[] := array['siguiente_folio_paciente', 'siguiente_folio_recibo', 'stripe_customer_id', 'actualizado_en'];
  v_clave text;
  v_antes jsonb;
  v_despues jsonb;
begin
  -- Sin una persona de SIRO detrás (proceso del sistema, o un token sin usuario registrado) no hay a quién atribuirlo.
  if auth.uid() is null or not exists (select 1 from usuarios where id = auth.uid()) then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' then
    v_antes := to_jsonb(old);
    v_despues := to_jsonb(new);
    foreach v_clave in array v_ignorar loop
      v_antes := v_antes - v_clave;
      v_despues := v_despues - v_clave;
    end loop;
    if v_antes = v_despues then
      return new;
    end if;
  end if;

  insert into auditoria (usuario_id, accion, entidad, entidad_id, detalle)
  values (
    auth.uid(),
    case tg_op when 'INSERT' then 'crear_' when 'UPDATE' then 'editar_' else 'eliminar_' end || tg_table_name,
    tg_table_name,
    coalesce(v_fila->>'id', v_fila->>'clinica_id')::uuid,
    v_fila
  );
  return coalesce(new, old);
end;
$$;
revoke all on function fn_auditoria_admin() from public, anon, authenticated;

do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'catalogo_tratamientos', 'sucursales', 'consultorios', 'sucursal_usuarios', 'reserva_config', 'reserva_servicios',
    'materiales', 'movimientos_inventario', 'receta_materiales', 'horarios_bloqueados'
  ] loop
    execute format('drop trigger if exists trg_auditoria_admin on %I', v_tabla);
    execute format('create trigger trg_auditoria_admin after insert or update or delete on %I for each row execute function fn_auditoria_admin()', v_tabla);
  end loop;
end $$;
-- La clínica solo se edita (no se crea ni se borra desde la app).
drop trigger if exists trg_auditoria_admin on clinicas;
create trigger trg_auditoria_admin after update on clinicas for each row execute function fn_auditoria_admin();

-- Rol anónimo: fuera de las tablas clínicas y de personal.
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
      execute format('revoke select, update, delete on %I from anon', v_tabla);
      -- INSERT solo se conserva donde una página pública lo usa (formulario ARCO y contacto).
      if v_tabla not in ('arco_solicitudes', 'mensajes_contacto') then
        execute format('revoke insert on %I from anon', v_tabla);
      end if;
    end if;
  end loop;
end $$;

commit;
