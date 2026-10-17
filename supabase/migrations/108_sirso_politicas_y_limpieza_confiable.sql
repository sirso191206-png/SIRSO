-- ============================================================
-- SIRO — CANDIDATO 108: una sola regla de conservación (R2) y limpieza de Auth/Storage desde un registro confiable (R3)
-- ESTADO: CANDIDATO NO APROBADO, NO EJECUTADO. No integrar en supabase/migrations sin autorización expresa.
-- REQUIERE: 104 y el candidato 107.
-- ------------------------------------------------------------
-- DEFECTOS QUE CORRIGE:
--  D-R2-a 104:155-158 fn_plazo_expediente_anios acepta el valor LEGADO de plataforma_config sin aprobación ni historial.
--  D-R2-b 104:155-158 ignora estado_aprobacion: una política PENDIENTE_DE_ABOGADO autoriza borrar.
--  D-R2-c 089:38-41,54-56 la eliminación de clínicas usa SOLO los valores legados (sin piso, sin política): dos reglas distintas.
--  D-R2-d 104:130-142,161-175 la supresión de un paciente no evalúa lo fiscal (pagos).
--  D-R2-e 104:80 service_role puede modificar politicas_conservacion directamente (sin motivo ni actor).
--  D-R3-a 089:246-247,277-278 la lista de archivos/cuentas a borrar se lee de `auditoria`, insertable por usuarios (antes de 100) y
--         por service_role siempre; las filas `limpieza_eliminar_clinica` (también falsificables) ocultan pendientes.
--  D-R3-b la lista de cuentas no se contrasta con su uso actual: una cuenta re-vinculada a `usuarios` se borraría (cascada 001:26).
-- DECISIONES QUE ESTE CANDIDATO NO TOMA (sin valor por omisión: mientras no se configuren, se BLOQUEA con un código explícito):
--  plataforma_config.conservacion_aprobaciones_validas   = 'ABOGADO' | 'ABOGADO_O_RESPONSABLE'               (D2)
--  plataforma_config.conservacion_categorias_fiscales    = lista separada por comas de: pagos, documentacion_fiscal_contable,
--                                                          facturas, comprobantes                                (D3)
--  plataforma_config.conservacion_contractual_bloquea    = 'si' | 'no'                                           (D4)
--  Los valores LEGADOS (retencion_*_anios) ya no autorizan nada: solo se informan como aviso                     (D5)
-- INVARIANTES:
--  I5 La vista previa y la eliminación de la clínica, la evaluación y la supresión del paciente usan las MISMAS funciones de evaluación.
--  I6 Una política ausente, nula, pendiente, inferior al mínimo o una decisión no configurada BLOQUEA con un código propio.
--  I7 La lista de lo que se limpia en Auth/Storage solo la escribe fn_eliminar_clinica, en la MISMA transacción del borrado,
--     en una tabla que ningún rol de aplicación (ni service_role) puede escribir; nunca se lee de `auditoria`.
--  I8 Una cuenta se borra de Auth solo si: está en esa lista, ya no tiene fila en `usuarios`, existía antes de la eliminación,
--     y mientras esté pendiente no puede volver a tener fila en `usuarios` (lápida).
-- Re-ejecutable. Rollback: rollback_108.sql (se NIEGA si hay eliminaciones registradas).
-- ============================================================
begin;

do $$ begin
  if to_regclass('public.retenciones_legales_archivo') is null then raise exception '108 requiere el candidato 107 aplicado.'; end if;
end $$;

-- =====================  R2: evaluación única de políticas  =====================
create or replace function public.fn_conservacion_decision(p_clave text) returns text
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select nullif(btrim(pc.valor), '') from public.plataforma_config pc where pc.clave = p_clave
$$;
revoke all on function public.fn_conservacion_decision(text) from public, anon, authenticated, service_role;

create or replace function public.fn_evaluar_politica(p_categoria text) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  r public.politicas_conservacion%rowtype;
  v_aprob text := public.fn_conservacion_decision('conservacion_aprobaciones_validas');
  v_validos text[];
  v_clave text;
  v_legado integer;
  v_avisos jsonb := '[]'::jsonb;
