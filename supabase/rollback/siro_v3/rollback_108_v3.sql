-- ROLLBACK 108 v3 (v5, 16/10) = rollback_108_v2.sql con UNA sola línea cambiada (la 328 del v2, +2 por esta cabecera): 'grant all' en lugar de
-- 'grant select, insert, update, delete'. Defecto del v2 demostrado en v5 (CADENA): no devolvía TRUNCATE/REFERENCES/TRIGGER a service_role sobre politicas_conservacion.
-- ============================================================
-- ROLLBACK REVISADO del CANDIDATO 108 (v2) — ESTADO: candidato, NO ejecutado. No integrar sin autorización.
-- Corrige la debilidad de rollback_108.sql (v1): aquella re-ejecutaba 089, 104 y 107 en TRANSACCIONES SEPARADAS; si la 107 fallaba en
-- medio, quedaba el disparador de pacientes de la 104 (que sale con siro.supresion_autorizada antes de mirar la retención).
-- v2: TODO en UNA transacción; NO re-ejecuta 104 ni 107 (no toca ninguna protección de 107); restaura SOLO las 6 funciones que 108
-- redefinió, con su texto LITERAL de 089/104; retira lo que solo existe en 108; bloquea las tablas de registro mientras comprueba;
-- y verifica al final que las protecciones de 107 siguen activas. Cualquier error deshace TODO (no hay estado intermedio).
-- SE DETIENE si hay CUALQUIER eliminación registrada (listas de limpieza pendientes o históricas = evidencia).
-- Consecuencia conocida de deshacer 108 (no del rollback en sí): vuelven la regla de plazos con legado (H06/H07) y la limpieza
-- dirigida por `auditoria` (H10). Por eso deshacer 108 requiere una decisión expresa (D7).
-- ============================================================
\set ON_ERROR_STOP on
begin;
do $pre$ begin
  if to_regclass('public.retenciones_legales_archivo') is null then
    raise exception 'ROLLBACK 108 DETENIDO: la 107 no está aplicada; este rollback presupone 107 y no la toca.';
  end if;
  if to_regclass('public.eliminaciones_clinica') is null or to_regclass('public.eliminaciones_clinica_limpieza') is null then
    raise exception 'ROLLBACK 108 DETENIDO: las tablas de 108 no existen (¿108 no aplicada o ya retirada?). No se hace nada.';
  end if;
  -- Nadie escribe en los registros mientras se comprueba y se retiran (se libera al COMMIT o ROLLBACK).
  execute 'lock table public.eliminaciones_clinica, public.eliminaciones_clinica_limpieza in access exclusive mode';
  if exists (select 1 from public.eliminaciones_clinica) or exists (select 1 from public.eliminaciones_clinica_limpieza) then
    raise exception 'ROLLBACK 108 DETENIDO: hay % eliminación(es) y % registro(s) de limpieza. Son la única fuente confiable de la limpieza pendiente y evidencia de lo eliminado. Respáldalos y decide expresamente antes de retirar 108.',
      (select count(*) from public.eliminaciones_clinica), (select count(*) from public.eliminaciones_clinica_limpieza);
  end if;
end $pre$;
-- ---- Definición LITERAL de supabase/migrations/089_sirso_conservacion_por_categorias_y_limpieza.sql (última definición de fn_clinica_resumen_eliminacion en ese archivo) ----
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

-- ---- Definición LITERAL de supabase/migrations/089_sirso_conservacion_por_categorias_y_limpieza.sql (última definición de fn_limpieza_pendiente_clinica en ese archivo) ----
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

-- ---- Definición LITERAL de supabase/migrations/089_sirso_conservacion_por_categorias_y_limpieza.sql (última definición de fn_registrar_limpieza_clinica en ese archivo) ----
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

-- ---- Definición LITERAL de supabase/migrations/104_sirso_politica_conservacion_y_retencion_legal.sql (última definición de fn_plazo_expediente_anios en ese archivo) ----
create or replace function fn_plazo_expediente_anios() returns integer language sql stable security definer set search_path = public as $$
  select case when v >= coalesce((select plazo_minimo_anios from politicas_conservacion where categoria = 'expediente_clinico'), 5) then v end
  from (select coalesce((select plazo_anios from politicas_conservacion where categoria = 'expediente_clinico'), fn_politica_anios('retencion_expediente_anios')) v) s
$$;

