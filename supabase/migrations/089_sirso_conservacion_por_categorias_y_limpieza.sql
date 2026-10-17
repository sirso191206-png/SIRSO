-- ============================================================
-- SIRO — Conservación por categorías y trazabilidad de la limpieza (Auth/Storage)
-- Migración 089 (reemplaza la vista previa de la 087 y la función de borrado de la 086; ninguna ha sido desplegada)
-- ------------------------------------------------------------
-- Revisada la 087 contra el esquema real, se encontró:
--  1) Faltaban la apertura y el cierre del expediente: `pacientes.creado_en` y `pacientes.archivado_en` (el expediente solo tiene
--     `actualizado_en`, que cualquier edición reescribe). Un paciente sin ningún otro registro dependía solo de esa marca.
--  2) Solo se evaluaba la conservación CLÍNICA. Los pagos (obligación FISCAL) y las suscripciones y aceptaciones legales
--     (CONTRACTUAL) se destruían con el borrado sin política alguna.
--  3) Lo que quedaba pendiente de Auth y Storage solo vivía en la respuesta de la Edge Function (en la auditoría iban solo
--     conteos): si la función se interrumpía tras el commit, las listas se perdían.
--  4) Un intento RECHAZADO no dejaba rastro: el rechazo revierte lo que la propia función hubiera escrito.
--
-- CATEGORÍAS (cada una con SU política, SIN valor por omisión; ausente, vacía, 0, negativa, decimal o no numérica = no definida):
--   · clínico     retencion_expediente_anios — años desde el ÚLTIMO registro clínico. Obligatoria si hay información clínica.
--   · fiscal      retencion_fiscal_anios     — años desde el último pago o anulación. Obligatoria si la clínica tiene pagos.
--   · contractual retencion_contractual_anios — años desde la última actividad de suscripción o aceptación legal. Si NO está
--                 definida NO bloquea (todas las clínicas tienen suscripción: bloquearía incluso una clínica de pruebas recién
--                 creada) pero se AVISA (`advertencias`: CONTRACTUAL_NO_EVALUADO) y el aviso queda en la auditoría. Si se define,
--                 bloquea dentro del plazo. Es una decisión de negocio/legal que queda a quien defina las políticas.
--   Una política de conservación NO es una autorización legal para eliminar: cada categoría se evalúa por separado y todas las
--   obligaciones pendientes (ARCO, incidentes) bloquean aparte.
-- FECHAS (inspeccionadas en el esquema real):
--   clínica: pacientes.creado_en (apertura), pacientes.archivado_en (cierre/archivo; el estado del expediente no tiene fecha),
--     expedientes.actualizado_en, notas_clinicas.creado_en, recetas.creado_en, tratamientos.creado_en, consentimientos_informados.creado_en,
--     documentos_clinicos.creado_en, fotografias.fecha_captura, signos_vitales.creado_en, referencias_medicas.creado_en,
--     odontograma_historial.creado_en, odontograma_piezas.actualizado_en, periodontograma_historial.creado_en,
--     periodontograma_piezas.actualizado_en, citas.inicio (solo COMPLETADAS).
--   fiscal: pagos.creado_en y pagos.anulado_en.   contractual: suscripciones.created_at/updated_at/fecha_fin, legal_acceptances.aceptado_en.
-- LIMPIEZA (Auth/Storage no comparten transacción con PostgreSQL: NO es atómica entre los tres sistemas): la lista completa de lo
--   pendiente se guarda en la auditoría en la MISMA transacción del borrado; la Edge Function registra lo que va limpiando
--   (fn_registrar_limpieza_clinica) y lo pendiente se consulta con fn_limpieza_pendiente_clinica. Los intentos rechazados se
--   registran con fn_registrar_intento_eliminacion. Las tres, como el resto, SOLO para service_role y con solicitante superadmin.
-- Seguro de re-ejecutar. No cambia datos.
-- ============================================================
begin;

create or replace function fn_politica_anios(p_clave text) returns integer
language sql stable security definer set search_path = public as $$
  select case when btrim(valor) ~ '^[0-9]{1,3}$' and btrim(valor)::int > 0 then btrim(valor)::int end from plataforma_config where clave = p_clave