begin
  v_clave := case p_categoria when 'expediente_clinico' then 'retencion_expediente_anios'
                              when 'pagos' then 'retencion_fiscal_anios'
                              when 'documentacion_fiscal_contable' then 'retencion_fiscal_anios'
                              when 'contratos' then 'retencion_contractual_anios' end;
  if v_clave is not null then v_legado := public.fn_politica_anios(v_clave); end if;
  select * into r from public.politicas_conservacion where categoria = p_categoria;
  if not found then
    return jsonb_build_object('categoria', p_categoria, 'ok', false, 'codigo', 'POLITICA_CATEGORIA_INEXISTENTE', 'avisos', v_avisos);
  end if;
  if v_legado is not null then
    v_avisos := v_avisos || jsonb_build_object('valor_legado', v_legado, 'codigo',
      case when v_legado < coalesce(r.plazo_minimo_anios, 1) then 'LEGADO_INFERIOR_AL_MINIMO'
           when r.plazo_anios is null then 'LEGADO_NO_ADMITIDO'
           when v_legado <> r.plazo_anios then 'LEGADO_DISCREPANTE'
           else 'LEGADO_IGNORADO' end);
  end if;
  if p_categoria = 'expediente_clinico' and r.plazo_minimo_anios is null then
    return jsonb_build_object('categoria', p_categoria, 'ok', false, 'codigo', 'POLITICA_MINIMO_AUSENTE', 'avisos', v_avisos);
  end if;
  if r.plazo_anios is null then
    return jsonb_build_object('categoria', p_categoria, 'ok', false, 'codigo', 'POLITICA_NO_DEFINIDA', 'avisos', v_avisos);
  end if;
  if r.plazo_anios < coalesce(r.plazo_minimo_anios, 1) then
    return jsonb_build_object('categoria', p_categoria, 'ok', false, 'codigo', 'POLITICA_INFERIOR_AL_MINIMO', 'avisos', v_avisos);
  end if;
  v_validos := case v_aprob when 'ABOGADO' then array['APROBADA_POR_ABOGADO']
                            when 'ABOGADO_O_RESPONSABLE' then array['APROBADA_POR_ABOGADO', 'APROBADA_POR_RESPONSABLE'] end;
  if v_validos is null then
    return jsonb_build_object('categoria', p_categoria, 'ok', false, 'codigo', 'DECISION_APROBACION_NO_CONFIGURADA', 'avisos', v_avisos);
  end if;
  if not (r.estado_aprobacion = any (v_validos)) then
    return jsonb_build_object('categoria', p_categoria, 'ok', false, 'codigo', 'POLITICA_PENDIENTE_DE_APROBACION', 'estado', r.estado_aprobacion, 'avisos', v_avisos);
  end if;
  return jsonb_build_object('categoria', p_categoria, 'ok', true, 'anios', r.plazo_anios, 'estado', r.estado_aprobacion, 'fuente', 'politica', 'avisos', v_avisos);
end $$;
revoke all on function public.fn_evaluar_politica(text) from public, anon, authenticated, service_role;

create or replace function public.fn_evaluar_fiscal() returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_cats text[]; c text; e jsonb; v_max integer; v_avisos jsonb := '[]'::jsonb;
begin
  v_cats := string_to_array(replace(coalesce(public.fn_conservacion_decision('conservacion_categorias_fiscales'), ''), ' ', ''), ',');
  v_cats := array(select x from unnest(v_cats) x where x <> '');
  if cardinality(v_cats) = 0 then
    return jsonb_build_object('ok', false, 'codigo', 'DECISION_FISCAL_NO_CONFIGURADA');
  end if;
  if exists (select 1 from unnest(v_cats) x where x not in ('pagos', 'documentacion_fiscal_contable', 'facturas', 'comprobantes')) then
    return jsonb_build_object('ok', false, 'codigo', 'DECISION_FISCAL_INVALIDA');
  end if;
  foreach c in array v_cats loop
    e := public.fn_evaluar_politica(c);
    v_avisos := v_avisos || coalesce(e -> 'avisos', '[]'::jsonb);
    if not (e ->> 'ok')::boolean then return e || jsonb_build_object('categoria', c, 'avisos', v_avisos); end if;
    v_max := greatest(coalesce(v_max, 0), (e ->> 'anios')::integer);
  end loop;
  return jsonb_build_object('ok', true, 'anios', v_max, 'categorias', to_jsonb(v_cats), 'avisos', v_avisos);
end $$;
revoke all on function public.fn_evaluar_fiscal() from public, anon, authenticated, service_role;

-- Contractual: 'si' → obligatoria (como la clínica); 'no' → solo aviso si no está en regla; sin configurar → bloquea.
create or replace function public.fn_evaluar_contractual() returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare v text := public.fn_conservacion_decision('conservacion_contractual_bloquea'); e jsonb;
begin
  if v is null or v not in ('si', 'no') then
    return jsonb_build_object('ok', false, 'obligatoria', true, 'codigo', 'DECISION_CONTRACTUAL_NO_CONFIGURADA');
  end if;
  e := public.fn_evaluar_politica('contratos');
  return e || jsonb_build_object('obligatoria', v = 'si');
end $$;
revoke all on function public.fn_evaluar_contractual() from public, anon, authenticated, service_role;

-- Compatibilidad: quien aún llame a fn_plazo_expediente_anios obtiene NULL salvo política válida y aprobada.
create or replace function public.fn_plazo_expediente_anios() returns integer
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select case when (e ->> 'ok')::boolean then (e ->> 'anios')::integer end from (select public.fn_evaluar_politica('expediente_clinico') e) s
$$;
revoke all on function public.fn_plazo_expediente_anios() from public, anon, authenticated, service_role;

