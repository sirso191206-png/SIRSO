-- ROLLBACK del CANDIDATO 109 (NO ejecutado). Devuelve el search_path de 089/104 (`public`). No toca datos. Reabre el riesgo H16.
begin;
do $$ declare f text; begin
  foreach f in array array[
    'public.fn_retencion_legal_activa(uuid,uuid)', 'public.fn_retencion_legal_clinica(uuid)', 'public.fn_paciente_tiene_registros_clinicos(uuid)',
    'public.fn_ultimo_acto_medico(uuid)', 'public.fn_politica_anios(text)', 'public.fn_establecer_plazo_conservacion(text,integer,text,text,uuid)'] loop
    if to_regprocedure(f) is not null then execute format('alter function %s set search_path = public', f); end if;
  end loop;
end $$;
commit;
