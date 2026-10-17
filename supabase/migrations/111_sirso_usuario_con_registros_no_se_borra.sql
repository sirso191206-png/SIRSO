-- ============================================================
-- SIRO — CANDIDATO 111 (v7): un usuario con registros clínicos o de cobro A SU NOMBRE no se borra. ESTADO: candidato, no integrado.
-- DEFECTO H23 (reproducido en el stack local de Supabase, v7 E13): la Edge Function eliminar-usuario confía en que la base RECHACE el borrado con
--   23503 («tiene citas, tratamientos o pagos a su nombre»), pero TODAS las FK hacia usuarios son ON DELETE SET NULL: el borrado se acepta y la
--   autoría desaparece (tratamientos.dentista_id, notas_clinicas.usuario_id, pagos.registrado_por… quedan en NULL). Pérdida de autoría clínica.
-- CORRECCIÓN MÍNIMA: disparador BEFORE DELETE que lanza 23503 (el contrato que la función YA espera) si el usuario figura como autor/actor en
--   registros clínicos o de cobro. No cambia FK, ni la Edge Function, ni datos. Las referencias ADMINISTRATIVAS (creado_por de catálogos, listas,
--   horarios, suscripciones, documentos legales; asignaciones; auditoría; ARCO) siguen como estaban.
-- Eliminación de clínicas: fn_eliminar_clinica borra los pacientes (y en cascada sus registros) ANTES que los usuarios; el disparador no la afecta
--   (y en cualquier caso 108 la mantiene bloqueada). Re-ejecutable. Rollback: rollback_111.sql.
-- ============================================================
begin;
create or replace function public.fn_usuario_con_registros_no_se_borra() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_tabla text;
begin
  select t into v_tabla from (
              select 'citas' t where exists (select 1 from public.citas where dentista_id = old.id)
    union all select 'tratamientos' where exists (select 1 from public.tratamientos where dentista_id = old.id or cancelado_por = old.id)
    union all select 'pagos' where exists (select 1 from public.pagos where registrado_por = old.id or anulado_por = old.id)
    union all select 'notas_clinicas' where exists (select 1 from public.notas_clinicas where usuario_id = old.id)
    union all select 'recetas' where exists (select 1 from public.recetas where dentista_id = old.id)
    union all select 'consentimientos_informados' where exists (select 1 from public.consentimientos_informados where dentista_id = old.id or cancelado_por = old.id or revocado_por = old.id)
    union all select 'documentos_clinicos' where exists (select 1 from public.documentos_clinicos where subido_por = old.id)
    union all select 'fotografias' where exists (select 1 from public.fotografias where subido_por = old.id)
    union all select 'referencias_medicas' where exists (select 1 from public.referencias_medicas where dentista_id = old.id)
    union all select 'signos_vitales' where exists (select 1 from public.signos_vitales where registrado_por = old.id)
    union all select 'odontograma_historial' where exists (select 1 from public.odontograma_historial where cambiado_por = old.id)
    union all select 'periodontograma_historial' where exists (select 1 from public.periodontograma_historial where cambiado_por = old.id)
  ) x limit 1;
  if v_tabla is not null then
    raise exception 'El usuario tiene registros clínicos o de cobro a su nombre (%): no se elimina; desactívalo.', v_tabla
      using errcode = '23503', hint = 'USUARIO_CON_REGISTROS';
  end if;
  return old;
end $$;
revoke all on function public.fn_usuario_con_registros_no_se_borra() from public, anon, authenticated;
drop trigger if exists trg_usuario_con_registros_no_se_borra on public.usuarios;
create trigger trg_usuario_con_registros_no_se_borra before delete on public.usuarios
  for each row execute function public.fn_usuario_con_registros_no_se_borra();
commit;
