-- ============================================================
-- SIRO — Una cita solo se completa FINALIZANDO LA CONSULTA (y recuperación de las ya completadas sin nota)
-- Migración 090
-- ------------------------------------------------------------
-- PROBLEMA (fase 4, «Mi día»): el botón «Finalizar consulta» de Mi día y el botón «Completar» del panel de la agenda hacían un
-- `UPDATE citas SET estado = 'completada'` directo desde el navegador. La base de datos lo aceptaba: la consulta quedaba
-- «completada» sin pasar por fn_finalizar_consulta (sin nota, sin verificación, sin seguimiento). Un reintento posterior de
-- «Guardar y finalizar» sobre esa cita daba FINALIZACION_INCOMPLETA (088) y no había forma de arreglarlo.
--
-- SOLUCIÓN (la regla vive en la BASE DE DATOS, no solo en la interfaz):
--  1) TRIGGER: un usuario final (rol de PostgreSQL `authenticated` o `anon`) NO puede dejar una cita en `completada`, ni
--     insertándola ni actualizándola. Las funciones SECURITY DEFINER (fn_finalizar_consulta) se ejecutan como su propietario y
--     pasan; `service_role` y el propietario de la base (operación administrativa) también. Todas las demás transiciones
--     administrativas (confirmar, en espera, iniciar consulta, cancelar, no asistió, reprogramar, reabrir) siguen libres y no
--     generan notas. NO cambia datos existentes: las citas ya completadas siguen así.
--  2) fn_completar_consulta_pendiente: para una cita YA completada que no tiene nota (o a la que falta un seguimiento), el
--     odontólogo la completa de forma EXPLÍCITA: crea la nota (inmutable, con id fijado por el cliente) y, si se pide, el
--     seguimiento, y VERIFICA lo guardado campo a campo (misma comparación que la 088). No modifica la cita (ni estado ni motivo
--     ni actualizado_en). Idempotente: repetirla no duplica; si la cita YA tiene otra nota, responde CONSULTA_YA_TIENE_NOTA y no
--     crea una segunda. Mismos controles de autorización que fn_finalizar_consulta.
--  3) fn_consultas_sin_nota: lista (máx. 100, últimos N días, por omisión 30, tope 365) las citas completadas SIN nota a las que el
--     usuario tiene acceso (owner: su clínica; dentista: las suyas). Vacía para otros roles y si el plan no incluye notas.
-- No concede UPDATE sobre notas. No cambia políticas RLS. Seguro de re-ejecutar.
-- ============================================================
begin;

create or replace function fn_bloquear_completar_cita_directo() returns trigger
language plpgsql set search_path = public as $$
begin
  -- SECURITY INVOKER a propósito: current_user es el rol que ejecuta la sentencia (authenticated/anon desde la API; el propietario
  -- dentro de una función SECURITY DEFINER; service_role/postgres en operación administrativa).
  if new.estado = 'completada' and (tg_op = 'INSERT' or old.estado is distinct from 'completada') and current_user in ('authenticated', 'anon') then
    raise exception 'Una cita solo se completa finalizando la consulta clínica: no se puede marcar como completada directamente.' using errcode = 'P0001', hint = 'COMPLETAR_SOLO_VIA_CONSULTA';
  end if;
  return new;
end;
$$;
revoke all on function fn_bloquear_completar_cita_directo() from public, anon, authenticated;  -- función de trigger: no se invoca directamente
drop trigger if exists trg_bloquear_completar_cita_directo on citas;
create trigger trg_bloquear_completar_cita_directo before insert or update of estado on citas for each row execute function fn_bloquear_completar_cita_directo();