-- ---- Definición LITERAL de supabase/migrations/104_sirso_politica_conservacion_y_retencion_legal.sql (última definición de fn_conservacion_paciente en ese archivo) ----
create or replace function fn_conservacion_paciente(p_paciente uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_clinica uuid; v_ultimo timestamptz; v_plazo integer; v_registros boolean; v_hold boolean; v_vence timestamptz; v_puede boolean; v_motivo text;
begin
  select clinica_id into v_clinica from pacientes where id = p_paciente;
  if v_clinica is null then return jsonb_build_object('error', 'PACIENTE_NO_ENCONTRADO'); end if;
  v_ultimo := fn_ultimo_acto_medico(p_paciente); v_plazo := fn_plazo_expediente_anios(); v_registros := fn_paciente_tiene_registros_clinicos(p_paciente); v_hold := fn_retencion_legal_activa(v_clinica, p_paciente);
  v_vence := case when v_ultimo is not null and v_plazo is not null then v_ultimo + make_interval(years => v_plazo) end;
  if v_hold then v_puede := false; v_motivo := 'RETENCION_LEGAL_ACTIVA';
  elsif not v_registros then v_puede := true; v_motivo := null;
  elsif v_plazo is null then v_puede := false; v_motivo := 'PLAZO_CLINICO_NO_DEFINIDO';
  elsif v_ultimo is null or v_vence > now() then v_puede := false; v_motivo := 'DENTRO_DEL_PLAZO_DE_CONSERVACION';
  else v_puede := true; v_motivo := null; end if;
  return jsonb_build_object('ultimo_acto_medico', v_ultimo, 'plazo_anios', v_plazo, 'conservar_hasta', v_vence, 'tiene_registros_clinicos', v_registros, 'retencion_legal_activa', v_hold, 'puede_suprimirse', v_puede, 'motivo_bloqueo', v_motivo);
end;
$$;

-- ---- Definición LITERAL de supabase/migrations/104_sirso_politica_conservacion_y_retencion_legal.sql (última definición de fn_eliminar_clinica en ese archivo) ----
CREATE OR REPLACE FUNCTION public.fn_eliminar_clinica(p_clinica uuid, p_solicitante uuid, p_confirmar_nombre text, p_confirmar_datos_clinicos boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  perform set_config('siro.supresion_autorizada', 'on', true);   -- (104) autoriza el borrado de pacientes SOLO dentro de esta función, que ya verificó plazos, ARCO y confirmaciones
  delete from pacientes where clinica_id = p_clinica;            -- cascada: expediente, notas, tratamientos, odontograma, citas, pagos…
  perform set_config('siro.supresion_autorizada', 'off', true);
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
$function$;


-- ---- Privilegios tal como los dejaban 089/104 ----
revoke all on function fn_clinica_resumen_eliminacion(uuid, uuid) from public, anon, authenticated;
grant execute on function fn_clinica_resumen_eliminacion(uuid, uuid) to service_role;
revoke all on function fn_limpieza_pendiente_clinica(uuid) from public, anon, authenticated;
grant execute on function fn_limpieza_pendiente_clinica(uuid) to service_role;
revoke all on function fn_registrar_limpieza_clinica(uuid, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function fn_registrar_limpieza_clinica(uuid, uuid, jsonb, jsonb, jsonb) to service_role;
revoke all on function fn_eliminar_clinica(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function fn_eliminar_clinica(uuid, uuid, text, boolean) to service_role;
revoke all on function fn_plazo_expediente_anios() from public, anon, authenticated;
grant execute on function fn_plazo_expediente_anios() to service_role;        -- 104 no la revocaba a service_role (permiso por defecto)
revoke all on function fn_conservacion_paciente(uuid) from public, anon, authenticated;
grant execute on function fn_conservacion_paciente(uuid) to service_role;     -- ídem
grant all on public.politicas_conservacion to service_role;   -- estado de 104 (108 lo revocaba)

-- ---- Objetos que solo existen en 108 (tablas VACÍAS: comprobado arriba bajo bloqueo exclusivo) ----
drop trigger if exists trg_bloquear_reuso_cuenta_eliminada on public.usuarios;
drop function if exists public.fn_bloquear_reuso_cuenta_eliminada();
drop function if exists public.fn_cuenta_auth_eliminable(uuid, uuid);
drop function if exists public.fn_cuenta_pendiente_de_eliminacion(uuid);
drop table public.eliminaciones_clinica_limpieza;   -- sin IF EXISTS: si no está, algo es incoherente y se aborta todo
drop table public.eliminaciones_clinica;
drop function if exists public.fn_evaluar_contractual();
drop function if exists public.fn_evaluar_fiscal();
drop function if exists public.fn_evaluar_politica(text);
drop function if exists public.fn_conservacion_decision(text);

-- ---- Verificación final DENTRO de la transacción: las protecciones de 107 siguen intactas ----
do $post$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_proteger_retencion_legal' and not tgisinternal and tgenabled <> 'D')
     or not exists (select 1 from pg_trigger where tgname = 'trg_proteger_paciente_conservacion' and tgenabled <> 'D')
     or not exists (select 1 from pg_trigger where tgname = 'trg_proteger_clinica_retencion' and tgenabled <> 'D')
     or position('fn_archivar_retenciones_liberadas' in pg_get_functiondef('public.fn_proteger_paciente_conservacion()'::regprocedure)) = 0
     or exists (select 1 from pg_constraint where conrelid = 'public.retenciones_legales'::regclass and contype = 'f' and confdeltype = 'c') then
    raise exception 'ROLLBACK 108 ABORTADO: las protecciones de 107 no están intactas tras el rollback; se deshace todo.';
  end if;
end $post$;
commit;