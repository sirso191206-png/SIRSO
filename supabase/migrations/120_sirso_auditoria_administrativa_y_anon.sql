-- ============================================================
-- SIRO — 120: auditoría de las acciones administrativas y menos permisos para el rol anónimo.
-- ------------------------------------------------------------
-- Hallazgos de la prueba con personas (29/10/2026):
--  * La auditoría no registraba cambios administrativos: datos de la clínica (RFC, domicilio), sucursales, consultorios y
--    asignaciones, catálogo y precios, inventario, reserva en línea, horarios bloqueados. Se agregan triggers con
--    fn_auditoria_admin: registra solo acciones de una persona (auth.uid() no nulo: lo que hace el sistema —folios,
--    cobros, descuentos automáticos— no se audita aquí) y no registra un UPDATE que no cambió nada. En `clinicas` se
--    ignoran los contadores de folio y el id de Stripe, que cambian solos con cada paciente o recibo, y en `materiales`
--    el stock (cada movimiento ya queda auditado; antes cada uno generaba además un «Editar material»).
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
  v_ignorar text[] := array['siguiente_folio_paciente', 'siguiente_folio_recibo', 'stripe_customer_id', 'actualizado_en', 'stock'];
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

-- ARCO público (segunda y tercera ronda de pruebas): una solicitud NUEVA siempre nace «recibida», sin verificar ni
-- responder, con el correo normalizado (sin espacios ni mayúsculas: así el límite por correo no se salta) y válido. Sin sesión se podían
-- mandar identidad_verificada=true, respuesta y fecha_respuesta, y también una clinica_id (dejarla en la bandeja de cualquier
-- clínica) o un paciente. Quien escribe sin sesión no indica clínica ni paciente: la solicitud llega a SIRO, que la remite
-- (artículo 32).
-- SECURITY INVOKER a propósito: solo corrige NEW y así current_user es el rol de quien inserta (en la API, anon o
-- authenticated; en procesos internos, otro rol que no se toca).
create or replace function fn_arco_alta_limpia()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  new.estado := 'recibida';
  new.solicitante_correo := lower(btrim(new.solicitante_correo));
  if new.solicitante_correo !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then
    raise exception 'Escribe un correo electrónico válido.' using errcode = '22023';
  end if;
  new.identidad_verificada := false;
  new.identidad_verificada_por := null;
  new.identidad_verificada_en := null;
  new.metodo_verificacion := null;
  new.respuesta := null;
  new.fecha_respuesta := null;
  new.responsable_id := null;
  if current_user = 'anon' then
    new.clinica_id := null;
    new.paciente_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_arco_alta_limpia on arco_solicitudes;
create trigger trg_arco_alta_limpia before insert on arco_solicitudes for each row execute function fn_arco_alta_limpia();

-- Pagos (tercera ronda): desde la API, un pago nace con la hora y el folio que pone el servidor (antes se podía mandar
-- una fecha de 2020 o un número de recibo repetido); una anulación lleva la hora y el usuario reales, y un pago anulado
-- ya no se puede «desanular» ni reescribir. Los procesos internos (otros roles) no se tocan. SECURITY INVOKER para que
-- current_user sea el rol de quien escribe. El nombre «trg_aa_…» hace que corra ANTES de trg_asignar_numero_recibo.
create or replace function fn_pago_integridad()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.creado_en := now();
    new.numero_recibo := null;
    new.anulado_en := null;
    new.anulado_por := null;
    new.motivo_anulacion := null;
    return new;
  end if;
  if old.anulado_en is not null then
    raise exception 'Un pago anulado ya no se puede modificar.' using errcode = '42501';
  end if;
  if new.numero_recibo is distinct from old.numero_recibo or new.sucursal_id is distinct from old.sucursal_id then
    raise exception 'Un pago registrado no se puede editar — solo se puede anular.' using errcode = '42501';
  end if;
  if new.anulado_en is not null then
    new.anulado_en := now();
    new.anulado_por := auth.uid();
  else
    new.anulado_por := null;
    new.motivo_anulacion := old.motivo_anulacion;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_aa_integridad_pago on pagos;
create trigger trg_aa_integridad_pago before insert or update on pagos for each row execute function fn_pago_integridad();

-- Tope de tamaño del formulario ARCO público (como contacto, migración 099). NOT VALID: no revisa filas viejas.
alter table arco_solicitudes drop constraint if exists arco_solicitudes_longitudes;
alter table arco_solicitudes add constraint arco_solicitudes_longitudes check (
  char_length(solicitante_nombre) <= 120 and char_length(solicitante_correo) <= 254 and char_length(coalesce(descripcion, '')) <= 5000
) not valid;

-- Uso y suscripción de OTRA clínica: el dueño de una clínica podía consultar los conteos (usuarios, pacientes, sucursales) y la
-- suscripción de cualquier otra pasando su id. Solo las usan funciones SECURITY DEFINER (mi_suscripcion, sa_*), que no
-- necesitan que el usuario tenga EXECUTE.
revoke execute on function fn_uso_clinica(uuid) from public, anon, authenticated;
revoke execute on function fn_suscripcion_vigente(uuid) from public, anon, authenticated;

commit;
