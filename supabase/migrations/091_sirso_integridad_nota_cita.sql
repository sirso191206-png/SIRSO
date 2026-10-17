-- ============================================================
-- SIRO — Una nota solo puede ligarse a una cita DEL MISMO PACIENTE de su expediente
-- Migración 091
-- ------------------------------------------------------------
-- DEFECTO (auditoría multi-tenant de la fase 4, reproducido bajo RLS real): `notas_clinicas.cita_id` solo tiene una FK a `citas` y la
-- política `notas_insert` solo mira el expediente. Un dentista podía guardar una nota de SU paciente ligada a:
--   (A) una cita de OTRO paciente de la misma clínica, o
--   (B) una cita de OTRA CLÍNICA (referencia cruzada entre tenants),
-- y con una cita inexistente la FK respondía un error DISTINTO (23503): un ORÁCULO DE EXISTENCIA de ids de cita ajenos.
-- CORRECCIÓN: un trigger BEFORE INSERT (SECURITY DEFINER, para ver filas aunque RLS las oculte) exige que la cita pertenezca al mismo
-- paciente del expediente, y responde EXACTAMENTE lo mismo para «no existe», «es de otro paciente» y «es de otra clínica» (sin oráculo).
-- Corre antes que la FK. No toca notas existentes (solo INSERT; las notas son inmutables); para detectar las ya incoherentes hay una
-- consulta de solo lectura en consultas_verificacion_solo_lectura.sql. No cambia políticas ni permisos. Seguro de re-ejecutar.
-- ============================================================
begin;

create or replace function fn_validar_nota_cita() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.cita_id is not null and not exists (
    select 1 from citas c join expedientes e on e.id = new.expediente_id where c.id = new.cita_id and c.paciente_id = e.paciente_id
  ) then
    raise exception 'La cita indicada no corresponde al paciente de este expediente.' using errcode = 'P0001', hint = 'NOTA_CITA_INCOHERENTE';
  end if;
  return new;
end;
$$;
revoke all on function fn_validar_nota_cita() from public, anon, authenticated;  -- función de trigger: no se invoca directamente

drop trigger if exists trg_validar_nota_cita on notas_clinicas;
create trigger trg_validar_nota_cita before insert on notas_clinicas for each row execute function fn_validar_nota_cita();

commit;