-- Paciente: misma evaluación + lo fiscal si tiene pagos.
create or replace function public.fn_conservacion_paciente(p_paciente uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  v_clinica uuid; v_ultimo timestamptz; v_registros boolean; v_hold boolean; v_clin jsonb; v_fis jsonb;
  v_ult_pago timestamptz; v_plazo integer; v_vence timestamptz; v_vence_f timestamptz; v_bloqueos jsonb := '[]'::jsonb;
begin
  select clinica_id into v_clinica from public.pacientes where id = p_paciente;
  if v_clinica is null then return jsonb_build_object('error', 'PACIENTE_NO_ENCONTRADO'); end if;
  v_ultimo := public.fn_ultimo_acto_medico(p_paciente);
  v_registros := public.fn_paciente_tiene_registros_clinicos(p_paciente);
  v_hold := public.fn_retencion_legal_activa(v_clinica, p_paciente);
  v_clin := public.fn_evaluar_politica('expediente_clinico');
  if (v_clin ->> 'ok')::boolean then v_plazo := (v_clin ->> 'anios')::integer; end if;
  if v_hold then v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'RETENCION_LEGAL_ACTIVA'); end if;
  if v_registros then
    if not (v_clin ->> 'ok')::boolean then
      v_bloqueos := v_bloqueos || jsonb_build_object('codigo', v_clin ->> 'codigo', 'categoria', 'expediente_clinico');
    elsif v_ultimo is null then
      v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'SIN_FECHA_DE_ULTIMO_ACTO');
    else
      v_vence := v_ultimo + make_interval(years => v_plazo);
      if v_vence > now() then v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'DENTRO_PLAZO_CONSERVACION'); end if;
    end if;
  end if;
  select greatest(max(pg.creado_en), max(pg.anulado_en)) into v_ult_pago from public.pagos pg where pg.paciente_id = p_paciente;
  if v_ult_pago is not null then
    v_fis := public.fn_evaluar_fiscal();
    if not (v_fis ->> 'ok')::boolean then
      v_bloqueos := v_bloqueos || jsonb_build_object('codigo', v_fis ->> 'codigo', 'categoria', v_fis ->> 'categoria');
    else
      v_vence_f := v_ult_pago + make_interval(years => (v_fis ->> 'anios')::integer);
      if v_vence_f > now() then v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'DENTRO_PLAZO_FISCAL'); end if;
    end if;
  end if;
  return jsonb_build_object('ultimo_acto_medico', v_ultimo, 'plazo_anios', v_plazo, 'conservar_hasta', v_vence,
    'tiene_registros_clinicos', v_registros, 'retencion_legal_activa', v_hold, 'ultimo_pago', v_ult_pago, 'conservar_hasta_fiscal', v_vence_f,
    'evaluacion', jsonb_build_object('clinico', v_clin, 'fiscal', v_fis), 'bloqueos', v_bloqueos,
    'puede_suprimirse', jsonb_array_length(v_bloqueos) = 0, 'motivo_bloqueo', v_bloqueos -> 0 ->> 'codigo');
end $$;
revoke all on function public.fn_conservacion_paciente(uuid) from public, anon, authenticated, service_role;

-- Clínica: misma evaluación (clínico, fiscal, contractual) + retenciones. Claves de salida compatibles con 087/089.
create or replace function public.fn_clinica_resumen_eliminacion(p_clinica uuid, p_solicitante uuid default null) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  v_cl public.clinicas%rowtype; v_bloqueos jsonb := '[]'::jsonb; v_avisos jsonb := '[]'::jsonb; v_pacientes uuid[];
  v_conteos jsonb; v_conservado jsonb;
  v_ult_clin timestamptz; v_ult_fisc timestamptz; v_ult_contr timestamptz;
  v_e_clin jsonb := public.fn_evaluar_politica('expediente_clinico'); v_e_fisc jsonb; v_e_contr jsonb := public.fn_evaluar_contractual();
  v_a_clin integer; v_a_fisc integer; v_a_contr integer; v_h_clin timestamptz; v_h_fisc timestamptz; v_h_contr timestamptz;
