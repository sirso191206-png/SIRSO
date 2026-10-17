-- ============================================================
-- SIRO — fn_finalizar_consulta v2: los reintentos se VERIFICAN, no se suponen
-- Migración 088 (reemplaza la función de la 085; mismos parámetros, mismos controles de autorización)
-- ------------------------------------------------------------
-- DEFECTOS de la v1 (085), confirmados por lectura y reproducidos en finalizar_consulta_idempotencia_test.sql:
--  A) Seguimiento: `insert … on conflict (id) do nothing` y se seguía SIN comprobar nada. Si el id ya pertenecía a OTRA cita
--     (o a una cita con otro paciente, horario o motivo), la función devolvía éxito con un seguimiento_id que no era el pedido.
--  B) Nota: ante un id existente solo se comprobaban id + expediente + cita; un contenido clínico distinto (diagnóstico,
--     exploración, hallazgos, otro autor…) se aceptaba como "reintento".
--  C) «Cita completada» se tomaba como «operación confirmada»: se respondía `ya_finalizada` sin mirar si la nota o el seguimiento
--     de ESTA operación existían, ni si el motivo coincidía.
--
-- AHORA:
--  · Se escribe SOLO cuando la cita aún no está completada. Sobre una cita ya completada la función NO escribe nada, jamás
--    (no repara en silencio): verifica y, si falta algo, lo dice.
--  · En TODA ejecución (primera o reintento) se relee la nota y el seguimiento y se COMPARA campo a campo con lo esperado.
--      NOTA: expediente, cita, autor, tipo, contenido, diagnóstico, CIE-10 (código y descripción), interrogatorio, exploración,
--            acción de salud bucal, hallazgos, y que no tenga pronóstico, plan ni versión anterior (la función no los escribe).
--            NO se comparan `creado_en` (la hora de captura offline puede variar) ni `editado` (una versión posterior la marca).
--      SEGUIMIENTO: paciente, odontólogo, sucursal, inicio, fin y motivo. `citas` no tiene ninguna columna que ligue un
--            seguimiento con su cita de origen, así que «corresponde a la operación» solo puede comprobarse con estos campos.
--            No se compara estado/turno/consultorio: pueden avanzar legítimamente.
--  · Existe pero difiere → NOTA_CONFLICTO / SEGUIMIENTO_CONFLICTO. Nunca se sobrescribe.
--  · Completada pero falta la nota o el seguimiento pedidos → FINALIZACION_INCOMPLETA (informa qué falta; no escribe).
--  · Completada con otro motivo → CONSULTA_CON_DATOS_DISTINTOS.
--  · Reintentar una cita completada exige el id de la nota/seguimiento (sin id no hay nada que verificar):
--    ID_REQUERIDO_PARA_REINTENTO.
--  · Todo ocurre en UNA transacción: cualquier error revierte todas las escrituras de la llamada.
--  · SECURITY DEFINER lee todas las filas (no hereda RLS): por eso la comparación incluye expediente, cita y AUTOR — una nota de
--    otra clínica o de otro usuario con el mismo id nunca coincide, y el mensaje no revela nada de ella.
-- No cambia permisos ni políticas. No concede UPDATE sobre notas. Seguro de re-ejecutar.
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
  v_ya boolean;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_exp uuid;
  -- nota esperada
  v_nota_id uuid; v_nota notas_clinicas%rowtype;
  v_n_contenido text; v_n_diag text; v_n_cie_c text; v_n_cie_d text; v_n_inter jsonb; v_n_expl jsonb; v_n_accion jsonb; v_n_hall text;
  -- seguimiento esperado
  v_seg_id uuid; v_seg citas%rowtype; v_inicio timestamptz; v_fin timestamptz; v_seg_motivo text;
  v_filas integer;
  v_faltan text[] := '{}';
  v_nota_ok boolean := false;
  v_seg_ok boolean := false;
