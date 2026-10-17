-- ============================================================
-- SIRO — Notas: separar la FECHA DEL EVENTO, lo que DIJO el dispositivo y la fecha de RECEPCIÓN en el servidor
-- Migración 097 (fase 7).
-- ------------------------------------------------------------
-- Una nota capturada SIN CONEXIÓN lleva la hora del dispositivo. Hasta ahora, si el reloj iba adelantado, la fecha se acotaba a «ahora» y se PERDÍA lo que el
-- dispositivo había dicho. Ahora se conservan las tres:
--   creado_en .......... fecha del evento clínico, la que usa SIRO (futuro acotado a «ahora», como desde la 092);
--   creado_en_cliente .. lo que el dispositivo declaró ANTES de acotarlo (solo si el cliente la envió explícitamente); NULL si usó la hora del servidor;
--   recibida_en ........ cuándo la RECIBIÓ el servidor: lo fija el servidor y un usuario NO puede cambiarlo (la operación administrativa puede conservar una al importar).
-- Las notas existentes quedan con recibida_en = NULL («anterior a esta migración»): no se inventa un dato histórico. No cambia la política de retrofecha (093).
-- Seguro de re-ejecutar. Rollback: supabase/rollback/097_rollback.sql (restaura el disparador de la 093; las columnas se conservan para no perder datos).
-- ============================================================
begin;
alter table notas_clinicas add column if not exists creado_en_cliente timestamptz;
alter table notas_clinicas add column if not exists recibida_en timestamptz;

create or replace function fn_validar_autoria_nota() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_max integer;
begin
  if auth.uid() is not null then
    if new.usuario_id is null then
      new.usuario_id := auth.uid();
    elsif new.usuario_id <> auth.uid() then
      raise exception 'El autor de una nota clínica debe ser quien la guarda.' using errcode = 'P0001', hint = 'NOTA_AUTOR_INCOHERENTE';
    end if;
    v_max := fn_config_horas_positivas('nota_retrofecha_max_horas');
    if v_max is not null and new.creado_en is not null and new.creado_en < now() - make_interval(hours => v_max) then
      raise exception 'La fecha de la nota es más antigua que el límite permitido (% horas).', v_max using errcode = 'P0001', hint = 'NOTA_FECHA_FUERA_DE_LIMITE';
    end if;
    new.recibida_en := now();                                   -- lo fija el SERVIDOR: el cliente no puede elegirlo
    new.creado_en_cliente := case when new.creado_en is distinct from now() then new.creado_en else null end;  -- solo si la envió explícitamente
  else
    new.recibida_en := coalesce(new.recibida_en, now());        -- la operación administrativa puede conservar la de una importación
  end if;
  if new.creado_en is not null and new.creado_en > now() then new.creado_en := now(); end if;
  return new;
end;
$$;
revoke all on function fn_validar_autoria_nota() from public, anon, authenticated;
commit;
