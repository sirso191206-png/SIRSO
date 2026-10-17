-- ============================================================
-- SIRO — Conservación de información clínica antes de eliminar una clínica
-- Migración 087 (sustituye la vista previa de la 086; la función de borrado NO cambia: ya obedece a esa vista previa)
-- ------------------------------------------------------------
-- La 086 permitía destruir expedientes con solo confirmarlo. Eso decidía por todos qué se puede borrar. Ahora:
--
--   · Los expedientes y todo registro clínico NO se eliminan mientras no exista una POLÍTICA DE CONSERVACIÓN DEFINIDA y vigente.
--     La política es el parámetro de plataforma `retencion_expediente_anios` (años desde el ÚLTIMO registro clínico de la clínica).
--     NO se inserta ningún valor por omisión: mientras no lo defina un superadmin —con asesoría legal—, una clínica con
--     información clínica NO se puede eliminar definitivamente (sí suspender). Un valor ausente, no numérico o <= 0 cuenta como
--     "no definida".
--   · Dentro del plazo se bloquea y se dice hasta cuándo (`conservar_hasta`). Cumplido el plazo se permite, con las mismas
--     garantías de siempre (superadmin, clínica suspendida, nombre exacto y confirmación explícita).
--   · Son obligaciones de la clínica, con o sin datos clínicos: una solicitud ARCO sin resolver y un incidente de seguridad
--     abierto BLOQUEAN la eliminación (hay que atenderlos antes).
--   · "Último registro clínico" = lo más reciente entre: expediente (alta o modificación), notas, recetas, tratamientos,
--     consentimientos, documentos, fotografías, signos vitales, referencias, cambios de odontograma/periodontograma y citas
--     COMPLETADAS. Los pagos NO se cuentan (no son registro clínico), pero tienen su propia conservación fiscal que ESTA política
--     no cubre: no se borran sin que alguien lo haya decidido (quedan arrastrados al borrar al paciente solo si se permite la
--     eliminación, es decir, cumplido el plazo y confirmado).
--   · Una clínica SIN pacientes ni registros clínicos no tiene nada que conservar: se puede eliminar (suspendida) sin política.
-- Suspender (admin-actualizar-clinica) sigue siendo la vía para revocar el acceso sin destruir nada.
-- Seguro de re-ejecutar. No cambia datos.
-- ============================================================
begin;

