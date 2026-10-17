-- ============================================================
-- SIRO — Límite de RETROFECHA de las notas clínicas: configuración EXPLÍCITA, sin valor por omisión
-- Migración 093 (fase 6)
-- ------------------------------------------------------------
-- La captura SIN CONEXIÓN es legítima: una nota se escribe en el dispositivo y puede sincronizarse horas o días después con su `creado_en` original.
-- Por eso SIRO NO impone un límite por su cuenta: es una decisión del propietario del producto (clínica/legal), no técnica.
-- Esta migración solo deja disponible la PALANCA:
--   plataforma_config.clave = 'nota_retrofecha_max_horas'   valor = entero de 1 a 999999 (horas)
--   · ausente, vacía o inválida ('abc', '0', '-5', '1.5', '12 h', 7 cifras…) → SIN límite (el comportamiento de siempre).
--   · definida → una nota creada por un USUARIO con `creado_en` más antiguo que ahora − N horas se RECHAZA con NOTA_FECHA_FUERA_DE_LIMITE.
--     Se rechaza (no se «corrige» en silencio): modificar la fecha de un registro clínico sin que nadie lo decida sería alterar la trazabilidad.
-- No se aplica a la operación administrativa (sin sesión de usuario: importaciones, mantenimiento). La fecha FUTURA sigue acotándose a ahora (092).
-- La comprobación vive en el trigger de la 092, así que cubre también a fn_finalizar_consulta y fn_completar_consulta_pendiente: si la nota va fuera del
-- límite, TODA la finalización se revierte (la cita no queda completada sin nota) y el cliente conserva la operación como conflicto.
-- Seguro de re-ejecutar; no toca datos, políticas ni permisos de tablas.
-- ============================================================
begin;

create or replace function fn_config_horas_positivas(p_clave text) returns integer
language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  select pc.valor into v from plataforma_config pc where pc.clave = p_clave;
  if v is null or v !~ '^[0-9]{1,6}$' or v::integer < 1 then return null; end if;
  return v::integer;
end;
$$;
revoke all on function fn_config_horas_positivas(text) from public, anon, authenticated;

-- SECURITY DEFINER para poder leer la configuración; auth.uid() sigue siendo el usuario de la sesión (lee la claim del JWT, no el rol de PostgreSQL).
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