$$;
revoke all on function fn_politica_anios(text) from public, anon, authenticated;

create or replace function fn_clinica_resumen_eliminacion(p_clinica uuid, p_solicitante uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_cl clinicas%rowtype;
  v_bloqueos jsonb := '[]'::jsonb;
  v_avisos jsonb := '[]'::jsonb;
  v_pacientes uuid[];
  v_conteos jsonb;
  v_conservado jsonb;
  v_ult_clin timestamptz; v_ult_fisc timestamptz; v_ult_contr timestamptz;
  v_a_clin integer := fn_politica_anios('retencion_expediente_anios');
  v_a_fisc integer := fn_politica_anios('retencion_fiscal_anios');
  v_a_contr integer := fn_politica_anios('retencion_contractual_anios');
  v_h_clin timestamptz; v_h_fisc timestamptz; v_h_contr timestamptz;
begin
  select * into v_cl from clinicas where id = p_clinica;
  if not found then
    return jsonb_build_object('existe', false, 'puede_eliminar', false,
      'bloqueos', jsonb_build_array(jsonb_build_object('codigo', 'CLINICA_NO_ENCONTRADA', 'mensaje', 'La clínica no existe.')));
  end if;
  select coalesce(array_agg(id), '{}') into v_pacientes from pacientes where clinica_id = p_clinica;

  -- Último registro CLÍNICO (NULL si no hay pacientes ni registros)
  select greatest(
    (select max(creado_en) from pacientes where clinica_id = p_clinica),
    (select max(archivado_en) from pacientes where clinica_id = p_clinica),
    (select max(e.actualizado_en) from expedientes e where e.paciente_id = any (v_pacientes)),
    (select max(n.creado_en) from notas_clinicas n join expedientes e on e.id = n.expediente_id where e.paciente_id = any (v_pacientes)),
    (select max(creado_en) from recetas where paciente_id = any (v_pacientes)),
    (select max(creado_en) from tratamientos where paciente_id = any (v_pacientes)),
    (select max(creado_en) from consentimientos_informados where paciente_id = any (v_pacientes)),
    (select max(creado_en) from documentos_clinicos where paciente_id = any (v_pacientes)),
    (select max(fecha_captura)::timestamptz from fotografias where paciente_id = any (v_pacientes)),
    (select max(creado_en) from signos_vitales where paciente_id = any (v_pacientes)),
    (select max(creado_en) from referencias_medicas where paciente_id = any (v_pacientes)),
    (select max(h.creado_en) from odontograma_historial h join odontograma_piezas p on p.id = h.pieza_id where p.paciente_id = any (v_pacientes)),
    (select max(p.actualizado_en) from odontograma_piezas p where p.paciente_id = any (v_pacientes)),
    (select max(h.creado_en) from periodontograma_historial h join periodontograma_piezas p on p.id = h.pieza_id where p.paciente_id = any (v_pacientes)),
    (select max(p.actualizado_en) from periodontograma_piezas p where p.paciente_id = any (v_pacientes)),
    (select max(inicio) from citas where paciente_id = any (v_pacientes) and estado = 'completada')
  ) into v_ult_clin;
  -- Último registro FISCAL (pagos y anulaciones) y CONTRACTUAL (suscripciones y aceptaciones legales)
  select greatest((select max(creado_en) from pagos where paciente_id = any (v_pacientes)), (select max(anulado_en) from pagos where paciente_id = any (v_pacientes))) into v_ult_fisc;
  select greatest((select max(created_at) from suscripciones where clinica_id = p_clinica), (select max(updated_at) from suscripciones where clinica_id = p_clinica),
                  (select max(fecha_fin)::timestamptz from suscripciones where clinica_id = p_clinica),
                  (select max(aceptado_en) from legal_acceptances where clinica_id = p_clinica or paciente_id = any (v_pacientes) or usuario_id in (select id from usuarios where clinica_id = p_clinica))) into v_ult_contr;
  if v_ult_clin is not null and v_a_clin is not null then v_h_clin := v_ult_clin + make_interval(years => v_a_clin); end if;
  if v_ult_fisc is not null and v_a_fisc is not null then v_h_fisc := v_ult_fisc + make_interval(years => v_a_fisc); end if;
  if v_ult_contr is not null and v_a_contr is not null then v_h_contr := v_ult_contr + make_interval(years => v_a_contr); end if;

  if v_cl.estado <> 'suspendida' then
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'NO_SUSPENDIDA', 'mensaje', 'La clínica está activa. Suspéndela primero (es reversible) y, si de verdad quieres borrarla, elimínala después.');
  end if;
  if exists (select 1 from usuarios where clinica_id = p_clinica and es_super_admin) then
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'TIENE_SUPERADMIN', 'mensaje', 'Esta clínica aloja una cuenta de superadministrador de la plataforma; eliminarla la borraría. Muévela o elimina esa cuenta aparte.');
  end if;
  if p_solicitante is not null and exists (select 1 from usuarios where id = p_solicitante and clinica_id = p_clinica) then
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'ES_TU_CLINICA', 'mensaje', 'No puedes eliminar la clínica a la que pertenece tu propia cuenta.');
  end if;

  -- CLÍNICA
  if v_ult_clin is not null and v_a_clin is null then
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'POLITICA_CONSERVACION_NO_DEFINIDA',
      'mensaje', 'La clínica tiene información clínica y la plataforma no tiene definida una política de conservación (parámetro retencion_expediente_anios). Mientras no se defina —con asesoría legal— los expedientes no se pueden eliminar definitivamente. Puedes suspender la clínica para revocar su acceso sin destruir nada.');
  elsif v_h_clin is not null and v_h_clin > now() then
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'DENTRO_PLAZO_CONSERVACION',
      'mensaje', format('La información clínica debe conservarse %s año(s) desde el último registro clínico (%s). No se puede eliminar hasta el %s. Mientras tanto la clínica puede permanecer suspendida.',
        v_a_clin, to_char(v_ult_clin at time zone 'UTC', 'DD/MM/YYYY'), to_char(v_h_clin at time zone 'UTC', 'DD/MM/YYYY')));
  end if;
  -- FISCAL (solo si hay pagos)
  if v_ult_fisc is not null and v_a_fisc is null then
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'POLITICA_FISCAL_NO_DEFINIDA',
      'mensaje', 'La clínica tiene pagos registrados y la plataforma no tiene definida una política de conservación fiscal (parámetro retencion_fiscal_anios). Mientras no se defina —con asesoría contable o legal— no se pueden eliminar. Puedes suspender la clínica.');
  elsif v_h_fisc is not null and v_h_fisc > now() then
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'DENTRO_PLAZO_FISCAL',
      'mensaje', format('Los registros de pagos deben conservarse %s año(s) desde el último pago o anulación (%s). No se puede eliminar hasta el %s.',
        v_a_fisc, to_char(v_ult_fisc at time zone 'UTC', 'DD/MM/YYYY'), to_char(v_h_fisc at time zone 'UTC', 'DD/MM/YYYY')));
  end if;
  -- CONTRACTUAL (bloquea solo si hay política; si no, se avisa)
  if v_ult_contr is not null and v_a_contr is null then
    v_avisos := v_avisos || jsonb_build_object('codigo', 'CONTRACTUAL_NO_EVALUADO',
      'mensaje', 'No hay política de conservación contractual (parámetro retencion_contractual_anios): no se evaluó la conservación de suscripciones y aceptaciones legales, que se eliminarán con la clínica.');
  elsif v_h_contr is not null and v_h_contr > now() then
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'DENTRO_PLAZO_CONTRACTUAL',
      'mensaje', format('Las suscripciones y aceptaciones legales deben conservarse %s año(s) desde su última actividad (%s). No se puede eliminar hasta el %s.',
        v_a_contr, to_char(v_ult_contr at time zone 'UTC', 'DD/MM/YYYY'), to_char(v_h_contr at time zone 'UTC', 'DD/MM/YYYY')));
  end if;
  -- Obligaciones pendientes (con o sin datos)
  if exists (select 1 from arco_solicitudes where clinica_id = p_clinica and estado in ('recibida', 'en_revision', 'requiere_informacion', 'aprobada')) then
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'ARCO_PENDIENTE', 'mensaje', 'Hay solicitudes ARCO (acceso, rectificación, cancelación u oposición) sin resolver. Deben atenderse antes de eliminar la clínica.');
  end if;
  if exists (select 1 from incidentes_seguridad where clinica_id = p_clinica and estado in ('detectado', 'en_investigacion', 'contenido')) then
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'INCIDENTE_ABIERTO', 'mensaje', 'Hay un incidente de seguridad sin resolver relacionado con esta clínica. Debe cerrarse antes de eliminarla.');
  end if;

  v_conteos := jsonb_build_object(
    'usuarios', (select count(*) from usuarios where clinica_id = p_clinica), 'pacientes', cardinality(v_pacientes),
    'citas', (select count(*) from citas where paciente_id = any (v_pacientes)), 'tratamientos', (select count(*) from tratamientos where paciente_id = any (v_pacientes)),
    'pagos', (select count(*) from pagos where paciente_id = any (v_pacientes)),
    'notas_clinicas', (select count(*) from notas_clinicas n join expedientes e on e.id = n.expediente_id where e.paciente_id = any (v_pacientes)),
    'recetas', (select count(*) from recetas where paciente_id = any (v_pacientes)), 'consentimientos', (select count(*) from consentimientos_informados where paciente_id = any (v_pacientes)),
    'fotografias', (select count(*) from fotografias where paciente_id = any (v_pacientes)), 'documentos_clinicos', (select count(*) from documentos_clinicos where paciente_id = any (v_pacientes)),
    'sucursales', (select count(*) from sucursales where clinica_id = p_clinica));
  v_conservado := jsonb_build_object('auditoria', (select count(*) from auditoria where clinica_id = p_clinica),
    'solicitudes_arco', (select count(*) from arco_solicitudes where clinica_id = p_clinica), 'incidentes_seguridad', (select count(*) from incidentes_seguridad where clinica_id = p_clinica));

  return jsonb_build_object('existe', true, 'nombre', v_cl.nombre, 'estado', v_cl.estado,
    'conteos', v_conteos, 'se_conserva', v_conservado,
    -- claves históricas (la interfaz de la 087 las usa): categoría clínica
    'politica_anios', v_a_clin, 'ultimo_registro_clinico', v_ult_clin, 'conservar_hasta', v_h_clin,
    'conservacion', jsonb_build_object(
      'clinico', jsonb_build_object('politica_anios', v_a_clin, 'ultimo_registro', v_ult_clin, 'conservar_hasta', v_h_clin),
      'fiscal', jsonb_build_object('politica_anios', v_a_fisc, 'ultimo_registro', v_ult_fisc, 'conservar_hasta', v_h_fisc),
      'contractual', jsonb_build_object('politica_anios', v_a_contr, 'ultimo_registro', v_ult_contr, 'conservar_hasta', v_h_contr)),
    'advertencias', v_avisos, 'bloqueos', v_bloqueos, 'puede_eliminar', jsonb_array_length(v_bloqueos) = 0);