begin
  select * into v_cl from public.clinicas where id = p_clinica;
  if not found then
    return jsonb_build_object('existe', false, 'puede_eliminar', false,
      'bloqueos', jsonb_build_array(jsonb_build_object('codigo', 'CLINICA_NO_ENCONTRADA', 'mensaje', 'La clínica no existe.')));
  end if;
  select coalesce(array_agg(id), '{}') into v_pacientes from public.pacientes where clinica_id = p_clinica;

  select greatest(
    (select max(creado_en) from public.pacientes where clinica_id = p_clinica),
    (select max(archivado_en) from public.pacientes where clinica_id = p_clinica),
    (select max(e.actualizado_en) from public.expedientes e where e.paciente_id = any (v_pacientes)),
    (select max(n.creado_en) from public.notas_clinicas n join public.expedientes e on e.id = n.expediente_id where e.paciente_id = any (v_pacientes)),
    (select max(creado_en) from public.recetas where paciente_id = any (v_pacientes)),
    (select max(creado_en) from public.tratamientos where paciente_id = any (v_pacientes)),
    (select max(creado_en) from public.consentimientos_informados where paciente_id = any (v_pacientes)),
    (select max(creado_en) from public.documentos_clinicos where paciente_id = any (v_pacientes)),
    (select max(fecha_captura)::timestamptz from public.fotografias where paciente_id = any (v_pacientes)),
    (select max(creado_en) from public.signos_vitales where paciente_id = any (v_pacientes)),
    (select max(creado_en) from public.referencias_medicas where paciente_id = any (v_pacientes)),
    (select max(h.creado_en) from public.odontograma_historial h join public.odontograma_piezas p on p.id = h.pieza_id where p.paciente_id = any (v_pacientes)),
    (select max(p.actualizado_en) from public.odontograma_piezas p where p.paciente_id = any (v_pacientes)),
    (select max(h.creado_en) from public.periodontograma_historial h join public.periodontograma_piezas p on p.id = h.pieza_id where p.paciente_id = any (v_pacientes)),
    (select max(p.actualizado_en) from public.periodontograma_piezas p where p.paciente_id = any (v_pacientes)),
    (select max(inicio) from public.citas where paciente_id = any (v_pacientes) and estado = 'completada')
  ) into v_ult_clin;
  select greatest((select max(creado_en) from public.pagos where paciente_id = any (v_pacientes)),
                  (select max(anulado_en) from public.pagos where paciente_id = any (v_pacientes))) into v_ult_fisc;
  select greatest((select max(created_at) from public.suscripciones where clinica_id = p_clinica), (select max(updated_at) from public.suscripciones where clinica_id = p_clinica),
                  (select max(fecha_fin)::timestamptz from public.suscripciones where clinica_id = p_clinica),
                  (select max(aceptado_en) from public.legal_acceptances where clinica_id = p_clinica or paciente_id = any (v_pacientes)
                                                                       or usuario_id in (select id from public.usuarios where clinica_id = p_clinica))) into v_ult_contr;

  if v_cl.estado <> 'suspendida' then
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'NO_SUSPENDIDA', 'mensaje', 'La clínica está activa. Suspéndela primero (es reversible) y, si de verdad quieres borrarla, elimínala después.');
  end if;
  if exists (select 1 from public.usuarios where clinica_id = p_clinica and es_super_admin) then
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'TIENE_SUPERADMIN', 'mensaje', 'Esta clínica aloja una cuenta de superadministrador de la plataforma; eliminarla la borraría. Muévela o elimina esa cuenta aparte.');
  end if;
  if p_solicitante is not null and exists (select 1 from public.usuarios where id = p_solicitante and clinica_id = p_clinica) then
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'ES_TU_CLINICA', 'mensaje', 'No puedes eliminar la clínica a la que pertenece tu propia cuenta.');
  end if;
  if exists (select 1 from public.retenciones_legales r where r.clinica_id = p_clinica and r.liberada_en is null) then
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'RETENCION_LEGAL_ACTIVA', 'mensaje', 'Hay una retención legal activa sobre la clínica o sobre alguno de sus pacientes. No se puede eliminar mientras siga vigente.');
  end if;

  -- CLÍNICO (obligatorio si hay información clínica)
  if (v_e_clin ->> 'ok')::boolean then v_a_clin := (v_e_clin ->> 'anios')::integer; end if;
  if v_ult_clin is not null then
    if v_a_clin is null then
      v_bloqueos := v_bloqueos || jsonb_build_object('codigo', v_e_clin ->> 'codigo', 'categoria', 'expediente_clinico',
        'mensaje', 'La conservación de la información clínica no tiene una política válida y aprobada (' || (v_e_clin ->> 'codigo') || '). Mientras tanto no se puede eliminar; puedes suspender la clínica.');
    else
      v_h_clin := v_ult_clin + make_interval(years => v_a_clin);
      if v_h_clin > now() then
        v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'DENTRO_PLAZO_CONSERVACION',
          'mensaje', format('La información clínica debe conservarse %s año(s) desde el último registro clínico (%s). No se puede eliminar hasta el %s. Mientras tanto la clínica puede permanecer suspendida.',
            v_a_clin, to_char(v_ult_clin at time zone 'UTC', 'DD/MM/YYYY'), to_char(v_h_clin at time zone 'UTC', 'DD/MM/YYYY')));
      end if;
    end if;
  end if;
  -- FISCAL (obligatorio si hay pagos)
  if v_ult_fisc is not null then
    v_e_fisc := public.fn_evaluar_fiscal();
    if (v_e_fisc ->> 'ok')::boolean then
      v_a_fisc := (v_e_fisc ->> 'anios')::integer; v_h_fisc := v_ult_fisc + make_interval(years => v_a_fisc);
      if v_h_fisc > now() then
        v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'DENTRO_PLAZO_FISCAL',
          'mensaje', format('Los registros de pagos deben conservarse %s año(s) desde el último pago o anulación (%s). No se puede eliminar hasta el %s.',
            v_a_fisc, to_char(v_ult_fisc at time zone 'UTC', 'DD/MM/YYYY'), to_char(v_h_fisc at time zone 'UTC', 'DD/MM/YYYY')));
      end if;
    else
      v_bloqueos := v_bloqueos || jsonb_build_object('codigo', v_e_fisc ->> 'codigo', 'categoria', v_e_fisc ->> 'categoria',
        'mensaje', 'La conservación fiscal no tiene una política válida y aprobada (' || (v_e_fisc ->> 'codigo') || '). Mientras tanto no se puede eliminar.');
    end if;
  end if;
  -- CONTRACTUAL
  if v_ult_contr is not null then
    if (v_e_contr ->> 'ok')::boolean then
      v_a_contr := (v_e_contr ->> 'anios')::integer; v_h_contr := v_ult_contr + make_interval(years => v_a_contr);
      if v_h_contr > now() then
        v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'DENTRO_PLAZO_CONTRACTUAL',
          'mensaje', format('Las suscripciones y aceptaciones legales deben conservarse %s año(s) desde su última actividad (%s). No se puede eliminar hasta el %s.',
            v_a_contr, to_char(v_ult_contr at time zone 'UTC', 'DD/MM/YYYY'), to_char(v_h_contr at time zone 'UTC', 'DD/MM/YYYY')));
      end if;
    elsif (v_e_contr ->> 'obligatoria')::boolean then
      v_bloqueos := v_bloqueos || jsonb_build_object('codigo', v_e_contr ->> 'codigo', 'categoria', 'contratos',
        'mensaje', 'La conservación contractual no tiene una política válida y aprobada (' || (v_e_contr ->> 'codigo') || ').');
    else
      v_avisos := v_avisos || jsonb_build_object('codigo', 'CONTRACTUAL_NO_EVALUADO',
        'mensaje', 'No se evaluó la conservación de suscripciones y aceptaciones legales (' || (v_e_contr ->> 'codigo') || '); se eliminarán con la clínica.');
    end if;
  end if;
  -- Obligaciones pendientes
  if exists (select 1 from public.arco_solicitudes where clinica_id = p_clinica and estado in ('recibida', 'en_revision', 'requiere_informacion', 'aprobada')) then
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'ARCO_PENDIENTE', 'mensaje', 'Hay solicitudes ARCO (acceso, rectificación, cancelación u oposición) sin resolver. Deben atenderse antes de eliminar la clínica.');
  end if;
  if exists (select 1 from public.incidentes_seguridad where clinica_id = p_clinica and estado in ('detectado', 'en_investigacion', 'contenido')) then
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'INCIDENTE_ABIERTO', 'mensaje', 'Hay un incidente de seguridad sin resolver relacionado con esta clínica. Debe cerrarse antes de eliminarla.');
  end if;
  v_avisos := v_avisos || coalesce(v_e_clin -> 'avisos', '[]'::jsonb) || coalesce(v_e_fisc -> 'avisos', '[]'::jsonb);

  v_conteos := jsonb_build_object(
    'usuarios', (select count(*) from public.usuarios where clinica_id = p_clinica), 'pacientes', cardinality(v_pacientes),
    'citas', (select count(*) from public.citas where paciente_id = any (v_pacientes)), 'tratamientos', (select count(*) from public.tratamientos where paciente_id = any (v_pacientes)),
    'pagos', (select count(*) from public.pagos where paciente_id = any (v_pacientes)),
    'notas_clinicas', (select count(*) from public.notas_clinicas n join public.expedientes e on e.id = n.expediente_id where e.paciente_id = any (v_pacientes)),
    'recetas', (select count(*) from public.recetas where paciente_id = any (v_pacientes)), 'consentimientos', (select count(*) from public.consentimientos_informados where paciente_id = any (v_pacientes)),
    'fotografias', (select count(*) from public.fotografias where paciente_id = any (v_pacientes)), 'documentos_clinicos', (select count(*) from public.documentos_clinicos where paciente_id = any (v_pacientes)),
    'sucursales', (select count(*) from public.sucursales where clinica_id = p_clinica));
  v_conservado := jsonb_build_object('auditoria', (select count(*) from public.auditoria where clinica_id = p_clinica),
    'solicitudes_arco', (select count(*) from public.arco_solicitudes where clinica_id = p_clinica),
    'incidentes_seguridad', (select count(*) from public.incidentes_seguridad where clinica_id = p_clinica),
    'retenciones_legales', (select count(*) from public.retenciones_legales where clinica_id = p_clinica));

  return jsonb_build_object('existe', true, 'nombre', v_cl.nombre, 'estado', v_cl.estado, 'conteos', v_conteos, 'se_conserva', v_conservado,
    'politica_anios', v_a_clin, 'ultimo_registro_clinico', v_ult_clin, 'conservar_hasta', v_h_clin,
    'conservacion', jsonb_build_object(
      'clinico', jsonb_build_object('politica_anios', v_a_clin, 'ultimo_registro', v_ult_clin, 'conservar_hasta', v_h_clin, 'evaluacion', v_e_clin),
      'fiscal', jsonb_build_object('politica_anios', v_a_fisc, 'ultimo_registro', v_ult_fisc, 'conservar_hasta', v_h_fisc, 'evaluacion', v_e_fisc),
      'contractual', jsonb_build_object('politica_anios', v_a_contr, 'ultimo_registro', v_ult_contr, 'conservar_hasta', v_h_contr, 'evaluacion', v_e_contr)),
    'advertencias', v_avisos, 'bloqueos', v_bloqueos, 'puede_eliminar', jsonb_array_length(v_bloqueos) = 0);
