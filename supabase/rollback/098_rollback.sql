-- ROLLBACK de la migración 098: retira los disparadores y funciones nuevos y restaura fn_validar_referencias_cita y su disparador tal como los dejó la 092. No toca datos. Seguro de re-ejecutar.
begin;
drop trigger if exists trg_ref_dentista on tratamientos;
drop trigger if exists trg_ref_dentista on recetas;
drop trigger if exists trg_ref_dentista on consentimientos_informados;
drop trigger if exists trg_ref_dentista on referencias_medicas;
drop trigger if exists trg_ref_tratamiento on pagos;
drop trigger if exists trg_ref_tratamiento on consentimientos_informados;
drop trigger if exists trg_ref_tratamiento on fotografias;
drop trigger if exists trg_ref_tratamiento on odontograma_piezas;
drop trigger if exists trg_actor_registro on pagos;
drop trigger if exists trg_actor_registro on signos_vitales;
drop trigger if exists trg_actor_registro on documentos_clinicos;
drop trigger if exists trg_actor_registro on fotografias;
drop function if exists fn_validar_dentista_misma_clinica();
drop function if exists fn_validar_tratamiento_mismo_paciente();
drop function if exists fn_validar_actor();

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