end;
$$;

create or replace function fn_eliminar_clinica(p_clinica uuid, p_solicitante uuid, p_confirmar_nombre text, p_confirmar_datos_clinicos boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_resumen jsonb;
  v_nombre text;
  v_fotos jsonb; v_docs jsonb; v_logos jsonb; v_cuentas jsonb;
  v_n_pacientes integer;
begin
  -- 1) Autorización: solo un superadmin (la Edge Function ya lo verificó; aquí se vuelve a exigir).
  if p_solicitante is null or not coalesce((select es_super_admin from usuarios where id = p_solicitante), false) then
    raise exception 'Solo un superadministrador de la plataforma puede eliminar una clínica.' using errcode = 'P0001', hint = 'NO_AUTORIZADO';
  end if;

  -- 2) La clínica, bloqueada: nadie la modifica mientras se decide y se borra.
  perform 1 from clinicas where id = p_clinica for update;
  v_resumen := fn_clinica_resumen_eliminacion(p_clinica, p_solicitante);
  if not (v_resumen ->> 'existe')::boolean then
    raise exception 'La clínica no existe.' using errcode = 'P0001', hint = 'CLINICA_NO_ENCONTRADA';
  end if;

  -- 3) Comprobaciones previas: si algo lo impide, se dice QUÉ y no se borra nada.
  if not (v_resumen ->> 'puede_eliminar')::boolean then
    raise exception '%', (select string_agg(b ->> 'mensaje', ' ') from jsonb_array_elements(v_resumen -> 'bloqueos') b)
      using errcode = 'P0001', hint = 'ELIMINACION_BLOQUEADA';
  end if;
  v_nombre := v_resumen ->> 'nombre';
  if btrim(coalesce(p_confirmar_nombre, '')) <> v_nombre then
    raise exception 'El nombre no coincide: escribe el nombre exacto de la clínica para confirmar.' using errcode = 'P0001', hint = 'NOMBRE_NO_COINCIDE';
  end if;
  v_n_pacientes := (v_resumen -> 'conteos' ->> 'pacientes')::int;
  if v_n_pacientes > 0 and not coalesce(p_confirmar_datos_clinicos, false) then
    raise exception 'La clínica tiene % paciente(s) con información clínica. Confirma explícitamente que se destruirá de forma permanente.', v_n_pacientes
      using errcode = 'P0001', hint = 'CONFIRMACION_DATOS_CLINICOS';
  end if;

  -- 4) Lo que la base NO puede borrar por sí sola: se anota ANTES de borrar (después ya no habría de dónde sacarlo).
  select coalesce(jsonb_agg(o.name), '[]'::jsonb) into v_fotos from storage.objects o
   where o.bucket_id = 'fotos-clinicas' and (storage.foldername(o.name))[1] in (select id::text from pacientes where clinica_id = p_clinica);
  select coalesce(jsonb_agg(o.name), '[]'::jsonb) into v_docs from storage.objects o
   where o.bucket_id = 'documentos-clinicos' and (storage.foldername(o.name))[1] in (select id::text from pacientes where clinica_id = p_clinica);
  select coalesce(jsonb_agg(o.name), '[]'::jsonb) into v_logos from storage.objects o
   where o.bucket_id = 'logos-clinicas' and (storage.foldername(o.name))[1] = p_clinica::text;
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_cuentas from usuarios where clinica_id = p_clinica;

  -- 5) El borrado, en el orden que respeta las FK (todo o nada: cualquier error deshace TODO).
  -- Las aceptaciones legales primero: su FK a pacientes/usuarios es SET NULL pero tiene CHECK (usuario_id O paciente_id no
  -- nulo), así que al borrar al paciente o al usuario quedarían inválidas y TODO el borrado fallaría.
  delete from legal_acceptances where clinica_id = p_clinica
     or paciente_id in (select id from pacientes where clinica_id = p_clinica)
     or usuario_id in (select id from usuarios where clinica_id = p_clinica);
  delete from pacientes where clinica_id = p_clinica;            -- cascada: expediente, notas, tratamientos, odontograma, citas, pagos…
  delete from catalogo_tratamientos where clinica_id = p_clinica;
  delete from horarios_bloqueados where clinica_id = p_clinica;
  delete from lista_espera where clinica_id = p_clinica;
  delete from usuarios where clinica_id = p_clinica;             -- las filas; las cuentas de Auth las borra la Edge Function
  delete from clinicas where id = p_clinica;                     -- cascada: sucursales, suscripciones, legal…; SET NULL: auditoría, ARCO, incidentes

  -- 6) Constancia (sobrevive a la clínica). El solicitante es quien responde.
  insert into auditoria (usuario_id, accion, entidad, entidad_id, detalle)
  values (p_solicitante, 'eliminar_clinica', 'clinicas', p_clinica,
          jsonb_build_object('nombre', v_nombre, 'conteos', v_resumen -> 'conteos', 'se_conserva', v_resumen -> 'se_conserva',
                             -- Lo que se evaluó en el SERVIDOR al decidir (políticas, fechas y avisos): para poder investigar después.
                             'conservacion', v_resumen -> 'conservacion', 'advertencias', v_resumen -> 'advertencias',
                             'confirmo_datos_clinicos', coalesce(p_confirmar_datos_clinicos, false),
                             -- LAS LISTAS COMPLETAS de lo que la base no puede borrar (Storage y Auth), guardadas en la MISMA transacción: si la
                             -- Edge Function se interrumpe tras el commit, nada se pierde y se puede reanudar (fn_limpieza_pendiente_clinica).
                             'limpieza', jsonb_build_object('estado', 'pendiente',
                                'archivos', jsonb_build_object('fotos-clinicas', v_fotos, 'documentos-clinicos', v_docs, 'logos-clinicas', v_logos),
                                'cuentas_auth', v_cuentas),
                             'via', 'fn_eliminar_clinica'));

  return jsonb_build_object('ok', true, 'nombre', v_nombre, 'conteos', v_resumen -> 'conteos', 'se_conserva', v_resumen -> 'se_conserva',
    'rutas_storage', jsonb_build_object('fotos-clinicas', v_fotos, 'documentos-clinicos', v_docs, 'logos-clinicas', v_logos),
    'cuentas_auth', v_cuentas);