end $$;
revoke all on function public.fn_clinica_resumen_eliminacion(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_clinica_resumen_eliminacion(uuid, uuid) to service_role;

-- Las políticas solo cambian por fn_establecer_plazo_conservacion (que exige motivo y deja historial).
revoke insert, update, delete, truncate, references, trigger on public.politicas_conservacion from service_role;

-- =====================  R3: registro confiable de eliminaciones y limpieza  =====================
create table if not exists public.eliminaciones_clinica (
  clinica_id   uuid primary key,            -- sin FK: la clínica ya no existe
  nombre       text not null,
  solicitante  uuid not null,
  eliminada_en timestamptz not null default now(),
  pacientes    uuid[] not null default '{}',
  archivos     jsonb not null,               -- {"fotos-clinicas": [...], "documentos-clinicos": [...], "logos-clinicas": [...]}
  cuentas_auth uuid[] not null default '{}'
);
create table if not exists public.eliminaciones_clinica_limpieza (
  id                uuid primary key default gen_random_uuid(),
  clinica_id        uuid not null references public.eliminaciones_clinica (clinica_id),
  solicitante       uuid not null,
  archivos_borrados jsonb not null default '{}'::jsonb,
  cuentas_borradas  uuid[] not null default '{}',
  fallos            jsonb not null default '[]'::jsonb,
  creado_en         timestamptz not null default now()
);
alter table public.eliminaciones_clinica enable row level security;
alter table public.eliminaciones_clinica_limpieza enable row level security;
revoke all on table public.eliminaciones_clinica, public.eliminaciones_clinica_limpieza from public, anon, authenticated, service_role;
do $$ declare t text; begin
  foreach t in array array['eliminaciones_clinica', 'eliminaciones_clinica_limpieza'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'sesion_activa_' || t) then
      execute format('create policy %I on public.%I as restrictive for all to authenticated using ((select fn_sesion_activa())) with check ((select fn_sesion_activa()))', 'sesion_activa_' || t, t);
    end if;
  end loop;
end $$;
drop trigger if exists trg_eliminaciones_inmutable on public.eliminaciones_clinica;
create trigger trg_eliminaciones_inmutable before update or delete on public.eliminaciones_clinica for each row execute function public.fn_registro_inmutable();
drop trigger if exists trg_eliminaciones_sin_truncate on public.eliminaciones_clinica;
create trigger trg_eliminaciones_sin_truncate before truncate on public.eliminaciones_clinica for each statement execute function public.fn_registro_inmutable();
drop trigger if exists trg_limpieza_inmutable on public.eliminaciones_clinica_limpieza;
create trigger trg_limpieza_inmutable before update or delete on public.eliminaciones_clinica_limpieza for each row execute function public.fn_registro_inmutable();
drop trigger if exists trg_limpieza_sin_truncate on public.eliminaciones_clinica_limpieza;
create trigger trg_limpieza_sin_truncate before truncate on public.eliminaciones_clinica_limpieza for each statement execute function public.fn_registro_inmutable();

-- Cuentas pendientes de borrarse de Auth (registradas al eliminar y aún no confirmadas como borradas).
create or replace function public.fn_cuenta_pendiente_de_eliminacion(p_cuenta uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select exists (select 1 from public.eliminaciones_clinica e
                  where p_cuenta = any (e.cuentas_auth)
                    and not exists (select 1 from public.eliminaciones_clinica_limpieza l where l.clinica_id = e.clinica_id and p_cuenta = any (l.cuentas_borradas)))
$$;
revoke all on function public.fn_cuenta_pendiente_de_eliminacion(uuid) from public, anon, authenticated, service_role;

-- Lápida: mientras la cuenta esté pendiente, nadie le vuelve a dar fila en `usuarios` (cierra la ventana entre comprobar y borrar).
create or replace function public.fn_bloquear_reuso_cuenta_eliminada() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if public.fn_cuenta_pendiente_de_eliminacion(new.id) then
    raise exception 'Esta cuenta está pendiente de eliminación tras borrar su clínica.' using errcode = 'P0001', hint = 'CUENTA_PENDIENTE_DE_ELIMINACION';
  end if;
  return new;
end $$;
revoke all on function public.fn_bloquear_reuso_cuenta_eliminada() from public, anon, authenticated, service_role;
drop trigger if exists trg_bloquear_reuso_cuenta_eliminada on public.usuarios;
create trigger trg_bloquear_reuso_cuenta_eliminada before insert or update of id on public.usuarios
  for each row execute function public.fn_bloquear_reuso_cuenta_eliminada();

-- Eliminación: 104 + bloqueos de pacientes/expedientes, retención explícita, registro confiable en la MISMA transacción.
create or replace function public.fn_eliminar_clinica(p_clinica uuid, p_solicitante uuid, p_confirmar_nombre text, p_confirmar_datos_clinicos boolean default false) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  v_resumen jsonb; v_nombre text; v_fotos jsonb; v_docs jsonb; v_logos jsonb; v_cuentas uuid[]; v_pacs uuid[]; v_n_pacientes integer;
begin
  if p_solicitante is null or not coalesce((select es_super_admin from public.usuarios where id = p_solicitante), false) then
    raise exception 'Solo un superadministrador de la plataforma puede eliminar una clínica.' using errcode = 'P0001', hint = 'NO_AUTORIZADO';
  end if;
  perform 1 from public.clinicas where id = p_clinica for update;                                                         -- L1
  if not found then raise exception 'La clínica no existe.' using errcode = 'P0001', hint = 'CLINICA_NO_ENCONTRADA'; end if;
  perform 1 from public.pacientes where clinica_id = p_clinica for update;                                               -- L2
  perform 1 from public.expedientes e join public.pacientes p on p.id = e.paciente_id where p.clinica_id = p_clinica for update of e;  -- L3
  v_resumen := public.fn_clinica_resumen_eliminacion(p_clinica, p_solicitante);   -- evaluada DESPUÉS de bloquear, en esta transacción
  if exists (select 1 from public.retenciones_legales where clinica_id = p_clinica and liberada_en is null) then
    raise exception 'Hay una retención legal activa sobre la clínica o sus pacientes.' using errcode = 'P0001', hint = 'RETENCION_LEGAL_ACTIVA';
  end if;
  if not (v_resumen ->> 'puede_eliminar')::boolean then
    raise exception '%', (select string_agg(b ->> 'mensaje', ' ') from jsonb_array_elements(v_resumen -> 'bloqueos') b) using errcode = 'P0001', hint = 'ELIMINACION_BLOQUEADA';
  end if;
  v_nombre := v_resumen ->> 'nombre';
  if btrim(coalesce(p_confirmar_nombre, '')) <> v_nombre then
    raise exception 'El nombre no coincide: escribe el nombre exacto de la clínica para confirmar.' using errcode = 'P0001', hint = 'NOMBRE_NO_COINCIDE';
  end if;
  v_n_pacientes := (v_resumen -> 'conteos' ->> 'pacientes')::integer;
  if v_n_pacientes > 0 and not coalesce(p_confirmar_datos_clinicos, false) then
    raise exception 'La clínica tiene % paciente(s) con información clínica. Confirma explícitamente que se destruirá de forma permanente.', v_n_pacientes using errcode = 'P0001', hint = 'CONFIRMACION_DATOS_CLINICOS';
  end if;

  select coalesce(array_agg(id), '{}') into v_pacs from public.pacientes where clinica_id = p_clinica;
  select coalesce(array_agg(id), '{}') into v_cuentas from public.usuarios where clinica_id = p_clinica;
  select coalesce(jsonb_agg(o.name), '[]'::jsonb) into v_fotos from storage.objects o
   where o.bucket_id = 'fotos-clinicas' and (storage.foldername(o.name))[1] in (select unnest(v_pacs)::text);
  select coalesce(jsonb_agg(o.name), '[]'::jsonb) into v_docs from storage.objects o
   where o.bucket_id = 'documentos-clinicos' and (storage.foldername(o.name))[1] in (select unnest(v_pacs)::text);
  select coalesce(jsonb_agg(o.name), '[]'::jsonb) into v_logos from storage.objects o
   where o.bucket_id = 'logos-clinicas' and (storage.foldername(o.name))[1] = p_clinica::text;

  -- Registro CONFIABLE (antes de borrar; si algo falla después, se deshace con todo lo demás).
  insert into public.eliminaciones_clinica (clinica_id, nombre, solicitante, pacientes, archivos, cuentas_auth)
  values (p_clinica, v_nombre, p_solicitante, v_pacs,
          jsonb_build_object('fotos-clinicas', v_fotos, 'documentos-clinicos', v_docs, 'logos-clinicas', v_logos), v_cuentas);

  perform set_config('siro.operacion_conservacion', 'eliminacion_clinica', true);
  delete from public.legal_acceptances where clinica_id = p_clinica or paciente_id = any (v_pacs) or usuario_id = any (v_cuentas);
  perform set_config('siro.supresion_autorizada', 'on', true);
  delete from public.pacientes where clinica_id = p_clinica;            -- el disparador SIGUE comprobando retenciones (107)
  perform set_config('siro.supresion_autorizada', 'off', true);
  delete from public.catalogo_tratamientos where clinica_id = p_clinica;
  delete from public.horarios_bloqueados where clinica_id = p_clinica;
  delete from public.lista_espera where clinica_id = p_clinica;
  delete from public.usuarios where clinica_id = p_clinica;
  delete from public.clinicas where id = p_clinica;                      -- disparador: retenciones de clínica; archiva las liberadas
  perform set_config('siro.operacion_conservacion', '', true);

  -- Traza (ya NO dirige la limpieza): se conserva para investigar.
  insert into public.auditoria (usuario_id, accion, entidad, entidad_id, detalle)
  values (p_solicitante, 'eliminar_clinica', 'clinicas', p_clinica,
          jsonb_build_object('nombre', v_nombre, 'conteos', v_resumen -> 'conteos', 'se_conserva', v_resumen -> 'se_conserva',
                             'conservacion', v_resumen -> 'conservacion', 'advertencias', v_resumen -> 'advertencias',
                             'confirmo_datos_clinicos', coalesce(p_confirmar_datos_clinicos, false), 'registro', 'eliminaciones_clinica', 'via', 'fn_eliminar_clinica'));

  return jsonb_build_object('ok', true, 'nombre', v_nombre, 'conteos', v_resumen -> 'conteos', 'se_conserva', v_resumen -> 'se_conserva',
    'rutas_storage', jsonb_build_object('fotos-clinicas', v_fotos, 'documentos-clinicos', v_docs, 'logos-clinicas', v_logos),
    'cuentas_auth', to_jsonb(v_cuentas));
end $$;
revoke all on function public.fn_eliminar_clinica(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.fn_eliminar_clinica(uuid, uuid, text, boolean) to service_role;

-- Lo pendiente sale SOLO del registro confiable, filtrado contra el estado vivo.
create or replace function public.fn_limpieza_pendiente_clinica(p_clinica uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare e public.eliminaciones_clinica%rowtype; v_bucket text; v_lista jsonb; v_archivos jsonb := '{}'::jsonb; v_cuentas jsonb; v_total integer := 0;
begin
  select * into e from public.eliminaciones_clinica where clinica_id = p_clinica;
  if not found then return jsonb_build_object('existe', false); end if;
  if exists (select 1 from public.clinicas where id = p_clinica) then
    return jsonb_build_object('existe', true, 'error', 'CLINICA_AUN_EXISTE', 'pendiente', jsonb_build_object('archivos', '{}'::jsonb, 'cuentas_auth', '[]'::jsonb), 'total_pendiente', 0, 'limpieza_completa', false);
  end if;
  foreach v_bucket in array array['fotos-clinicas', 'documentos-clinicos', 'logos-clinicas'] loop
    select coalesce(jsonb_agg(x.ruta order by x.ruta), '[]'::jsonb) into v_lista
      from jsonb_array_elements_text(coalesce(e.archivos -> v_bucket, '[]'::jsonb)) x(ruta)
     where x.ruta !~ '(^|/)\.\.(/|$)'
       and split_part(x.ruta, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and case when v_bucket = 'logos-clinicas' then split_part(x.ruta, '/', 1) = p_clinica::text
                else split_part(x.ruta, '/', 1) = any (e.pacientes::text[]) end   -- comparación de TEXTO: sin conversión que pueda fallar
       and not exists (select 1 from public.pacientes p where p.id::text = split_part(x.ruta, '/', 1))
       and not exists (select 1 from public.clinicas c where c.id::text = split_part(x.ruta, '/', 1))
       and not exists (select 1 from public.eliminaciones_clinica_limpieza l
                        where l.clinica_id = p_clinica and coalesce(l.archivos_borrados -> v_bucket, '[]'::jsonb) ? x.ruta);
    v_archivos := v_archivos || jsonb_build_object(v_bucket, v_lista);
    v_total := v_total + jsonb_array_length(v_lista);
  end loop;
  select coalesce(jsonb_agg(u order by u), '[]'::jsonb) into v_cuentas
    from unnest(e.cuentas_auth) u
   where not exists (select 1 from public.usuarios x where x.id = u)
     and not exists (select 1 from public.eliminaciones_clinica_limpieza l where l.clinica_id = p_clinica and u = any (l.cuentas_borradas));
  v_total := v_total + jsonb_array_length(v_cuentas);
  return jsonb_build_object('existe', true, 'pendiente', jsonb_build_object('archivos', v_archivos, 'cuentas_auth', v_cuentas),
                            'total_pendiente', v_total, 'limpieza_completa', v_total = 0);
end $$;
revoke all on function public.fn_limpieza_pendiente_clinica(uuid) from public, anon, authenticated;
grant execute on function public.fn_limpieza_pendiente_clinica(uuid) to service_role;

-- La Edge Function registra lo limpiado. Solo superadmin; solo elementos del registro; deja traza en auditoria.
create or replace function public.fn_registrar_limpieza_clinica(p_clinica uuid, p_solicitante uuid, p_archivos_borrados jsonb default '{}'::jsonb,
                                                                p_cuentas_borradas jsonb default '[]'::jsonb, p_fallos jsonb default '[]'::jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare e public.eliminaciones_clinica%rowtype; v_bucket text; v_ruta text; v_id text; v_cuentas uuid[] := '{}';
begin
  if p_solicitante is null or not coalesce((select es_super_admin from public.usuarios where id = p_solicitante), false) then
    raise exception 'Solo un superadministrador de la plataforma puede registrar la limpieza de una clínica eliminada.' using errcode = 'P0001', hint = 'NO_AUTORIZADO';
  end if;
  select * into e from public.eliminaciones_clinica where clinica_id = p_clinica;
  if not found then raise exception 'No hay una eliminación registrada de esa clínica.' using errcode = 'P0001', hint = 'SIN_ELIMINACION_REGISTRADA'; end if;
  for v_bucket in select jsonb_object_keys(coalesce(p_archivos_borrados, '{}'::jsonb)) loop
    for v_ruta in select jsonb_array_elements_text(p_archivos_borrados -> v_bucket) loop
      if not coalesce(e.archivos -> v_bucket, '[]'::jsonb) ? v_ruta then
        raise exception 'Un archivo indicado no pertenece a la limpieza de esa clínica.' using errcode = 'P0001', hint = 'ITEM_AJENO';
      end if;
    end loop;
  end loop;
  for v_id in select jsonb_array_elements_text(coalesce(p_cuentas_borradas, '[]'::jsonb)) loop
    if not (v_id::uuid = any (e.cuentas_auth)) then
      raise exception 'Una cuenta indicada no pertenece a la limpieza de esa clínica.' using errcode = 'P0001', hint = 'ITEM_AJENO';
    end if;
    v_cuentas := v_cuentas || v_id::uuid;
  end loop;
  insert into public.eliminaciones_clinica_limpieza (clinica_id, solicitante, archivos_borrados, cuentas_borradas, fallos)
  values (p_clinica, p_solicitante, coalesce(p_archivos_borrados, '{}'::jsonb), v_cuentas, coalesce(p_fallos, '[]'::jsonb));
  insert into public.auditoria (usuario_id, accion, entidad, entidad_id, detalle)
  values (p_solicitante, 'limpieza_eliminar_clinica', 'clinicas', p_clinica,
          jsonb_build_object('archivos_borrados', coalesce(p_archivos_borrados, '{}'::jsonb), 'cuentas_borradas', coalesce(p_cuentas_borradas, '[]'::jsonb),
                             'fallos', coalesce(p_fallos, '[]'::jsonb), 'registro', 'eliminaciones_clinica_limpieza'));
  return public.fn_limpieza_pendiente_clinica(p_clinica);
end $$;
revoke all on function public.fn_registrar_limpieza_clinica(uuid, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.fn_registrar_limpieza_clinica(uuid, uuid, jsonb, jsonb, jsonb) to service_role;

-- Comprobación de propiedad y alcance POR CUENTA, justo antes de cada auth.admin.deleteUser.
create or replace function public.fn_cuenta_auth_eliminable(p_clinica uuid, p_cuenta uuid) returns text
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare e public.eliminaciones_clinica%rowtype; v_creada timestamptz;
begin
  select * into e from public.eliminaciones_clinica where clinica_id = p_clinica;
  if not found then return 'SIN_ELIMINACION_REGISTRADA'; end if;
  if exists (select 1 from public.clinicas where id = p_clinica) then return 'CLINICA_AUN_EXISTE'; end if;
  if p_cuenta is null or not (p_cuenta = any (e.cuentas_auth)) then return 'CUENTA_AJENA'; end if;
  if exists (select 1 from public.usuarios where id = p_cuenta) then return 'CUENTA_EN_USO'; end if;
  if exists (select 1 from public.eliminaciones_clinica_limpieza l where l.clinica_id = p_clinica and p_cuenta = any (l.cuentas_borradas)) then return 'YA_REGISTRADA_COMO_BORRADA'; end if;
  select u.created_at into v_creada from auth.users u where u.id = p_cuenta;
  if not found then return 'YA_NO_EXISTE'; end if;
  if v_creada > e.eliminada_en then return 'CUENTA_POSTERIOR_A_LA_ELIMINACION'; end if;
  return 'OK';
end $$;
revoke all on function public.fn_cuenta_auth_eliminable(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_cuenta_auth_eliminable(uuid, uuid) to service_role;

commit;
