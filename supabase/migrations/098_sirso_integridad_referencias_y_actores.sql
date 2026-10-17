-- ============================================================
-- SIRO — Integridad de referencias entre clínicas y de AUTORÍA en el resto de tablas clínicas
-- Migración 098 (fase 8, auditoría local). Mismo patrón que 091/092, aplicado a lo que aquellas dejaron abierto.
-- ------------------------------------------------------------
-- DEFECTOS (reproducidos bajo RLS real ANTES de esta migración; ver supabase/tests/integridad_referencias_y_actores_test.sql):
--  1) tratamientos / recetas / consentimientos_informados / referencias_medicas aceptaban un `dentista_id` de OTRA clínica.
--  2) citas aceptaba un `consultorio_id` de OTRA clínica (omisión de la 092, que cerró dentista_id y sillon_id pero no consultorio_id).
--  3) pagos / consentimientos_informados / fotografias / odontograma_piezas aceptaban un `tratamiento_id` de OTRO paciente o de OTRA clínica.
--  4) pagos.registrado_por, signos_vitales.registrado_por, documentos_clinicos.subido_por y fotografias.subido_por aceptaban el id de OTRA persona
--     (la autoría de un pago, un documento o una fotografía era falsificable por la API).
-- Efecto de 1–3: referencias cruzadas entre tenants y un ORÁCULO de existencia (la FK respondía distinto para un id inexistente que para uno ajeno).
-- CORRECCIÓN (en la base de datos, no solo en el frontend):
--  · una sola respuesta para «no existe» y «es de otra clínica/paciente» (sin oráculo);
--  · solo actúa al INSERTAR o al CAMBIAR esas columnas: un registro legado que ya apunte fuera se sigue pudiendo gestionar;
--  · autoría: con sesión de usuario, la persona que registra debe ser quien está autenticado (si falta se rellena; si es otra → ACTOR_INCOHERENTE).
--    La operación administrativa (sin sesión de usuario: importaciones, mantenimiento) conserva su libertad. El frontend ya envía siempre el id de la sesión.
-- NO resuelto aquí (decisión humana): quién puede firmar una receta o un consentimiento como OTRO odontólogo DE LA MISMA clínica (hoy sigue permitido).
-- No toca datos existentes ni permisos de tablas. Seguro de re-ejecutar. Rollback: supabase/rollback/098_rollback.sql.
-- ============================================================
begin;

create or replace function fn_validar_dentista_misma_clinica() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_clinica uuid;
begin
  if new.dentista_id is null then return new; end if;
  select p.clinica_id into v_clinica from pacientes p where p.id = new.paciente_id;
  if v_clinica is null or not exists (select 1 from usuarios u where u.id = new.dentista_id and u.clinica_id = v_clinica) then
    raise exception 'El odontólogo indicado no pertenece a la clínica del paciente.' using errcode = 'P0001', hint = 'REFERENCIA_DENTISTA_INCOHERENTE';
  end if;
  return new;
end;
$$;
revoke all on function fn_validar_dentista_misma_clinica() from public, anon, authenticated;

create or replace function fn_validar_tratamiento_mismo_paciente() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tratamiento_id is null then return new; end if;
  if not exists (select 1 from tratamientos t where t.id = new.tratamiento_id and t.paciente_id = new.paciente_id) then
    raise exception 'El tratamiento indicado no corresponde a este paciente.' using errcode = 'P0001', hint = 'REFERENCIA_TRATAMIENTO_INCOHERENTE';
  end if;
  return new;
end;
$$;
revoke all on function fn_validar_tratamiento_mismo_paciente() from public, anon, authenticated;