end;
$$;

-- Lo que falta limpiar de una clínica ya eliminada: la lista ORIGINAL (guardada en la auditoría, en la transacción del borrado)
-- menos lo registrado como limpiado.
create or replace function fn_limpieza_pendiente_clinica(p_clinica uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_orig jsonb; v_bucket text; v_archivos jsonb := '{}'::jsonb; v_cuentas jsonb; v_total integer := 0; v_lista jsonb;
begin
  select detalle -> 'limpieza' into v_orig from auditoria
   where accion = 'eliminar_clinica' and entidad = 'clinicas' and entidad_id = p_clinica order by creado_en desc, id desc limit 1;
  if v_orig is null then return jsonb_build_object('existe', false); end if;
  for v_bucket in select jsonb_object_keys(v_orig -> 'archivos') loop
    select coalesce(jsonb_agg(x.ruta order by x.ruta), '[]'::jsonb) into v_lista
      from jsonb_array_elements_text(v_orig -> 'archivos' -> v_bucket) as x(ruta)
     where x.ruta not in (select jsonb_array_elements_text(coalesce(d.detalle -> 'archivos_borrados' -> v_bucket, '[]'::jsonb))
                            from auditoria d where d.accion = 'limpieza_eliminar_clinica' and d.entidad_id = p_clinica);
    v_archivos := v_archivos || jsonb_build_object(v_bucket, v_lista);
    v_total := v_total + jsonb_array_length(v_lista);
  end loop;
  select coalesce(jsonb_agg(x.id order by x.id), '[]'::jsonb) into v_cuentas
    from jsonb_array_elements_text(v_orig -> 'cuentas_auth') as x(id)
   where x.id not in (select jsonb_array_elements_text(coalesce(d.detalle -> 'cuentas_borradas', '[]'::jsonb))
                        from auditoria d where d.accion = 'limpieza_eliminar_clinica' and d.entidad_id = p_clinica);
  v_total := v_total + jsonb_array_length(v_cuentas);
  return jsonb_build_object('existe', true, 'pendiente', jsonb_build_object('archivos', v_archivos, 'cuentas_auth', v_cuentas),
                            'total_pendiente', v_total, 'limpieza_completa', v_total = 0);
end;
$$;

-- La Edge Function anota aquí lo que SÍ logró limpiar y lo que falló. Solo se aceptan elementos de la lista original (nadie puede
-- "marcar como limpio" algo ajeno) y solo un superadmin. Devuelve lo que sigue pendiente.
create or replace function fn_registrar_limpieza_clinica(p_clinica uuid, p_solicitante uuid, p_archivos_borrados jsonb default '{}'::jsonb,
                                                          p_cuentas_borradas jsonb default '[]'::jsonb, p_fallos jsonb default '[]'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_orig jsonb; v_bucket text; v_ruta text; v_id text;
begin
  if p_solicitante is null or not coalesce((select es_super_admin from usuarios where id = p_solicitante), false) then
    raise exception 'Solo un superadministrador de la plataforma puede registrar la limpieza de una clínica eliminada.' using errcode = 'P0001', hint = 'NO_AUTORIZADO';
  end if;
  select detalle -> 'limpieza' into v_orig from auditoria
   where accion = 'eliminar_clinica' and entidad = 'clinicas' and entidad_id = p_clinica order by creado_en desc, id desc limit 1;
  if v_orig is null then
    raise exception 'No hay una eliminación registrada de esa clínica.' using errcode = 'P0001', hint = 'SIN_ELIMINACION_REGISTRADA';
  end if;
  for v_bucket in select jsonb_object_keys(coalesce(p_archivos_borrados, '{}'::jsonb)) loop
    for v_ruta in select jsonb_array_elements_text(p_archivos_borrados -> v_bucket) loop
      if not coalesce(v_orig -> 'archivos' -> v_bucket, '[]'::jsonb) ? v_ruta then
        raise exception 'Un archivo indicado no pertenece a la limpieza pendiente de esa clínica.' using errcode = 'P0001', hint = 'ITEM_AJENO';
      end if;
    end loop;
  end loop;
  for v_id in select jsonb_array_elements_text(coalesce(p_cuentas_borradas, '[]'::jsonb)) loop
    if not coalesce(v_orig -> 'cuentas_auth', '[]'::jsonb) ? v_id then
      raise exception 'Una cuenta indicada no pertenece a la limpieza pendiente de esa clínica.' using errcode = 'P0001', hint = 'ITEM_AJENO';
    end if;
  end loop;
  insert into auditoria (usuario_id, accion, entidad, entidad_id, detalle)
  values (p_solicitante, 'limpieza_eliminar_clinica', 'clinicas', p_clinica,
          jsonb_build_object('archivos_borrados', coalesce(p_archivos_borrados, '{}'::jsonb), 'cuentas_borradas', coalesce(p_cuentas_borradas, '[]'::jsonb), 'fallos', coalesce(p_fallos, '[]'::jsonb)));
  return fn_limpieza_pendiente_clinica(p_clinica);
end;
$$;

-- Un intento RECHAZADO deja rastro (el rechazo revierte lo que la propia función hubiera escrito, por eso se registra aparte).
create or replace function fn_registrar_intento_eliminacion(p_clinica uuid, p_solicitante uuid, p_codigo text, p_mensaje text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_solicitante is null or not coalesce((select es_super_admin from usuarios where id = p_solicitante), false) then
    raise exception 'Solo un superadministrador de la plataforma puede registrar intentos de eliminación.' using errcode = 'P0001', hint = 'NO_AUTORIZADO';
  end if;
  insert into auditoria (usuario_id, accion, entidad, entidad_id, detalle)
  values (p_solicitante, 'intento_eliminar_clinica_rechazado', 'clinicas', p_clinica, jsonb_build_object('codigo', left(coalesce(p_codigo, ''), 100), 'mensaje', left(coalesce(p_mensaje, ''), 1000)));
  return jsonb_build_object('ok', true);
end;
$$;

-- Solo la Edge Function (service_role). NADIE más: ni anónimos, ni authenticated (un propietario incluido), ni public.
revoke all on function fn_clinica_resumen_eliminacion(uuid, uuid) from public, anon, authenticated;
revoke all on function fn_eliminar_clinica(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function fn_limpieza_pendiente_clinica(uuid) from public, anon, authenticated;
revoke all on function fn_registrar_limpieza_clinica(uuid, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function fn_registrar_intento_eliminacion(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function fn_clinica_resumen_eliminacion(uuid, uuid) to service_role;
grant execute on function fn_eliminar_clinica(uuid, uuid, text, boolean) to service_role;
grant execute on function fn_limpieza_pendiente_clinica(uuid) to service_role;
grant execute on function fn_registrar_limpieza_clinica(uuid, uuid, jsonb, jsonb, jsonb) to service_role;
grant execute on function fn_registrar_intento_eliminacion(uuid, uuid, text, text) to service_role;

commit;
