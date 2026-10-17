-- ============================================================
-- SIRO — Integridad de autoría de las notas y de las referencias entre clínicas en las citas
-- Migración 092 (hallazgos de la auditoría independiente de la fase 5, reproducidos bajo RLS real)
-- ------------------------------------------------------------
-- DEFECTOS (se reprodujeron ANTES de esta migración con `integridad_autoria_referencias_test.sql`):
--  1) AUTORÍA: un dentista podía guardar una nota clínica con `usuario_id` de OTRO usuario (p. ej. el propietario): la nota es inmutable,
--     pero su autor era falsificable por la API.
--  2) FECHA: `creado_en` de una nota podía ser CUALQUIER fecha, incluso dentro de un año.
--  3) REFERENCIAS ENTRE CLÍNICAS: una cita podía apuntar a un odontólogo (`dentista_id`) o a un sillón (`sillon_id`) de OTRA clínica. Como las
--     restricciones de no traslape son por odontólogo/sillón sin distinguir clínica, una clínica podía OCUPAR la agenda de otra y, por el error
--     de traslape, averiguar si ese odontólogo tenía algo a esa hora (oráculo + denegación de servicio entre tenants).
-- CORRECCIÓN (en la base de datos, no solo en el frontend):
--  * Notas: con sesión de usuario, `usuario_id` debe ser quien guarda (si falta se rellena; si es otro → NOTA_AUTOR_INCOHERENTE). Una fecha
--    FUTURA se acota a ahora (como ya hacen fn_finalizar_consulta y fn_completar_consulta_pendiente); una fecha pasada se CONSERVA (captura sin
--    conexión). La operación administrativa (sin sesión de usuario: importaciones, mantenimiento) conserva su libertad.
--  * Citas: el odontólogo y el sillón deben pertenecer a la clínica del paciente; una respuesta ÚNICA por campo para «no existe» y «es de otra
--    clínica» (sin oráculo). Solo actúa al insertar o al CAMBIAR dentista_id, sillon_id o paciente_id: una cita legada que ya apunte fuera se
--    sigue pudiendo gestionar (confirmar, cancelar…). No toca datos existentes, políticas ni permisos de tablas. Seguro de re-ejecutar.
-- NO resuelto aquí (decisión humana): el límite de RETROFECHA de una nota (captura sin conexión legítima) y quién puede sacar una cita de «completada».
-- ============================================================
begin;

create or replace function fn_validar_autoria_nota() returns trigger
language plpgsql set search_path = public as $$
begin
  -- SECURITY INVOKER a propósito: auth.uid() es el usuario de la sesión (también dentro de una función SECURITY DEFINER que se ejecuta en su nombre).
  if auth.uid() is not null then
    if new.usuario_id is null then
      new.usuario_id := auth.uid();
    elsif new.usuario_id <> auth.uid() then
      raise exception 'El autor de una nota clínica debe ser quien la guarda.' using errcode = 'P0001', hint = 'NOTA_AUTOR_INCOHERENTE';
    end if;
  end if;
  if new.creado_en is not null and new.creado_en > now() then new.creado_en := now(); end if;
  return new;
end;
$$;
revoke all on function fn_validar_autoria_nota() from public, anon, authenticated;
drop trigger if exists trg_validar_autoria_nota on notas_clinicas;
create trigger trg_validar_autoria_nota before insert on notas_clinicas for each row execute function fn_validar_autoria_nota();

create or replace function fn_validar_referencias_cita() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_clinica uuid;
begin
  select p.clinica_id into v_clinica from pacientes p where p.id = new.paciente_id;
  if new.dentista_id is not null and not exists (select 1 from usuarios u where u.id = new.dentista_id and v_clinica is not null and u.clinica_id = v_clinica) then
    raise exception 'El odontólogo indicado no pertenece a la clínica del paciente.' using errcode = 'P0001', hint = 'CITA_DENTISTA_INCOHERENTE';
  end if;
  if new.sillon_id is not null and not exists (
    select 1 from sillones s join consultorios c on c.id = s.consultorio_id join sucursales su on su.id = c.sucursal_id where s.id = new.sillon_id and v_clinica is not null and su.clinica_id = v_clinica
  ) then
    raise exception 'El sillón indicado no pertenece a la clínica del paciente.' using errcode = 'P0001', hint = 'CITA_SILLON_INCOHERENTE';
  end if;
  return new;
end;
$$;
revoke all on function fn_validar_referencias_cita() from public, anon, authenticated;
drop trigger if exists trg_validar_referencias_cita on citas;
create trigger trg_validar_referencias_cita before insert or update of dentista_id, sillon_id, paciente_id on citas for each row execute function fn_validar_referencias_cita();

commit;
