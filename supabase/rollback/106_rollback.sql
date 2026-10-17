-- ROLLBACK de la migración 106: retira el disparador y la función, devuelve a `other` (inactivos) los documentos de los tipos nuevos, restituye la restricción de tipos original y reactiva
-- las versiones 0.x anteriores. NO borra ninguna versión (las 1.0 quedan inactivas como historial). Seguro de re-ejecutar.
begin;
drop trigger if exists trg_validar_aceptacion_legal on public.legal_acceptances;
drop function if exists fn_validar_aceptacion_legal();
update public.legal_documents set activo = false where tipo in ('arco_procedure', 'consents') or version = '1.0';
update public.legal_documents set tipo = 'other' where tipo in ('arco_procedure', 'consents');
alter table public.legal_documents drop constraint if exists legal_documents_tipo_check;
alter table public.legal_documents add constraint legal_documents_tipo_check check (tipo = any (array['privacy_simplified'::text, 'privacy_integral'::text, 'terms'::text, 'cookies'::text, 'security'::text, 'retention'::text, 'data_processing_agreement'::text, 'other'::text]));
update public.legal_documents set activo = true where clinica_id is null and ((tipo = 'cookies' and version = '0.3-borrador') or (tipo <> 'cookies' and tipo <> 'other' and version = '0.2-borrador'));
commit;
