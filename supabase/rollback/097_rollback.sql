-- ROLLBACK de la migración 097: restaura el disparador de la migración 093. Las columnas creado_en_cliente y recibida_en SE CONSERVAN (borrarlas perdería datos); quedan sin uso.
begin;
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
  end if;
  if new.creado_en is not null and new.creado_en > now() then new.creado_en := now(); end if;
  return new;
end;
$$;
revoke all on function fn_validar_autoria_nota() from public, anon, authenticated;
commit;
