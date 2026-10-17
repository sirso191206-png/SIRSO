-- ROLLBACK del CANDIDATO 110 (v5). Devuelve EXECUTE como estaba tras 018 (PUBLIC + los roles de Supabase). Reabre H14. No toca datos.
begin;
grant execute on function public.fn_crear_periodontograma_paciente_para(uuid) to public, anon, authenticated;
commit;