create or replace function fn_clinica_resumen_eliminacion(p_clinica uuid, p_solicitante uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_cl clinicas%rowtype;
  v_bloqueos jsonb := '[]'::jsonb;
  v_pacientes uuid[];
  v_conteos jsonb;
  v_conservado jsonb;
  v_ultimo timestamptz;
  v_politica text;
  v_anios integer;
  v_conservar_hasta timestamptz;
begin
  select * into v_cl from clinicas where id = p_clinica;
  if not found then
    return jsonb_build_object('existe', false, 'puede_eliminar', false,
      'bloqueos', jsonb_build_array(jsonb_build_object('codigo', 'CLINICA_NO_ENCONTRADA', 'mensaje', 'La clínica no existe.')));
  end if;

  select coalesce(array_agg(id), '{}') into v_pacientes from pacientes where clinica_id = p_clinica;

  -- Último registro clínico (NULL si la clínica no tiene pacientes ni registros).
  select greatest(
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
  ) into v_ultimo;

  -- Política de conservación: solo cuenta si es un entero > 0.
  select valor into v_politica from plataforma_config where clave = 'retencion_expediente_anios';
  v_anios := case when btrim(coalesce(v_politica, '')) ~ '^[0-9]{1,3}$' and btrim(v_politica)::int > 0 then btrim(v_politica)::int end;
  if v_ultimo is not null and v_anios is not null then v_conservar_hasta := v_ultimo + make_interval(years => v_anios); end if;

  if v_cl.estado <> 'suspendida' then
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'NO_SUSPENDIDA',
      'mensaje', 'La clínica está activa. Suspéndela primero (es reversible) y, si de verdad quieres borrarla, elimínala después.');
  end if;
  if exists (select 1 from usuarios where clinica_id = p_clinica and es_super_admin) then
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'TIENE_SUPERADMIN',
      'mensaje', 'Esta clínica aloja una cuenta de superadministrador de la plataforma; eliminarla la borraría. Muévela o elimina esa cuenta aparte.');
  end if;
  if p_solicitante is not null and exists (select 1 from usuarios where id = p_solicitante and clinica_id = p_clinica) then
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'ES_TU_CLINICA',
      'mensaje', 'No puedes eliminar la clínica a la que pertenece tu propia cuenta.');
  end if;

  -- Conservación de información clínica.
  if v_ultimo is not null and v_anios is null then
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'POLITICA_CONSERVACION_NO_DEFINIDA',
      'mensaje', 'La clínica tiene información clínica y la plataforma no tiene definida una política de conservación (parámetro retencion_expediente_anios). Mientras no se defina —con asesoría legal— los expedientes no se pueden eliminar definitivamente. Puedes suspender la clínica para revocar su acceso sin destruir nada.');
  elsif v_conservar_hasta is not null and v_conservar_hasta > now() then
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'DENTRO_PLAZO_CONSERVACION',
      'mensaje', format('La información clínica debe conservarse %s año(s) desde el último registro clínico (%s). No se puede eliminar hasta el %s. Mientras tanto la clínica puede permanecer suspendida.',
        v_anios, to_char(v_ultimo at time zone 'UTC', 'DD/MM/YYYY'), to_char(v_conservar_hasta at time zone 'UTC', 'DD/MM/YYYY')));
  end if;
  -- Obligaciones pendientes de la clínica (con o sin datos clínicos).
  if exists (select 1 from arco_solicitudes where clinica_id = p_clinica and estado in ('recibida', 'en_revision', 'requiere_informacion', 'aprobada')) then
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'ARCO_PENDIENTE',
      'mensaje', 'Hay solicitudes ARCO (acceso, rectificación, cancelación u oposición) sin resolver. Deben atenderse antes de eliminar la clínica.');
  end if;
  if exists (select 1 from incidentes_seguridad where clinica_id = p_clinica and estado in ('detectado', 'en_investigacion', 'contenido')) then
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'INCIDENTE_ABIERTO',
      'mensaje', 'Hay un incidente de seguridad sin resolver relacionado con esta clínica. Debe cerrarse antes de eliminarla.');
  end if;

  v_conteos := jsonb_build_object(
    'usuarios', (select count(*) from usuarios where clinica_id = p_clinica),
    'pacientes', cardinality(v_pacientes),
    'citas', (select count(*) from citas where paciente_id = any (v_pacientes)),
    'tratamientos', (select count(*) from tratamientos where paciente_id = any (v_pacientes)),
    'pagos', (select count(*) from pagos where paciente_id = any (v_pacientes)),
    'notas_clinicas', (select count(*) from notas_clinicas n join expedientes e on e.id = n.expediente_id where e.paciente_id = any (v_pacientes)),
    'recetas', (select count(*) from recetas where paciente_id = any (v_pacientes)),
    'consentimientos', (select count(*) from consentimientos_informados where paciente_id = any (v_pacientes)),
    'fotografias', (select count(*) from fotografias where paciente_id = any (v_pacientes)),
    'documentos_clinicos', (select count(*) from documentos_clinicos where paciente_id = any (v_pacientes)),
    'sucursales', (select count(*) from sucursales where clinica_id = p_clinica));
  v_conservado := jsonb_build_object(
    'auditoria', (select count(*) from auditoria where clinica_id = p_clinica),
    'solicitudes_arco', (select count(*) from arco_solicitudes where clinica_id = p_clinica),
    'incidentes_seguridad', (select count(*) from incidentes_seguridad where clinica_id = p_clinica));

  return jsonb_build_object('existe', true, 'nombre', v_cl.nombre, 'estado', v_cl.estado,
    'conteos', v_conteos, 'se_conserva', v_conservado,
    'politica_anios', v_anios, 'ultimo_registro_clinico', v_ultimo, 'conservar_hasta', v_conservar_hasta,
    'bloqueos', v_bloqueos, 'puede_eliminar', jsonb_array_length(v_bloqueos) = 0);
end;
$$;

-- Los privilegios se conservan con CREATE OR REPLACE; se repiten por claridad: solo la Edge Function (service_role).
revoke all on function fn_clinica_resumen_eliminacion(uuid, uuid) from public, anon, authenticated;
grant execute on function fn_clinica_resumen_eliminacion(uuid, uuid) to service_role;

commit;
