-- ============================================================
-- SIRO — CANDIDATO 110: cierra H14. ESTADO: candidato (v5), no integrado en supabase/migrations.
-- DEFECTO: 018:43 crea fn_crear_periodontograma_paciente_para(uuid) SECURITY DEFINER sin validar al actor y sin revocar EXECUTE:
--   cualquier rol con EXECUTE (PUBLIC por omisión; anon y authenticated en Supabase) puede insertar piezas en el periodontograma
--   de un paciente de OTRA clínica y usar la función como oráculo de existencia de pacientes.
-- CORRECCIÓN MÍNIMA: revocar EXECUTE a public, anon y authenticated. No cambia el cuerpo ni el disparador.
-- POR QUÉ NO ROMPE NADA: la única llamada es la del disparador fn_crear_periodontograma_paciente() (018:76), que es SECURITY DEFINER
--   y se ejecuta como su propietario; no hay llamadas en el frontend, en Edge Functions, en otras migraciones ni en los tests (grep, 16/10).
-- Re-ejecutable. Rollback: rollback_110.sql.
-- ============================================================
begin;
do $$ begin
  if to_regprocedure('public.fn_crear_periodontograma_paciente_para(uuid)') is null then
    raise exception '110 requiere la migración 018 (fn_crear_periodontograma_paciente_para).';
  end if;
end $$;
revoke all on function public.fn_crear_periodontograma_paciente_para(uuid) from public, anon, authenticated;
commit;
