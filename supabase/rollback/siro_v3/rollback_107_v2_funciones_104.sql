-- Extracto LITERAL de 104_sirso_politica_conservacion_y_retencion_legal.sql (sha256 10a16d82…6f75ada), líneas 178–204 y 221–271.
-- Sin begin/commit: lo incluye rollback_107_v2.sql dentro de SU transacción. Generado con sed; no editar a mano.
create or replace function fn_proteger_paciente_conservacion() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('siro.supresion_autorizada', true), '') = 'on' then return old; end if;   -- solo lo fija fn_suprimir_paciente_autorizado
  if fn_retencion_legal_activa(old.clinica_id, old.id) then
    raise exception 'Hay una retención legal activa: no se puede eliminar este paciente.' using errcode = 'P0001', hint = 'RETENCION_LEGAL_ACTIVA';
  end if;
  if fn_paciente_tiene_registros_clinicos(old.id) then
    raise exception 'Un paciente con registros clínicos no se elimina físicamente: archívalo. La supresión solo procede por el procedimiento autorizado, vencido el plazo de conservación.' using errcode = 'P0001', hint = 'EXPEDIENTE_SUJETO_A_CONSERVACION';
  end if;
  return old;
end;
$$;
revoke all on function fn_proteger_paciente_conservacion() from public, anon, authenticated;
drop trigger if exists trg_proteger_paciente_conservacion on public.pacientes;
create trigger trg_proteger_paciente_conservacion before delete on public.pacientes for each row execute function fn_proteger_paciente_conservacion();

create or replace function fn_proteger_clinica_retencion() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if fn_retencion_legal_clinica(old.id) then
    raise exception 'Hay una retención legal activa en esta clínica: no se puede eliminar.' using errcode = 'P0001', hint = 'RETENCION_LEGAL_ACTIVA';
  end if;
  return old;
end;
$$;
revoke all on function fn_proteger_clinica_retencion() from public, anon, authenticated;
drop trigger if exists trg_proteger_clinica_retencion on public.clinicas;
create trigger trg_proteger_clinica_retencion before delete on public.clinicas for each row execute function fn_proteger_clinica_retencion();
create or replace function fn_colocar_retencion_legal(p_clinica uuid, p_paciente uuid, p_categoria text, p_motivo text, p_referencia text, p_actor uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is not null then raise exception 'Solo el servidor puede colocar una retención legal.' using errcode = 'P0001', hint = 'SOLO_SERVIDOR'; end if;
  if not exists (select 1 from clinicas where id = p_clinica) then raise exception 'Clínica no encontrada.' using errcode = 'P0001', hint = 'CLINICA_NO_ENCONTRADA'; end if;
  if p_paciente is not null and not exists (select 1 from pacientes where id = p_paciente and clinica_id = p_clinica) then raise exception 'El paciente no pertenece a la clínica.' using errcode = 'P0001', hint = 'PACIENTE_INCOHERENTE'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 10 then raise exception 'El motivo es obligatorio (mínimo 10 caracteres).' using errcode = 'P0001', hint = 'MOTIVO_REQUERIDO'; end if;
  insert into retenciones_legales (clinica_id, paciente_id, categoria, motivo, referencia, creado_por) values (p_clinica, p_paciente, p_categoria, p_motivo, p_referencia, p_actor) returning id into v_id;
  insert into conservacion_historial (clinica_id, paciente_id, categoria, accion, valor_nuevo, motivo, actor) values (p_clinica, p_paciente, p_categoria, 'retencion_legal_colocada', jsonb_build_object('retencion_id', v_id, 'referencia', p_referencia), p_motivo, p_actor);
  return v_id;
end;
$$;
revoke all on function fn_colocar_retencion_legal(uuid, uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function fn_colocar_retencion_legal(uuid, uuid, text, text, text, uuid) to service_role;

create or replace function fn_liberar_retencion_legal(p_id uuid, p_motivo text, p_actor uuid) returns void language plpgsql security definer set search_path = public as $$
declare r retenciones_legales%rowtype;
begin
  if auth.uid() is not null then raise exception 'Solo el servidor puede liberar una retención legal.' using errcode = 'P0001', hint = 'SOLO_SERVIDOR'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 10 then raise exception 'El motivo es obligatorio (mínimo 10 caracteres).' using errcode = 'P0001', hint = 'MOTIVO_REQUERIDO'; end if;
  update retenciones_legales set liberada_en = now(), liberada_por = p_actor, motivo_liberacion = p_motivo where id = p_id and liberada_en is null returning * into r;
  if not found then raise exception 'La retención no existe o ya fue liberada.' using errcode = 'P0001', hint = 'RETENCION_NO_ENCONTRADA'; end if;
  insert into conservacion_historial (clinica_id, paciente_id, categoria, accion, valor_nuevo, motivo, actor) values (r.clinica_id, r.paciente_id, r.categoria, 'retencion_legal_liberada', jsonb_build_object('retencion_id', p_id), p_motivo, p_actor);
end;
$$;
revoke all on function fn_liberar_retencion_legal(uuid, text, uuid) from public, anon, authenticated;
grant execute on function fn_liberar_retencion_legal(uuid, text, uuid) to service_role;

create or replace function fn_suprimir_paciente_autorizado(p_paciente uuid, p_motivo text, p_actor uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_estado jsonb; v_clinica uuid;
begin
  if auth.uid() is not null then raise exception 'Solo el servidor puede ejecutar una supresión autorizada.' using errcode = 'P0001', hint = 'SOLO_SERVIDOR'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 20 then raise exception 'El motivo de la supresión es obligatorio (mínimo 20 caracteres).' using errcode = 'P0001', hint = 'MOTIVO_REQUERIDO'; end if;
  v_estado := fn_conservacion_paciente(p_paciente);
  if v_estado ->> 'error' is not null then raise exception 'Paciente no encontrado.' using errcode = 'P0001', hint = 'PACIENTE_NO_ENCONTRADO'; end if;
  if (v_estado ->> 'puede_suprimirse')::boolean is not true then
    -- El rechazo se DEVUELVE (no se lanza): una excepción revertiría la fila de historial del intento rechazado.
    insert into conservacion_historial (clinica_id, paciente_id, categoria, accion, valor_nuevo, motivo, actor)
      select clinica_id, id, 'expediente_clinico', 'supresion_rechazada', v_estado, p_motivo, p_actor from pacientes where id = p_paciente;
    return v_estado || jsonb_build_object('ok', false);
  end if;
  select clinica_id into v_clinica from pacientes where id = p_paciente;
  insert into conservacion_historial (clinica_id, paciente_id, categoria, accion, valor_nuevo, motivo, actor) values (v_clinica, p_paciente, 'expediente_clinico', 'supresion_autorizada', v_estado, p_motivo, p_actor);
  perform set_config('siro.supresion_autorizada', 'on', true);
  delete from pacientes where id = p_paciente;
  perform set_config('siro.supresion_autorizada', 'off', true);
  return v_estado || jsonb_build_object('ok', true);
end;
$$;
revoke all on function fn_suprimir_paciente_autorizado(uuid, text, uuid) from public, anon, authenticated;
grant execute on function fn_suprimir_paciente_autorizado(uuid, text, uuid) to service_role;
