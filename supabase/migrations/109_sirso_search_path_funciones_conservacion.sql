-- ============================================================
-- SIRO — CANDIDATO 109: search_path seguro en las 6 funciones SECURITY DEFINER de 089/104 que usan los candidatos 107/108 (H16)
-- ESTADO: CANDIDATO NO APROBADO, NO EJECUTADO. Requiere 089, 104 (y se aplica después de 107/108).
-- ------------------------------------------------------------
-- PROBLEMA: `set search_path = public` deja `pg_temp` en la PRIMERA posición implícita para relaciones: un rol con SQL directo que
-- pueda crear tablas temporales podría «sombrear» retenciones_legales, pacientes, etc. dentro de estas funciones privilegiadas.
-- CAMBIO MÍNIMO: solo ALTER FUNCTION … SET search_path = pg_catalog, public, pg_temp. NO se tocan los cuerpos.
-- POR QUÉ NO CAMBIA LA SEMÁNTICA (comprobado leyendo los cuerpos, 16/10/2026): solo referencian tablas de public, funciones de
-- pg_catalog (que ya se buscaba primero de forma implícita) y auth.uid() con esquema explícito. Ningún nombre cambia de resolución
-- salvo los que pudieran existir en pg_temp, que ahora quedan los ÚLTIMOS (es el objetivo).
-- Re-ejecutable (ALTER es idempotente). Rollback: rollback_109.sql (vuelve a `public`; reabre H16).
-- ============================================================
begin;
do $$ declare f text; begin
  foreach f in array array[
    'public.fn_retencion_legal_activa(uuid,uuid)', 'public.fn_retencion_legal_clinica(uuid)', 'public.fn_paciente_tiene_registros_clinicos(uuid)',
    'public.fn_ultimo_acto_medico(uuid)', 'public.fn_politica_anios(text)', 'public.fn_establecer_plazo_conservacion(text,integer,text,text,uuid)'] loop
    if to_regprocedure(f) is null then raise exception '109: falta la función % (¿089/104 no aplicadas?)', f; end if;
    if not (select prosecdef from pg_proc where oid = to_regprocedure(f)) then raise exception '109: % ya no es SECURITY DEFINER: revisar antes de aplicar', f; end if;
    execute format('alter function %s set search_path = pg_catalog, public, pg_temp', f);
  end loop;
end $$;
commit;