-- Autoría: el nombre de la columna llega como argumento del trigger (registrado_por / subido_por).
create or replace function fn_validar_actor() returns trigger
language plpgsql set search_path = public as $$
declare v_col text := tg_argv[0]; v_actual text;
begin
  if auth.uid() is null then return new; end if;
  v_actual := to_jsonb(new) ->> v_col;
  if v_actual is null then
    new := jsonb_populate_record(new, jsonb_build_object(v_col, auth.uid()));
  elsif v_actual::uuid <> auth.uid() then
    raise exception 'La persona que registra debe ser quien está autenticado.' using errcode = 'P0001', hint = 'ACTOR_INCOHERENTE';
  end if;
  return new;
end;
$$;
revoke all on function fn_validar_actor() from public, anon, authenticated;

-- citas: se añade consultorio_id a lo que ya validaba la 092 (dentista_id y sillon_id).
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
  if new.consultorio_id is not null and not exists (
    select 1 from consultorios c join sucursales su on su.id = c.sucursal_id where c.id = new.consultorio_id and v_clinica is not null and su.clinica_id = v_clinica
  ) then
    raise exception 'El consultorio indicado no pertenece a la clínica del paciente.' using errcode = 'P0001', hint = 'CITA_CONSULTORIO_INCOHERENTE';
  end if;
  return new;
end;
$$;
revoke all on function fn_validar_referencias_cita() from public, anon, authenticated;
drop trigger if exists trg_validar_referencias_cita on citas;
create trigger trg_validar_referencias_cita before insert or update of dentista_id, sillon_id, consultorio_id, paciente_id on citas for each row execute function fn_validar_referencias_cita();

drop trigger if exists trg_ref_dentista on tratamientos;
create trigger trg_ref_dentista before insert or update of dentista_id, paciente_id on tratamientos for each row execute function fn_validar_dentista_misma_clinica();
drop trigger if exists trg_ref_dentista on recetas;
create trigger trg_ref_dentista before insert or update of dentista_id, paciente_id on recetas for each row execute function fn_validar_dentista_misma_clinica();
drop trigger if exists trg_ref_dentista on consentimientos_informados;
create trigger trg_ref_dentista before insert or update of dentista_id, paciente_id on consentimientos_informados for each row execute function fn_validar_dentista_misma_clinica();
drop trigger if exists trg_ref_dentista on referencias_medicas;
create trigger trg_ref_dentista before insert or update of dentista_id, paciente_id on referencias_medicas for each row execute function fn_validar_dentista_misma_clinica();

drop trigger if exists trg_ref_tratamiento on pagos;
create trigger trg_ref_tratamiento before insert or update of tratamiento_id, paciente_id on pagos for each row execute function fn_validar_tratamiento_mismo_paciente();
drop trigger if exists trg_ref_tratamiento on consentimientos_informados;
create trigger trg_ref_tratamiento before insert or update of tratamiento_id, paciente_id on consentimientos_informados for each row execute function fn_validar_tratamiento_mismo_paciente();
drop trigger if exists trg_ref_tratamiento on fotografias;
create trigger trg_ref_tratamiento before insert or update of tratamiento_id, paciente_id on fotografias for each row execute function fn_validar_tratamiento_mismo_paciente();
drop trigger if exists trg_ref_tratamiento on odontograma_piezas;
create trigger trg_ref_tratamiento before insert or update of tratamiento_id, paciente_id on odontograma_piezas for each row execute function fn_validar_tratamiento_mismo_paciente();

drop trigger if exists trg_actor_registro on pagos;
create trigger trg_actor_registro before insert on pagos for each row execute function fn_validar_actor('registrado_por');
drop trigger if exists trg_actor_registro on signos_vitales;
create trigger trg_actor_registro before insert on signos_vitales for each row execute function fn_validar_actor('registrado_por');
drop trigger if exists trg_actor_registro on documentos_clinicos;
create trigger trg_actor_registro before insert on documentos_clinicos for each row execute function fn_validar_actor('subido_por');
drop trigger if exists trg_actor_registro on fotografias;
create trigger trg_actor_registro before insert on fotografias for each row execute function fn_validar_actor('subido_por');

commit;
