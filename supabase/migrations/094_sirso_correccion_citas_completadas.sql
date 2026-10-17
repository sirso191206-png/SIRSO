-- ============================================================
-- SIRO — Corrección de citas COMPLETADAS: con motivo, por rol y con auditoría completa
-- Migración 094 (fase 7). Cierra la decisión «quién puede corregir, cancelar o reabrir citas completadas» (antes: propuesta 004).
-- ------------------------------------------------------------
-- HALLAZGO medido con roles reales (fase 6): sobre una cita COMPLETADA con nota, el propietario, la recepción y el propio dentista asignado podían dejarla
-- en cancelada, no asistió o AGENDADA directamente; la auditoría guardaba actor y fecha pero solo el estado NUEVO (ni el anterior ni el motivo).
-- SEPARACIÓN de casos:
--   · cancelar / registrar inasistencia de una cita que TODAVÍA NO se completó → sin cambios (acción administrativa libre, como siempre);
--   · corregir o reabrir una cita YA COMPLETADA → solo mediante fn_corregir_estado_cita (esta migración); el cambio directo de estado se BLOQUEA;
--   · corregir el contenido de una NOTA clínica → sigue siendo imposible (las notas son inmutables); se corrige con una nota NUEVA ligada a la misma cita.
-- MATRIZ POR ROL (decisión adoptada con la recomendación técnica; ajustable con una migración posterior):
--   propietario ........ puede pasar la cita completada a cancelada, no_asistio o agendada (reabrir), con motivo;
--   odontólogo ......... SOLO puede REABRIR (→ agendada) una cita completada que es SUYA (odontólogo de la cita y paciente asignado a él), con motivo;
--   recepción / asistente  no pueden: no intervienen en el acto clínico ya cerrado.
-- Toda corrección exige un MOTIVO (10–500 caracteres) y deja en la auditoría: actor, rol, fecha, estado ANTERIOR, estado NUEVO, motivo y cuántas notas están ligadas.
-- NO toca notas, pagos ni seguimientos. REABRIR y volver a finalizar crea una nota ADICIONAL (las notas son inmutables: la primera queda intacta y ambas
-- quedan en el expediente); un doble clic no duplica nada (la segunda llamada responde CITA_NO_COMPLETADA). Seguro de re-ejecutar. Rollback: supabase/rollback/094_rollback.sql.
-- ============================================================
begin;

create or replace function fn_proteger_cita_completada() returns trigger
language plpgsql set search_path = public as $$
begin
  -- SECURITY INVOKER: current_user es el rol que ejecuta la sentencia (authenticated/anon desde la API; el propietario dentro de una función SECURITY DEFINER).
  if old.estado = 'completada' and new.estado is distinct from 'completada' and current_user in ('authenticated', 'anon') then
    raise exception 'Una cita completada no se modifica directamente: usa la corrección de estado, que exige un motivo y queda registrada.' using errcode = 'P0001', hint = 'CORREGIR_ESTADO_REQUIERE_MOTIVO';
  end if;
  return new;
end;
$$;
revoke all on function fn_proteger_cita_completada() from public, anon, authenticated;
drop trigger if exists trg_proteger_cita_completada on citas;
create trigger trg_proteger_cita_completada before update of estado on citas for each row execute function fn_proteger_cita_completada();

create or replace function fn_corregir_estado_cita(p_cita uuid, p_estado text, p_motivo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_rol text := auth_rol(); v_clinica uuid := auth_clinica_id();
  v_cita citas%rowtype; v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if v_uid is null or v_clinica is null then
    raise exception 'Tu sesión no es válida o tu clínica no está activa. Vuelve a iniciar sesión.' using errcode = 'P0001', hint = 'SESION_INVALIDA';
  end if;
  if not fn_sesion_activa() then
    raise exception 'Tu sesión fue cerrada desde otro dispositivo. Vuelve a iniciar sesión.' using errcode = 'P0001', hint = 'SESION_CERRADA';
  end if;
  if v_rol is null or v_rol not in ('owner', 'dentista') then
    raise exception 'Tu rol no puede corregir una consulta ya completada. Pide al propietario de la clínica que lo haga.' using errcode = 'P0001', hint = 'ROL_NO_PERMITIDO';
  end if;
  if p_estado is null or p_estado not in ('cancelada', 'no_asistio', 'agendada') then
    raise exception 'El estado indicado no es válido para corregir una consulta completada.' using errcode = 'P0001', hint = 'ESTADO_NO_PERMITIDO';
  end if;
  if length(v_motivo) < 10 or length(v_motivo) > 500 then
    raise exception 'Indica el motivo de la corrección (entre 10 y 500 caracteres).' using errcode = 'P0001', hint = 'MOTIVO_REQUERIDO';
  end if;
  select c.* into v_cita from citas c join pacientes p on p.id = c.paciente_id where c.id = p_cita and p.clinica_id = v_clinica for update of c;
  if not found then
    raise exception 'No se encontró la cita, o no pertenece a tu clínica.' using errcode = 'P0001', hint = 'CITA_NO_ENCONTRADA';
  end if;
  if not auth_sucursal_permitida(v_cita.sucursal_id) then
    raise exception 'No tienes acceso a la sucursal de esta cita.' using errcode = 'P0001', hint = 'SUCURSAL_NO_PERMITIDA';
  end if;
  if v_cita.estado <> 'completada' then
    raise exception 'La cita no está completada: no hay nada que corregir (o ya se corrigió).' using errcode = 'P0001', hint = 'CITA_NO_COMPLETADA';
  end if;
  if v_rol = 'dentista' then
    if v_cita.dentista_id is distinct from v_uid or not auth_paciente_asignado(v_cita.paciente_id) then
      raise exception 'Solo el odontólogo responsable de esta consulta (o el propietario) puede corregirla.' using errcode = 'P0001', hint = 'CITA_DE_OTRO_DENTISTA';
    end if;
    if p_estado <> 'agendada' then
      raise exception 'Un odontólogo solo puede reabrir su consulta (volver a «agendada»); cancelar o marcar inasistencia lo hace el propietario.' using errcode = 'P0001', hint = 'ESTADO_NO_PERMITIDO_PARA_ROL';
    end if;
  end if;
  update citas set estado = p_estado where id = p_cita;
  insert into auditoria (usuario_id, accion, entidad, entidad_id, detalle, clinica_id)
  values (v_uid, 'corregir_estado_cita', 'citas', p_cita,
          jsonb_build_object('antes', 'completada', 'despues', p_estado, 'motivo', v_motivo, 'rol', v_rol, 'notas_ligadas', (select count(*) from notas_clinicas n where n.cita_id = p_cita)), v_clinica);
  return jsonb_build_object('ok', true, 'cita_id', p_cita, 'antes', 'completada', 'despues', p_estado);
end;
$$;
revoke all on function fn_corregir_estado_cita(uuid, text, text) from public, anon;
grant execute on function fn_corregir_estado_cita(uuid, text, text) to authenticated;

commit;