begin
  -- 1) Identidad y sesión
  if v_uid is null or v_clinica is null then
    raise exception 'Tu sesión no es válida o tu clínica no está activa. Vuelve a iniciar sesión.' using errcode = 'P0001', hint = 'SESION_INVALIDA';
  end if;
  if not fn_sesion_activa() then
    raise exception 'Tu sesión fue cerrada desde otro dispositivo. Vuelve a iniciar sesión.' using errcode = 'P0001', hint = 'SESION_CERRADA';
  end if;
  -- 2) Rol
  if v_rol is null or v_rol not in ('owner', 'dentista') then
    raise exception 'Tu rol no puede finalizar consultas clínicas.' using errcode = 'P0001', hint = 'ROL_NO_PERMITIDO';
  end if;
  -- 3) La cita, bloqueada hasta el final de la transacción (dos clics simultáneos se serializan), solo de TU clínica
  select c.* into v_cita
    from citas c join pacientes p on p.id = c.paciente_id
   where c.id = p_cita and p.clinica_id = v_clinica
     for update of c;
  if not found then
    raise exception 'No se encontró la cita, o no pertenece a tu clínica.' using errcode = 'P0001', hint = 'CITA_NO_ENCONTRADA';
  end if;
  -- 4) Acceso
  if not auth_sucursal_permitida(v_cita.sucursal_id) then
    raise exception 'No tienes acceso a la sucursal de esta cita.' using errcode = 'P0001', hint = 'SUCURSAL_NO_PERMITIDA';
  end if;
  if not auth_paciente_asignado(v_cita.paciente_id) then
    raise exception 'Este paciente no está asignado a ti. Pide al propietario de la clínica que te asigne como odontólogo responsable.' using errcode = 'P0001', hint = 'PACIENTE_NO_ASIGNADO';
  end if;
  if v_rol = 'dentista' and v_cita.dentista_id is distinct from v_uid then
    raise exception 'Esta cita está asignada a otro odontólogo.' using errcode = 'P0001', hint = 'CITA_DE_OTRO_DENTISTA';
  end if;
  -- 5) Plan (lo que antes aplicaban las políticas RESTRICTIVE plan_func_*)
  if not fn_clinica_tiene_funcionalidad(v_clinica, 'citas') then
    raise exception 'Tu plan no incluye la gestión de citas.' using errcode = 'P0001', hint = 'FUNCIONALIDAD_NO_INCLUIDA';
  end if;
  if p_nota is not null and not (fn_clinica_tiene_funcionalidad(v_clinica, 'notas_clinicas') and fn_clinica_tiene_funcionalidad(v_clinica, 'expediente_clinico')) then
    raise exception 'Tu plan no incluye notas clínicas.' using errcode = 'P0001', hint = 'FUNCIONALIDAD_NO_INCLUIDA';
  end if;
  -- 6) Estado
  if v_cita.estado in ('cancelada', 'no_asistio') then
    raise exception 'La cita está %; no se puede finalizar una consulta.', case v_cita.estado when 'cancelada' then 'cancelada' else 'marcada como "no asistió"' end
      using errcode = 'P0001', hint = 'ESTADO_INVALIDO';
  end if;
  v_ya := (v_cita.estado = 'completada');
  if not v_ya and p_actualizado_en_esperado is not null and v_cita.actualizado_en is distinct from p_actualizado_en_esperado then
    raise exception 'CONFLICTO_CONCURRENCIA' using errcode = 'P0001', hint = 'CONFLICTO_CONCURRENCIA';
  end if;

  -- 7) Lo que se espera de la nota y del seguimiento, calculado UNA vez (sirve para escribir y para comparar)
  if p_nota is not null then
    select e.id into v_exp from expedientes e where e.paciente_id = v_cita.paciente_id;
    if v_exp is null then
      raise exception 'El paciente no tiene expediente clínico.' using errcode = 'P0001', hint = 'EXPEDIENTE_NO_ENCONTRADO';
    end if;
    v_nota_id := nullif(p_nota ->> 'id', '')::uuid;
    if v_nota_id is null and v_ya then
      raise exception 'Para reintentar sobre una cita ya completada se necesita el identificador de la nota: sin él no hay nada que verificar.' using errcode = 'P0001', hint = 'ID_REQUERIDO_PARA_REINTENTO';
    end if;
    v_nota_id := coalesce(v_nota_id, gen_random_uuid());
    v_n_contenido := coalesce(nullif(p_nota ->> 'contenido', ''), '(sin nota)');
    v_n_diag := nullif(p_nota ->> 'diagnostico', '');
    v_n_cie_c := nullif(p_nota ->> 'diagnostico_cie10_codigo', '');
    v_n_cie_d := nullif(p_nota ->> 'diagnostico_cie10_descripcion', '');
    v_n_inter := nullif(p_nota -> 'interrogatorio_sistemas', 'null'::jsonb);
    v_n_expl := nullif(p_nota -> 'exploracion_fisica', 'null'::jsonb);
    v_n_accion := nullif(p_nota -> 'accion_salud_bucal', 'null'::jsonb);
    v_n_hall := nullif(p_nota ->> 'hallazgos', '');
  end if;
  if p_seguimiento is not null then
    v_seg_id := nullif(p_seguimiento ->> 'id', '')::uuid;
    if v_seg_id is null and v_ya then
      raise exception 'Para reintentar sobre una cita ya completada se necesita el identificador del seguimiento: sin él no hay nada que verificar.' using errcode = 'P0001', hint = 'ID_REQUERIDO_PARA_REINTENTO';
    end if;
    v_seg_id := coalesce(v_seg_id, gen_random_uuid());
    v_inicio := (p_seguimiento ->> 'inicio')::timestamptz;
    v_fin := (p_seguimiento ->> 'fin')::timestamptz;
    if v_inicio is null or v_fin is null or v_fin <= v_inicio then
      raise exception 'La fecha y hora del seguimiento no son válidas.' using errcode = 'P0001', hint = 'SEGUIMIENTO_INVALIDO';
    end if;
    v_seg_motivo := coalesce(nullif(p_seguimiento ->> 'motivo_consulta', ''), nullif(p_seguimiento ->> 'motivo', ''), 'Seguimiento');
    if v_seg_id = p_cita then
      raise exception 'El identificador del seguimiento coincide con el de la propia cita. No se modificó nada.' using errcode = 'P0001', hint = 'SEGUIMIENTO_CONFLICTO';
    end if;
  end if;

  -- 8) La nota: se escribe solo si la cita NO estaba completada; en toda ejecución se relee y se compara
  if p_nota is not null then
    if not v_ya then
      insert into notas_clinicas (id, expediente_id, cita_id, usuario_id, contenido, tipo, diagnostico,
                                  diagnostico_cie10_codigo, diagnostico_cie10_descripcion,
                                  interrogatorio_sistemas, exploracion_fisica, accion_salud_bucal, hallazgos, creado_en)
      values (v_nota_id, v_exp, p_cita, v_uid, v_n_contenido, 'consulta', v_n_diag, v_n_cie_c, v_n_cie_d, v_n_inter, v_n_expl, v_n_accion, v_n_hall,
              least(coalesce(nullif(p_nota ->> 'creado_en', '')::timestamptz, now()), now()))  -- la hora de captura (offline), nunca en el futuro
      on conflict (id) do nothing;
    end if;
    select * into v_nota from notas_clinicas where id = v_nota_id;
    if not found then
      if v_ya then v_faltan := array_append(v_faltan, 'la nota clínica'::text);
      else raise exception 'No se pudo confirmar que la nota quedó guardada.' using errcode = 'P0001', hint = 'NOTA_NO_CONFIRMADA'; end if;
    elsif not (v_nota.expediente_id is not distinct from v_exp and v_nota.cita_id is not distinct from p_cita and v_nota.usuario_id is not distinct from v_uid
           and v_nota.tipo is not distinct from 'consulta' and v_nota.contenido is not distinct from v_n_contenido
           and v_nota.diagnostico is not distinct from v_n_diag
           and v_nota.diagnostico_cie10_codigo is not distinct from v_n_cie_c and v_nota.diagnostico_cie10_descripcion is not distinct from v_n_cie_d
           and v_nota.interrogatorio_sistemas is not distinct from v_n_inter and v_nota.exploracion_fisica is not distinct from v_n_expl
           and v_nota.accion_salud_bucal is not distinct from v_n_accion and v_nota.hallazgos is not distinct from v_n_hall
           and v_nota.pronostico is null and v_nota.plan_tratamiento is null and v_nota.version_anterior_id is null) then
      raise exception 'Ya existe una nota con ese identificador y contenido clínico distinto. No se sobrescribió: las notas clínicas no se modifican.' using errcode = 'P0001', hint = 'NOTA_CONFLICTO';
    else
      v_nota_ok := true;
    end if;
  end if;

  -- 9) Completar la cita ANTES del seguimiento (mientras siga activa choca con el horario del seguimiento). Solo si no lo estaba.
  if not v_ya then
    update citas set motivo_consulta = v_motivo, estado = 'completada' where id = p_cita;
  elsif v_cita.motivo_consulta is distinct from v_motivo then
    raise exception 'La consulta ya estaba finalizada con un motivo distinto al de esta operación. No se modificó nada.' using errcode = 'P0001', hint = 'CONSULTA_CON_DATOS_DISTINTOS';
  end if;

  -- 10) El seguimiento: escribir solo si la cita no estaba completada; comparar siempre. Horario ocupado → se deshace TODO.
  if p_seguimiento is not null then
    if not v_ya then
      begin
        insert into citas (id, paciente_id, dentista_id, inicio, fin, motivo_consulta, estado, sucursal_id)
        values (v_seg_id, v_cita.paciente_id, v_cita.dentista_id, v_inicio, v_fin, v_seg_motivo, 'agendada', v_cita.sucursal_id)
        on conflict (id) do nothing;
      exception when exclusion_violation then
        raise exception 'El horario del seguimiento ya está ocupado para este odontólogo. Elige otra fecha u hora.' using errcode = 'P0001', hint = 'HORARIO_OCUPADO';
      end;
    end if;
    select * into v_seg from citas where id = v_seg_id;
    if not found then
      if v_ya then v_faltan := array_append(v_faltan, 'el seguimiento'::text);
      else raise exception 'No se pudo confirmar que el seguimiento quedó agendado.' using errcode = 'P0001', hint = 'SEGUIMIENTO_NO_CONFIRMADO'; end if;
    elsif not (v_seg.paciente_id = v_cita.paciente_id and v_seg.dentista_id is not distinct from v_cita.dentista_id
           and v_seg.sucursal_id is not distinct from v_cita.sucursal_id and v_seg.inicio = v_inicio and v_seg.fin = v_fin
           and v_seg.motivo_consulta is not distinct from v_seg_motivo) then
      raise exception 'El identificador del seguimiento ya pertenece a otra cita o a datos distintos (paciente, odontólogo, sucursal, horario o motivo). No se modificó nada.' using errcode = 'P0001', hint = 'SEGUIMIENTO_CONFLICTO';
    else
      v_seg_ok := true;
    end if;
  end if;

  -- 11) Cita ya completada pero SIN todos los efectos de esta operación: se informa, no se repara (no hay escrituras en este camino)
  if v_ya and cardinality(v_faltan) > 0 then
    raise exception 'La cita ya estaba completada, pero esta operación no tiene confirmado: %. No se escribió nada para no ocultar el estado inconsistente; revísalo (agrega la nota desde el expediente o agenda el seguimiento).', array_to_string(v_faltan, ' ni ')
      using errcode = 'P0001', hint = 'FINALIZACION_INCOMPLETA';
  end if;

  return jsonb_build_object('ok', true, 'ya_finalizada', v_ya, 'cita_id', p_cita, 'nota_id', v_nota_id, 'seguimiento_id', v_seg_id,
                            'verificado', jsonb_build_object('nota', v_nota_ok, 'seguimiento', v_seg_ok));
end;
$$;

revoke all on function fn_finalizar_consulta(uuid, text, jsonb, jsonb, timestamptz) from public, anon;
grant execute on function fn_finalizar_consulta(uuid, text, jsonb, jsonb, timestamptz) to authenticated;

commit;
