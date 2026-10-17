-- ============================================================
-- SIRO — Finalizar una consulta clínica de forma atómica y autorizada
-- Migración 085
-- ------------------------------------------------------------
-- PROBLEMA (reproducido con PostgREST real, ver docs/CORRECCION_FINALIZAR_CONSULTA_Y_ELIMINAR_CLINICA.md):
-- "Guardar y finalizar consulta" encadenaba 3-4 escrituras desde el navegador, cada una con `.single()`:
--   1) UPDATE citas (motivo)         → si el rol NO tiene política UPDATE sobre la cita, afecta 0 filas SIN error
--                                       y `.single()` lo convierte en PGRST116 "Cannot coerce the result to a single JSON object".
--   2) UPSERT notas_clinicas         → `ON CONFLICT DO UPDATE` exige el privilegio UPDATE, que la migración 001 REVOCA a
--                                       propósito (las notas son inmutables): "permission denied for table notas_clinicas".
--   3) UPDATE citas (completada)
--   4) UPSERT citas (seguimiento)    → un dentista no tiene política INSERT sobre citas: RLS lo rechaza.
-- Además no había transacción: un fallo a medias dejaba nota creada + cita completada, y reintentar duplicaba la nota.
--
-- SOLUCIÓN: una sola función transaccional. Todo ocurre en UNA transacción (o se hace todo, o no se hace nada) y la
-- autorización se comprueba AQUÍ, de forma explícita y con un mensaje claro por cada causa — es SECURITY DEFINER, así que
-- NO hereda RLS: replica a mano cada control (sesión, plan, rol, clínica, sucursal, paciente asignado) y no abre ninguna
-- política nueva en citas ni en notas_clinicas.
--   * Es idempotente: una consulta ya completada responde `ya_finalizada` sin tocar nada; los ids de la nota y del
--     seguimiento los fija el cliente, así que un reintento nunca duplica.
--   * La nota la crea con INSERT (inmutable), con el expediente tomado del PACIENTE de la cita (no del cliente).
--   * Errores: SQLSTATE P0001, mensaje para la persona en MESSAGE y un código estable en HINT (lo usa el frontend).
-- ADEMÁS: fija search_path en las dos funciones SECURITY DEFINER que lo tenían abierto (fn_auditoria y
-- fn_marcar_nota_editada). Seguro de re-ejecutar.
-- ============================================================
begin;

