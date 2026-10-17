-- ============================================================
-- SIRO — El FIRMANTE de una receta, un consentimiento o una referencia médica es quien está autenticado
-- Migración 101 (fase final).
-- ------------------------------------------------------------
-- DEFECTO (hallazgo de la fase 8): la 098 cerró el cruce entre clínicas de `dentista_id`, pero DENTRO de la misma clínica un odontólogo podía firmar una receta, un
-- consentimiento o una referencia médica como OTRO odontólogo (el prescriptor es una identidad legal: lleva su nombre, cédula y firma).
-- CORRECCIÓN: con sesión de usuario, `dentista_id` debe ser quien guarda; solo el PROPIETARIO puede registrarlo a nombre de otro, y ese otro debe ser un odontólogo
-- de la clínica (rol dentista o propietario que ejerce como dentista: fn_es_dentista_de_clinica). Se rechaza (no se reasigna en silencio). Un valor vacío se acepta
-- (se conserva el comportamiento actual). La operación administrativa (sin sesión de usuario) conserva su libertad. Solo actúa al INSERTAR.
-- DECISIÓN HUMANA que esto fija (ajustable con una migración posterior): «solo el propietario puede firmar en nombre de un odontólogo». Rollback: supabase/rollback/101_rollback.sql.
-- ============================================================
begin;
create or replace function fn_validar_firmante() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_clinica uuid;
begin
  if auth.uid() is null or new.dentista_id is null or new.dentista_id = auth.uid() then return new; end if;
  select p.clinica_id into v_clinica from pacientes p where p.id = new.paciente_id;
  if auth_rol() is distinct from 'owner' or v_clinica is null or not fn_es_dentista_de_clinica(new.dentista_id, v_clinica) then
    raise exception 'El firmante del documento debe ser quien lo registra (solo el propietario puede registrarlo a nombre de otro odontólogo de la clínica).' using errcode = 'P0001', hint = 'FIRMANTE_INCOHERENTE';
  end if;
  return new;
end;
$$;
revoke all on function fn_validar_firmante() from public, anon, authenticated;
drop trigger if exists trg_firmante on recetas;
create trigger trg_firmante before insert on recetas for each row execute function fn_validar_firmante();
drop trigger if exists trg_firmante on consentimientos_informados;
create trigger trg_firmante before insert on consentimientos_informados for each row execute function fn_validar_firmante();
drop trigger if exists trg_firmante on referencias_medicas;
create trigger trg_firmante before insert on referencias_medicas for each row execute function fn_validar_firmante();
commit;
