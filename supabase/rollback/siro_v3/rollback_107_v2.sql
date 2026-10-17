-- ============================================================
-- ROLLBACK REVISADO del CANDIDATO 107 (v2). Sustituye a rollback_107.sql (v1), que se conserva sin cambios.
-- Motivo del v2: el v1 usa TRES transacciones con un \i de la 104 en medio (la 104 trae su propio begin/commit); un fallo a mitad
-- deja las funciones de la 104 con las FK de 107, o al revés. El v2 es UNA sola transacción: o se deshace todo o no cambia nada.
-- Las funciones se restauran con un extracto LITERAL de la 104 (rollback_107_v2_funciones_104.sql), no con texto reescrito.
-- Se DETIENE (sin cambiar nada) si: 108 sigue aplicado; el archivo de retenciones tiene filas (evidencia legal); o hay
-- retenciones y no se confirmó  -v confirmar_cascada=si  (volver a CASCADE reabre el defecto D-R1-a).
-- Orden obligatorio de los rollbacks: 109 → 108 (v2) → 107 (v2). NO se aplica automáticamente en ningún entorno.
-- ============================================================
\set ON_ERROR_STOP on
\if :{?confirmar_cascada}
\else
  \set confirmar_cascada no
\endif
begin;
select set_config('siro.rollback_confirmar_cascada', :'confirmar_cascada', true);
do $$ begin
  if to_regclass('public.retenciones_legales_archivo') is null then
    raise exception 'ROLLBACK 107 DETENIDO: 107 no está aplicado (no existe retenciones_legales_archivo). No se toca nada.';
  end if;
  if to_regclass('public.eliminaciones_clinica') is not null then
    raise exception 'ROLLBACK 107 DETENIDO: el candidato 108 sigue aplicado. Ejecuta antes rollback_108_v2.sql.';
  end if;
  if exists (select 1 from public.retenciones_legales_archivo) then
    raise exception 'ROLLBACK 107 DETENIDO: hay % retención(es) archivada(s). Es evidencia legal: no se retira sin una decisión expresa y un respaldo.',
      (select count(*) from public.retenciones_legales_archivo);
  end if;
  if exists (select 1 from public.retenciones_legales) and current_setting('siro.rollback_confirmar_cascada', true) <> 'si' then
    raise exception 'ROLLBACK 107 DETENIDO: hay % retención(es). Volver a ON DELETE CASCADE permitiría que desaparezcan al borrar al sujeto. Confirma con -v confirmar_cascada=si.',
      (select count(*) from public.retenciones_legales);
  end if;
end $$;

-- 1. Funciones de la 104 que 107 redefinió (extracto literal, mismas revocaciones y permisos)
\ir rollback_107_v2_funciones_104.sql

-- 2. Objetos propios de 107
drop trigger if exists trg_proteger_retencion_legal on public.retenciones_legales;
drop trigger if exists trg_retencion_sin_truncate on public.retenciones_legales;
drop function if exists public.fn_proteger_retencion_legal();
drop function if exists public.fn_archivar_retenciones_liberadas(uuid, uuid, text);
drop table public.retenciones_legales_archivo;                -- vacía (comprobado arriba); sin IF EXISTS: si algo depende de ella, se aborta todo
drop function if exists public.fn_registro_inmutable();       -- solo la usaban 107/108 (108 ya retirado)

-- 3. Claves foráneas como en la 104 (mismos nombres que genera PostgreSQL para la definición original)
alter table public.retenciones_legales drop constraint if exists retenciones_legales_paciente_clinica_fk;
alter table public.retenciones_legales drop constraint if exists retenciones_legales_clinica_fk;
alter table public.retenciones_legales add constraint retenciones_legales_clinica_id_fkey foreign key (clinica_id) references public.clinicas (id) on delete cascade;
alter table public.retenciones_legales add constraint retenciones_legales_paciente_id_fkey foreign key (paciente_id) references public.pacientes (id) on delete cascade;
drop index public.uq_pacientes_id_clinica;

-- 4. Privilegios de service_role que 107 revocó, EXACTAMENTE como estaban en 001–106 (comprobado con la huella, v5 RB107-1):
--    todos los de tabla (arwdDxtm, no solo arwd: el v1 olvidaba TRUNCATE/REFERENCES/TRIGGER) y EXECUTE en las dos funciones de disparador.
grant all on public.retenciones_legales, public.conservacion_historial to service_role;
grant execute on function public.fn_proteger_paciente_conservacion(), public.fn_proteger_clinica_retencion() to service_role;

-- 5. Verificación antes de confirmar
do $$ begin
  if to_regclass('public.retenciones_legales_archivo') is not null or to_regprocedure('public.fn_archivar_retenciones_liberadas(uuid,uuid,text)') is not null
     or (select count(*) from pg_constraint where conrelid = 'public.retenciones_legales'::regclass and contype = 'f' and confdeltype = 'c') <> 2 then
    raise exception 'ROLLBACK 107: verificación final fallida; se deshace todo.';
  end if;
end $$;
commit;