create or replace function fn_finalizar_consulta(
  p_cita uuid,
  p_motivo text default null,
  p_nota jsonb default null,
  p_seguimiento jsonb default null,
  p_actualizado_en_esperado timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_rol text := auth_rol();
  v_clinica uuid := auth_clinica_id();
  v_cita citas%rowtype;
  v_exp uuid;
  v_nota_id uuid;
  v_seg_id uuid;
  v_filas integer;
  v_inicio timestamptz;
  v_fin timestamptz;
begin
  -- 1) Identidad y sesión (en una clínica suspendida auth_clinica_id() es NULL: no se puede operar).
  if v_uid is null or v_clinica is null then
    raise exception 'Tu sesión no es válida o tu clínica no está activa. Vuelve a iniciar sesión.' using errcode = 'P0001', hint = 'SESION_INVALIDA';
  end if;
  if not fn_sesion_activa() then
    raise exception 'Tu sesión fue cerrada desde otro dispositivo. Vuelve a iniciar sesión.' using errcode = 'P0001', hint = 'SESION_CERRADA';
  end if;

  -- 2) Rol: solo el propietario y los dentistas finalizan consultas (recepción y asistentes no).
  if v_rol is null or v_rol not in ('owner', 'dentista') then
    raise exception 'Tu rol no puede finalizar consultas clínicas.' using errcode = 'P0001', hint = 'ROL_NO_PERMITIDO';
  end if;

  -- 3) La cita, bloqueada hasta el final de la transacción (dos clics simultáneos se serializan). Solo de TU clínica;
  --    una cita de otra clínica es indistinguible de una que no existe.
  select c.* into v_cita
    from citas c join pacientes p on p.id = c.paciente_id
   where c.id = p_cita and p.clinica_id = v_clinica
     for update of c;
  if not found then
    raise exception 'No se encontró la cita, o no pertenece a tu clínica.' using errcode = 'P0001', hint = 'CITA_NO_ENCONTRADA';
  end if;

  -- 4) Acceso: sucursal y paciente asignado (el propietario siempre lo está), y un dentista solo atiende SUS citas.
  if not auth_sucursal_permitida(v_cita.sucursal_id) then
    raise exception 'No tienes acceso a la sucursal de esta cita.' using errcode = 'P0001', hint = 'SUCURSAL_NO_PERMITIDA';
  end if;
  if not auth_paciente_asignado(v_cita.paciente_id) then
    raise exception 'Este paciente no está asignado a ti. Pide al propietario de la clínica que te asigne como odontólogo responsable.' using errcode = 'P0001', hint = 'PACIENTE_NO_ASIGNADO';
  end if;
  if v_rol = 'dentista' and v_cita.dentista_id is distinct from v_uid then
    raise exception 'Esta cita está asignada a otro odontólogo.' using errcode = 'P0001', hint = 'CITA_DE_OTRO_DENTISTA';
  end if;

  -- 5) Plan: lo que antes aplicaban las políticas RESTRICTIVE plan_func_* (aquí hay que replicarlo a mano).
  if not fn_clinica_tiene_funcionalidad(v_clinica, 'citas') then
    raise exception 'Tu plan no incluye la gestión de citas.' using errcode = 'P0001', hint = 'FUNCIONALIDAD_NO_INCLUIDA';
  end if;
  if p_nota is not null and not (fn_clinica_tiene_funcionalidad(v_clinica, 'notas_clinicas') and fn_clinica_tiene_funcionalidad(v_clinica, 'expediente_clinico')) then
    raise exception 'Tu plan no incluye notas clínicas.' using errcode = 'P0001', hint = 'FUNCIONALIDAD_NO_INCLUIDA';
  end if;

  -- 6) Estado de la cita. Completada → idempotente (el botón se pulsó dos veces, o se reintenta tras un corte): no se
  --    toca nada y se devuelven los ids que el cliente ya conoce. Cancelada / no asistió → no se puede finalizar.
  if v_cita.estado = 'completada' then
    return jsonb_build_object('ok', true, 'ya_finalizada', true, 'cita_id', p_cita,
      'nota_id', nullif(p_nota ->> 'id', '')::uuid, 'seguimiento_id', nullif(p_seguimiento ->> 'id', '')::uuid);
  end if;
  if v_cita.estado in ('cancelada', 'no_asistio') then
    raise exception 'La cita está %; no se puede finalizar una consulta.', case v_cita.estado when 'cancelada' then 'cancelada' else 'marcada como "no asistió"' end
      using errcode = 'P0001', hint = 'ESTADO_INVALIDO';
  end if;
  -- Candado optimista (lo usa la subida offline: la cita cambió mientras no había conexión).
  if p_actualizado_en_esperado is not null and v_cita.actualizado_en is distinct from p_actualizado_en_esperado then
    raise exception 'CONFLICTO_CONCURRENCIA' using errcode = 'P0001', hint = 'CONFLICTO_CONCURRENCIA';
  end if;

  -- 7) La nota: INSERT (inmutable). El expediente sale del paciente de la cita. Id fijado por el cliente → idempotente.
  if p_nota is not null then
    select e.id into v_exp from expedientes e where e.paciente_id = v_cita.paciente_id;
    if v_exp is null then
      raise exception 'El paciente no tiene expediente clínico.' using errcode = 'P0001', hint = 'EXPEDIENTE_NO_ENCONTRADO';
    end if;
    v_nota_id := coalesce(nullif(p_nota ->> 'id', '')::uuid, gen_random_uuid());
    insert into notas_clinicas (id, expediente_id, cita_id, usuario_id, contenido, tipo, diagnostico,
                                diagnostico_cie10_codigo, diagnostico_cie10_descripcion,
                                interrogatorio_sistemas, exploracion_fisica, accion_salud_bucal, hallazgos, creado_en)
    values (v_nota_id, v_exp, p_cita, v_uid,
            coalesce(nullif(p_nota ->> 'contenido', ''), '(sin nota)'), 'consulta', nullif(p_nota ->> 'diagnostico', ''),
            nullif(p_nota ->> 'diagnostico_cie10_codigo', ''), nullif(p_nota ->> 'diagnostico_cie10_descripcion', ''),
            nullif(p_nota -> 'interrogatorio_sistemas', 'null'::jsonb), nullif(p_nota -> 'exploracion_fisica', 'null'::jsonb),
            nullif(p_nota -> 'accion_salud_bucal', 'null'::jsonb), nullif(p_nota ->> 'hallazgos', ''),
            least(coalesce(nullif(p_nota ->> 'creado_en', '')::timestamptz, now()), now()))  -- la hora de captura (offline), nunca en el futuro
    on conflict (id) do nothing;
    get diagnostics v_filas = row_count;
    if v_filas = 0 and not exists (select 1 from notas_clinicas where id = v_nota_id and expediente_id = v_exp and cita_id = p_cita) then
      raise exception 'El identificador de la nota ya está en uso por otro registro.' using errcode = 'P0001', hint = 'NOTA_ID_EN_USO';
    end if;
  end if;

  -- 8) Completar la cita ANTES de crear el seguimiento (mientras siga activa choca con el horario del seguimiento).
  update citas
     set motivo_consulta = nullif(btrim(coalesce(p_motivo, '')), ''),
         estado = 'completada'
   where id = p_cita;

  -- 9) El seguimiento (opcional): misma paciente, mismo odontólogo y sucursal que la consulta. Si el horario está
  --    ocupado se deshace TODO (la consulta no queda a medias) y se explica por qué.
  if p_seguimiento is not null then
    v_seg_id := coalesce(nullif(p_seguimiento ->> 'id', '')::uuid, gen_random_uuid());
    v_inicio := (p_seguimiento ->> 'inicio')::timestamptz;
    v_fin := (p_seguimiento ->> 'fin')::timestamptz;
    if v_inicio is null or v_fin is null or v_fin <= v_inicio then
      raise exception 'La fecha y hora del seguimiento no son válidas.' using errcode = 'P0001', hint = 'SEGUIMIENTO_INVALIDO';
    end if;
    begin
      insert into citas (id, paciente_id, dentista_id, inicio, fin, motivo_consulta, estado, sucursal_id)
      values (v_seg_id, v_cita.paciente_id, v_cita.dentista_id, v_inicio, v_fin,
              coalesce(nullif(p_seguimiento ->> 'motivo_consulta', ''), nullif(p_seguimiento ->> 'motivo', ''), 'Seguimiento'),
              'agendada', v_cita.sucursal_id)
      on conflict (id) do nothing;
    exception when exclusion_violation then
      raise exception 'El horario del seguimiento ya está ocupado para este odontólogo. Elige otra fecha u hora.' using errcode = 'P0001', hint = 'HORARIO_OCUPADO';
    end;
  end if;

  return jsonb_build_object('ok', true, 'ya_finalizada', false, 'cita_id', p_cita, 'nota_id', v_nota_id, 'seguimiento_id', v_seg_id);
end;
$$;

revoke all on function fn_finalizar_consulta(uuid, text, jsonb, jsonb, timestamptz) from public, anon;
grant execute on function fn_finalizar_consulta(uuid, text, jsonb, jsonb, timestamptz) to authenticated;

-- Hardening: SECURITY DEFINER sin search_path fijo permite secuestrar objetos por orden de búsqueda.
alter function fn_auditoria() set search_path = public;
alter function fn_marcar_nota_editada() set search_path = public;

commit;