create or replace function fn_completar_consulta_pendiente(p_cita uuid, p_nota jsonb default null, p_seguimiento jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_rol text := auth_rol(); v_clinica uuid := auth_clinica_id();
  v_cita citas%rowtype; v_exp uuid; v_filas integer; v_creo boolean := false;
  v_nota_id uuid; v_nota notas_clinicas%rowtype;
  v_n_contenido text; v_n_diag text; v_n_cie_c text; v_n_cie_d text; v_n_inter jsonb; v_n_expl jsonb; v_n_accion jsonb; v_n_hall text;
  v_seg_id uuid; v_seg citas%rowtype; v_inicio timestamptz; v_fin timestamptz; v_seg_motivo text;
  v_nota_ok boolean := false; v_seg_ok boolean := false;
begin
  if v_uid is null or v_clinica is null then
    raise exception 'Tu sesión no es válida o tu clínica no está activa. Vuelve a iniciar sesión.' using errcode = 'P0001', hint = 'SESION_INVALIDA';
  end if;
  if not fn_sesion_activa() then
    raise exception 'Tu sesión fue cerrada desde otro dispositivo. Vuelve a iniciar sesión.' using errcode = 'P0001', hint = 'SESION_CERRADA';
  end if;
  if v_rol is null or v_rol not in ('owner', 'dentista') then
    raise exception 'Tu rol no puede completar consultas clínicas.' using errcode = 'P0001', hint = 'ROL_NO_PERMITIDO';
  end if;
  select c.* into v_cita from citas c join pacientes p on p.id = c.paciente_id where c.id = p_cita and p.clinica_id = v_clinica for update of c;
  if not found then
    raise exception 'No se encontró la cita, o no pertenece a tu clínica.' using errcode = 'P0001', hint = 'CITA_NO_ENCONTRADA';
  end if;
  if not auth_sucursal_permitida(v_cita.sucursal_id) then
    raise exception 'No tienes acceso a la sucursal de esta cita.' using errcode = 'P0001', hint = 'SUCURSAL_NO_PERMITIDA';
  end if;
  if not auth_paciente_asignado(v_cita.paciente_id) then
    raise exception 'Este paciente no está asignado a ti. Pide al propietario de la clínica que te asigne como odontólogo responsable.' using errcode = 'P0001', hint = 'PACIENTE_NO_ASIGNADO';
  end if;
  if v_rol = 'dentista' and v_cita.dentista_id is distinct from v_uid then
    raise exception 'Esta cita está asignada a otro odontólogo.' using errcode = 'P0001', hint = 'CITA_DE_OTRO_DENTISTA';
  end if;
  if not fn_clinica_tiene_funcionalidad(v_clinica, 'citas') then
    raise exception 'Tu plan no incluye la gestión de citas.' using errcode = 'P0001', hint = 'FUNCIONALIDAD_NO_INCLUIDA';
  end if;
  if p_nota is not null and not (fn_clinica_tiene_funcionalidad(v_clinica, 'notas_clinicas') and fn_clinica_tiene_funcionalidad(v_clinica, 'expediente_clinico')) then
    raise exception 'Tu plan no incluye notas clínicas.' using errcode = 'P0001', hint = 'FUNCIONALIDAD_NO_INCLUIDA';
  end if;
  if p_nota is null and p_seguimiento is null then
    raise exception 'Indica la nota clínica (o el seguimiento) que falta.' using errcode = 'P0001', hint = 'NADA_QUE_COMPLETAR';
  end if;
  if v_cita.estado <> 'completada' then
    raise exception 'La cita no está completada: finaliza la consulta de la forma habitual.' using errcode = 'P0001', hint = 'CITA_NO_COMPLETADA';
  end if;

  if p_nota is not null then
    select e.id into v_exp from expedientes e where e.paciente_id = v_cita.paciente_id;
    if v_exp is null then
      raise exception 'El paciente no tiene expediente clínico.' using errcode = 'P0001', hint = 'EXPEDIENTE_NO_ENCONTRADO';
    end if;
    v_nota_id := nullif(p_nota ->> 'id', '')::uuid;
    if v_nota_id is null then
      raise exception 'Se necesita el identificador de la nota para poder reintentar sin duplicar.' using errcode = 'P0001', hint = 'ID_REQUERIDO_PARA_REINTENTO';
    end if;
    -- Sin duplicados: si la cita ya tiene OTRA nota, no se crea una segunda.
    if exists (select 1 from notas_clinicas n where n.cita_id = p_cita and n.id <> v_nota_id) then
      raise exception 'La cita ya tiene una nota clínica; no se creó otra.' using errcode = 'P0001', hint = 'CONSULTA_YA_TIENE_NOTA';
    end if;
    v_n_contenido := coalesce(nullif(p_nota ->> 'contenido', ''), '(sin nota)');
    v_n_diag := nullif(p_nota ->> 'diagnostico', ''); v_n_cie_c := nullif(p_nota ->> 'diagnostico_cie10_codigo', ''); v_n_cie_d := nullif(p_nota ->> 'diagnostico_cie10_descripcion', '');
    v_n_inter := nullif(p_nota -> 'interrogatorio_sistemas', 'null'::jsonb); v_n_expl := nullif(p_nota -> 'exploracion_fisica', 'null'::jsonb);
    v_n_accion := nullif(p_nota -> 'accion_salud_bucal', 'null'::jsonb); v_n_hall := nullif(p_nota ->> 'hallazgos', '');
    insert into notas_clinicas (id, expediente_id, cita_id, usuario_id, contenido, tipo, diagnostico, diagnostico_cie10_codigo, diagnostico_cie10_descripcion,
                                interrogatorio_sistemas, exploracion_fisica, accion_salud_bucal, hallazgos, creado_en)
    values (v_nota_id, v_exp, p_cita, v_uid, v_n_contenido, 'consulta', v_n_diag, v_n_cie_c, v_n_cie_d, v_n_inter, v_n_expl, v_n_accion, v_n_hall,
            least(coalesce(nullif(p_nota ->> 'creado_en', '')::timestamptz, now()), now()))
    on conflict (id) do nothing;
    get diagnostics v_filas = row_count; v_creo := v_creo or v_filas > 0;
    select * into v_nota from notas_clinicas where id = v_nota_id;
    if not found then
      raise exception 'No se pudo confirmar que la nota quedó guardada.' using errcode = 'P0001', hint = 'NOTA_NO_CONFIRMADA';
    elsif not (v_nota.expediente_id is not distinct from v_exp and v_nota.cita_id is not distinct from p_cita and v_nota.usuario_id is not distinct from v_uid
           and v_nota.tipo is not distinct from 'consulta' and v_nota.contenido is not distinct from v_n_contenido and v_nota.diagnostico is not distinct from v_n_diag
           and v_nota.diagnostico_cie10_codigo is not distinct from v_n_cie_c and v_nota.diagnostico_cie10_descripcion is not distinct from v_n_cie_d
           and v_nota.interrogatorio_sistemas is not distinct from v_n_inter and v_nota.exploracion_fisica is not distinct from v_n_expl
           and v_nota.accion_salud_bucal is not distinct from v_n_accion and v_nota.hallazgos is not distinct from v_n_hall
           and v_nota.pronostico is null and v_nota.plan_tratamiento is null and v_nota.version_anterior_id is null) then
      raise exception 'Ya existe una nota con ese identificador y contenido clínico distinto. No se sobrescribió: las notas clínicas no se modifican.' using errcode = 'P0001', hint = 'NOTA_CONFLICTO';
    end if;
    v_nota_ok := true;
  end if;

  if p_seguimiento is not null then
    v_seg_id := nullif(p_seguimiento ->> 'id', '')::uuid;
    if v_seg_id is null then
      raise exception 'Se necesita el identificador del seguimiento para poder reintentar sin duplicar.' using errcode = 'P0001', hint = 'ID_REQUERIDO_PARA_REINTENTO';
    end if;
    v_inicio := (p_seguimiento ->> 'inicio')::timestamptz; v_fin := (p_seguimiento ->> 'fin')::timestamptz;
    if v_inicio is null or v_fin is null or v_fin <= v_inicio then
      raise exception 'La fecha y hora del seguimiento no son válidas.' using errcode = 'P0001', hint = 'SEGUIMIENTO_INVALIDO';
    end if;
    v_seg_motivo := coalesce(nullif(p_seguimiento ->> 'motivo_consulta', ''), nullif(p_seguimiento ->> 'motivo', ''), 'Seguimiento');
    if v_seg_id = p_cita then
      raise exception 'El identificador del seguimiento coincide con el de la propia cita. No se modificó nada.' using errcode = 'P0001', hint = 'SEGUIMIENTO_CONFLICTO';
    end if;
    begin
      insert into citas (id, paciente_id, dentista_id, inicio, fin, motivo_consulta, estado, sucursal_id)
      values (v_seg_id, v_cita.paciente_id, v_cita.dentista_id, v_inicio, v_fin, v_seg_motivo, 'agendada', v_cita.sucursal_id) on conflict (id) do nothing;
      get diagnostics v_filas = row_count; v_creo := v_creo or v_filas > 0;
    exception when exclusion_violation then
      raise exception 'El horario del seguimiento ya está ocupado para este odontólogo. Elige otra fecha u hora.' using errcode = 'P0001', hint = 'HORARIO_OCUPADO';
    end;
    select * into v_seg from citas where id = v_seg_id;
    if not found then
      raise exception 'No se pudo confirmar que el seguimiento quedó agendado.' using errcode = 'P0001', hint = 'SEGUIMIENTO_NO_CONFIRMADO';
    elsif not (v_seg.paciente_id = v_cita.paciente_id and v_seg.dentista_id is not distinct from v_cita.dentista_id and v_seg.sucursal_id is not distinct from v_cita.sucursal_id
           and v_seg.inicio = v_inicio and v_seg.fin = v_fin and v_seg.motivo_consulta is not distinct from v_seg_motivo) then
      raise exception 'El identificador del seguimiento ya pertenece a otra cita o a datos distintos (paciente, odontólogo, sucursal, horario o motivo). No se modificó nada.' using errcode = 'P0001', hint = 'SEGUIMIENTO_CONFLICTO';
    end if;
    v_seg_ok := true;
  end if;

  return jsonb_build_object('ok', true, 'ya_existia', not v_creo, 'cita_id', p_cita, 'nota_id', v_nota_id, 'seguimiento_id', v_seg_id,
                            'verificado', jsonb_build_object('nota', v_nota_ok, 'seguimiento', v_seg_ok));
end;
$$;

create or replace function fn_consultas_sin_nota(p_dias integer default 30)
returns table (cita_id uuid, paciente_id uuid, paciente_nombre text, inicio timestamptz, motivo_consulta text, dentista_id uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  -- Sin sesión válida, otro rol o un plan sin notas: lista VACÍA (no es un error: simplemente no hay nada que completar para ti).
  if auth.uid() is null or auth_clinica_id() is null or not fn_sesion_activa() then return; end if;
  if auth_rol() is null or auth_rol() not in ('owner', 'dentista') then return; end if;
  if not (fn_clinica_tiene_funcionalidad(auth_clinica_id(), 'notas_clinicas') and fn_clinica_tiene_funcionalidad(auth_clinica_id(), 'expediente_clinico')) then return; end if;
  return query
    select c.id, c.paciente_id, p.nombre_completo, c.inicio, c.motivo_consulta, c.dentista_id
      from citas c join pacientes p on p.id = c.paciente_id
     where p.clinica_id = auth_clinica_id() and c.estado = 'completada'
       and c.inicio >= now() - make_interval(days => least(greatest(coalesce(p_dias, 30), 1), 365))
       and not exists (select 1 from notas_clinicas n where n.cita_id = c.id)
       and auth_sucursal_permitida(c.sucursal_id) and auth_paciente_asignado(c.paciente_id)
       and (auth_rol() = 'owner' or c.dentista_id = auth.uid())
     order by c.inicio desc limit 100;
end;
$$;

revoke all on function fn_completar_consulta_pendiente(uuid, jsonb, jsonb) from public, anon;
revoke all on function fn_consultas_sin_nota(integer) from public, anon;
grant execute on function fn_completar_consulta_pendiente(uuid, jsonb, jsonb) to authenticated;
grant execute on function fn_consultas_sin_nota(integer) to authenticated;

commit;
