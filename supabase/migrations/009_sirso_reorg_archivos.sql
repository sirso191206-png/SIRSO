-- ============================================================
-- SIRSO — Reorganización, Fase 4: perfil del paciente (Archivos)
-- ============================================================
-- "Archivos" agrupa fotografías + radiografías + documentos. Falta la
-- categoría radiografía en fotografías (documentos_clinicos ya cubre
-- consentimientos/documentos/estudios desde la fase de Expediente).

do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'fotografias'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%etiqueta%';
  if v_constraint_name is not null then
    execute format('alter table fotografias drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table fotografias add constraint fotografias_etiqueta_check check (etiqueta in (
  'intraoral', 'extraoral', 'antes', 'despues', 'radiografia'
));
