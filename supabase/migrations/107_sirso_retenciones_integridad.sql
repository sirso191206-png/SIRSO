-- ============================================================
-- SIRO — CANDIDATO 107: integridad e inmutabilidad de las RETENCIONES LEGALES (R1)
-- ESTADO: CANDIDATO NO APROBADO, NO EJECUTADO. No integrar en supabase/migrations sin autorización expresa.
-- ------------------------------------------------------------
-- DEFECTOS QUE CORRIGE (demostrados por lectura; la prueba r1_defecto_reproduccion.sql debe mostrarlos en 001–106):
--  D-R1-a  104:51  retenciones_legales.paciente_id ON DELETE CASCADE: borrar al paciente borra su retención.
--  D-R1-b  104:180 el disparador de pacientes sale con siro.supresion_autorizada='on' ANTES de mirar la retención (104:181);
--          fn_eliminar_clinica (104:328) activa esa marca: una retención por PACIENTE no detiene la eliminación de su clínica.
--  D-R1-c  104:50  clinica_id ON DELETE CASCADE: la eliminación de una clínica borra también las retenciones LIBERADAS (evidencia).
--  D-R1-d  104:48-61 sin coherencia paciente↔clínica en la tabla (solo la valida fn_colocar_retencion_legal, 104:226).
--  D-R1-e  104:80 solo revoca a anon/authenticated: service_role (PostgREST) puede borrar o alterar retenciones activas.
--  D-R1-f  104:249-268 la supresión evalúa SIN bloquear al paciente ni sus tablas hijas, y no comprueba cuántas filas borró.
-- INVARIANTES:
--  I1 Mientras exista una retención ACTIVA (liberada_en IS NULL) sobre un paciente o su clínica, ninguna vía borra al paciente
--     ni a la clínica: disparador (siempre, sin excepción por marcas) + FK RESTRICT como última barrera.
--  I2 Una retención activa no se borra ni se altera; una liberada solo sale de la tabla si YA está copiada en el archivo inmutable.
--  I3 Toda retención de paciente apunta a un paciente de SU clínica (FK compuesta).
--  I4 Colocar, liberar, suprimir y eliminar toman bloqueos en el MISMO orden: clinicas → pacientes → hijas → retenciones.
-- QUÉ NO GARANTIZA: un rol con privilegios que use session_replication_role=replica, desactive disparadores o haga DROP.
-- DEPENDENCIAS: 104 (tablas y funciones de conservación), 089 (fn_eliminar_clinica — no se toca aquí; la cubren los disparadores).
-- Re-ejecutable. Rollback: rollback_107.sql (se NIEGA si hay evidencia archivada).
-- ============================================================
begin;

do $$ begin
  if to_regclass('public.retenciones_legales') is null or to_regprocedure('public.fn_suprimir_paciente_autorizado(uuid,text,uuid)') is null then
    raise exception '107 requiere la migración 104 aplicada.';
  end if;
end $$;

-- ---------- 1. Claves foráneas: CASCADE → RESTRICT, y coherencia paciente↔clínica ----------
do $$ declare v text; begin
  -- Solo las dos FK EN CASCADA de retenciones_legales hacia pacientes y clinicas (no se toca la FK a politicas_conservacion).
  for v in select c.conname from pg_constraint c
            where c.conrelid = 'public.retenciones_legales'::regclass and c.contype = 'f' and c.confdeltype = 'c'
              and c.confrelid in ('public.pacientes'::regclass, 'public.clinicas'::regclass)
  loop
    execute format('alter table public.retenciones_legales drop constraint %I', v);
  end loop;
end $$;
-- Requisito de la FK compuesta. ATENCIÓN (producción): crear este índice bloquea escrituras en pacientes mientras dura.
create unique index if not exists uq_pacientes_id_clinica on public.pacientes (id, clinica_id);
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.retenciones_legales'::regclass and conname = 'retenciones_legales_clinica_fk') then
    alter table public.retenciones_legales add constraint retenciones_legales_clinica_fk
      foreign key (clinica_id) references public.clinicas (id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.retenciones_legales'::regclass and conname = 'retenciones_legales_paciente_clinica_fk') then
    -- MATCH SIMPLE: con paciente_id NULL (retención de clínica) no aplica; con paciente_id, exige que sea de ESA clínica.
    alter table public.retenciones_legales add constraint retenciones_legales_paciente_clinica_fk
      foreign key (paciente_id, clinica_id) references public.pacientes (id, clinica_id) on delete restrict;
  end if;
end $$;

-- ---------- 2. Archivo inmutable de retenciones LIBERADAS cuyo sujeto se suprime ----------
create table if not exists public.retenciones_legales_archivo (
  retencion_id      uuid primary key,
  clinica_id        uuid not null,     -- sin FK a propósito: el sujeto puede haberse suprimido (es evidencia histórica)
  paciente_id       uuid,
  categoria         text not null,
  motivo            text not null,
  referencia        text,
  creado_por        uuid,
  creado_en         timestamptz not null,
  liberada_en       timestamptz not null,
  liberada_por      uuid,
  motivo_liberacion text not null,
  archivada_en      timestamptz not null default now(),
  operacion         text not null check (operacion in ('supresion_paciente', 'eliminacion_clinica'))
);
alter table public.retenciones_legales_archivo enable row level security;
revoke all on table public.retenciones_legales_archivo from public, anon, authenticated, service_role;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'retenciones_legales_archivo' and policyname = 'sesion_activa_retenciones_legales_archivo') then
    create policy sesion_activa_retenciones_legales_archivo on public.retenciones_legales_archivo as restrictive for all to authenticated
      using ((select fn_sesion_activa())) with check ((select fn_sesion_activa()));
  end if;
end $$;

create or replace function public.fn_registro_inmutable() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  raise exception 'Registro inmutable (%): no se modifica ni se borra.', tg_table_name using errcode = 'P0001', hint = 'REGISTRO_INMUTABLE';
end $$;
revoke all on function public.fn_registro_inmutable() from public, anon, authenticated, service_role;
drop trigger if exists trg_archivo_retencion_inmutable on public.retenciones_legales_archivo;
create trigger trg_archivo_retencion_inmutable before update or delete on public.retenciones_legales_archivo
  for each row execute function public.fn_registro_inmutable();
drop trigger if exists trg_archivo_retencion_sin_truncate on public.retenciones_legales_archivo;
create trigger trg_archivo_retencion_sin_truncate before truncate on public.retenciones_legales_archivo
  for each statement execute function public.fn_registro_inmutable();

-- ---------- 3. Inmutabilidad de retenciones_legales para CUALQUIER rol ----------
create or replace function public.fn_proteger_retencion_legal() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'Las retenciones legales no se vacían.' using errcode = 'P0001', hint = 'RETENCION_INMUTABLE';
  end if;
  if tg_op = 'DELETE' then
    if old.liberada_en is null then
      raise exception 'Una retención legal activa no se elimina.' using errcode = 'P0001', hint = 'RETENCION_ACTIVA_INDELEBLE';
    end if;
    if not exists (select 1 from public.retenciones_legales_archivo a where a.retencion_id = old.id) then
      raise exception 'Una retención liberada solo sale de la tabla después de archivarse.' using errcode = 'P0001', hint = 'RETENCION_SOLO_SE_ARCHIVA';
    end if;
    return old;
  end if;
  -- UPDATE: la única modificación válida es LIBERAR una vez (liberada_en/por/motivo); nada más cambia.
  if old.liberada_en is not null or new.liberada_en is null
     or (new.id, new.clinica_id, new.paciente_id, new.categoria, new.motivo, new.referencia, new.creado_por, new.creado_en)
        is distinct from (old.id, old.clinica_id, old.paciente_id, old.categoria, old.motivo, old.referencia, old.creado_por, old.creado_en) then
    raise exception 'Una retención legal solo admite liberarse una vez; el resto es inmutable.' using errcode = 'P0001', hint = 'RETENCION_INMUTABLE';
  end if;
  return new;
end $$;
revoke all on function public.fn_proteger_retencion_legal() from public, anon, authenticated, service_role;
drop trigger if exists trg_proteger_retencion_legal on public.retenciones_legales;
create trigger trg_proteger_retencion_legal before update or delete on public.retenciones_legales
  for each row execute function public.fn_proteger_retencion_legal();
drop trigger if exists trg_retencion_sin_truncate on public.retenciones_legales;
create trigger trg_retencion_sin_truncate before truncate on public.retenciones_legales
  for each statement execute function public.fn_proteger_retencion_legal();
-- service_role conserva SOLO lectura: toda escritura pasa por las funciones (SECURITY DEFINER). Ninguna Edge Function ni el
-- frontend escriben en estas tablas (comprobado por búsqueda en supabase/functions y frontend/src).
revoke insert, update, delete, truncate, references, trigger on public.retenciones_legales, public.conservacion_historial from service_role;

-- ---------- 4. Archivado interno de retenciones liberadas (solo lo usan los disparadores) ----------
create or replace function public.fn_archivar_retenciones_liberadas(p_clinica uuid, p_paciente uuid, p_operacion text) returns integer
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_n integer;
begin
  insert into public.retenciones_legales_archivo (retencion_id, clinica_id, paciente_id, categoria, motivo, referencia, creado_por, creado_en,
                                                  liberada_en, liberada_por, motivo_liberacion, operacion)
  select r.id, r.clinica_id, r.paciente_id, r.categoria, r.motivo, r.referencia, r.creado_por, r.creado_en,
         r.liberada_en, r.liberada_por, r.motivo_liberacion, p_operacion
    from public.retenciones_legales r
   where r.liberada_en is not null
     and case when p_paciente is not null then r.paciente_id = p_paciente
              else r.clinica_id = p_clinica and r.paciente_id is null end
  on conflict (retencion_id) do nothing;
  delete from public.retenciones_legales r
   where r.liberada_en is not null
     and case when p_paciente is not null then r.paciente_id = p_paciente
              else r.clinica_id = p_clinica and r.paciente_id is null end;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.fn_archivar_retenciones_liberadas(uuid, uuid, text) from public, anon, authenticated, service_role;

-- ---------- 5. Disparadores de pacientes y clínicas: la retención se mira SIEMPRE ----------
create or replace function public.fn_proteger_paciente_conservacion() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if public.fn_retencion_legal_activa(old.clinica_id, old.id) then      -- sin excepción por marcas de sesión
    raise exception 'Hay una retención legal activa: no se puede eliminar este paciente.' using errcode = 'P0001', hint = 'RETENCION_LEGAL_ACTIVA';
  end if;
  if coalesce(current_setting('siro.supresion_autorizada', true), '') <> 'on' and public.fn_paciente_tiene_registros_clinicos(old.id) then
    raise exception 'Un paciente con registros clínicos no se elimina físicamente: archívalo. La supresión solo procede por el procedimiento autorizado, vencido el plazo de conservación.'
      using errcode = 'P0001', hint = 'EXPEDIENTE_SUJETO_A_CONSERVACION';
  end if;
  perform public.fn_archivar_retenciones_liberadas(old.clinica_id, old.id,
    case when coalesce(current_setting('siro.operacion_conservacion', true), '') = 'eliminacion_clinica' then 'eliminacion_clinica' else 'supresion_paciente' end);
  return old;
end $$;
revoke all on function public.fn_proteger_paciente_conservacion() from public, anon, authenticated, service_role;

create or replace function public.fn_proteger_clinica_retencion() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if public.fn_retencion_legal_clinica(old.id) then                      -- incluye retenciones de PACIENTES de la clínica
    raise exception 'Hay una retención legal activa en esta clínica: no se puede eliminar.' using errcode = 'P0001', hint = 'RETENCION_LEGAL_ACTIVA';
  end if;
  perform public.fn_archivar_retenciones_liberadas(old.id, null, 'eliminacion_clinica');
  return old;
end $$;
revoke all on function public.fn_proteger_clinica_retencion() from public, anon, authenticated, service_role;
-- (los disparadores trg_proteger_paciente_conservacion y trg_proteger_clinica_retencion de la 104 siguen apuntando a estas funciones)

-- ---------- 6. Orden único de bloqueos: clinicas → pacientes → hijas → retenciones ----------
create or replace function public.fn_colocar_retencion_legal(p_clinica uuid, p_paciente uuid, p_categoria text, p_motivo text, p_referencia text, p_actor uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_id uuid;
begin
  if auth.uid() is not null then raise exception 'Solo el servidor puede colocar una retención legal.' using errcode = 'P0001', hint = 'SOLO_SERVIDOR'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 10 then raise exception 'El motivo es obligatorio (mínimo 10 caracteres).' using errcode = 'P0001', hint = 'MOTIVO_REQUERIDO'; end if;
  perform 1 from public.clinicas where id = p_clinica for share;
  if not found then raise exception 'Clínica no encontrada.' using errcode = 'P0001', hint = 'CLINICA_NO_ENCONTRADA'; end if;
  if p_paciente is not null then
    perform 1 from public.pacientes where id = p_paciente and clinica_id = p_clinica for share;
    if not found then raise exception 'El paciente no pertenece a la clínica.' using errcode = 'P0001', hint = 'PACIENTE_INCOHERENTE'; end if;
  end if;
  insert into public.retenciones_legales (clinica_id, paciente_id, categoria, motivo, referencia, creado_por)
  values (p_clinica, p_paciente, p_categoria, p_motivo, p_referencia, p_actor) returning id into v_id;
  insert into public.conservacion_historial (clinica_id, paciente_id, categoria, accion, valor_nuevo, motivo, actor)
  values (p_clinica, p_paciente, p_categoria, 'retencion_legal_colocada', jsonb_build_object('retencion_id', v_id, 'referencia', p_referencia), p_motivo, p_actor);
  return v_id;
end $$;
revoke all on function public.fn_colocar_retencion_legal(uuid, uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.fn_colocar_retencion_legal(uuid, uuid, text, text, text, uuid) to service_role;

create or replace function public.fn_liberar_retencion_legal(p_id uuid, p_motivo text, p_actor uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare r public.retenciones_legales%rowtype; v_cl uuid; v_pa uuid;
begin
  if auth.uid() is not null then raise exception 'Solo el servidor puede liberar una retención legal.' using errcode = 'P0001', hint = 'SOLO_SERVIDOR'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 10 then raise exception 'El motivo es obligatorio (mínimo 10 caracteres).' using errcode = 'P0001', hint = 'MOTIVO_REQUERIDO'; end if;
  select clinica_id, paciente_id into v_cl, v_pa from public.retenciones_legales where id = p_id;
  if not found then raise exception 'La retención no existe o ya fue liberada.' using errcode = 'P0001', hint = 'RETENCION_NO_ENCONTRADA'; end if;
  perform 1 from public.clinicas where id = v_cl for share;                       -- L1
  if v_pa is not null then perform 1 from public.pacientes where id = v_pa for share; end if;   -- L2
  update public.retenciones_legales set liberada_en = now(), liberada_por = p_actor, motivo_liberacion = p_motivo
   where id = p_id and liberada_en is null returning * into r;                    -- L4
  if not found then raise exception 'La retención no existe o ya fue liberada.' using errcode = 'P0001', hint = 'RETENCION_NO_ENCONTRADA'; end if;
  insert into public.conservacion_historial (clinica_id, paciente_id, categoria, accion, valor_nuevo, motivo, actor)
  values (r.clinica_id, r.paciente_id, r.categoria, 'retencion_legal_liberada', jsonb_build_object('retencion_id', p_id), p_motivo, p_actor);
end $$;
revoke all on function public.fn_liberar_retencion_legal(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.fn_liberar_retencion_legal(uuid, text, uuid) to service_role;

create or replace function public.fn_suprimir_paciente_autorizado(p_paciente uuid, p_motivo text, p_actor uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_estado jsonb; v_clinica uuid; v_clinica2 uuid; v_n integer;
begin
  if auth.uid() is not null then raise exception 'Solo el servidor puede ejecutar una supresión autorizada.' using errcode = 'P0001', hint = 'SOLO_SERVIDOR'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 20 then raise exception 'El motivo de la supresión es obligatorio (mínimo 20 caracteres).' using errcode = 'P0001', hint = 'MOTIVO_REQUERIDO'; end if;
  select clinica_id into v_clinica from public.pacientes where id = p_paciente;
  if not found then raise exception 'Paciente no encontrado.' using errcode = 'P0001', hint = 'PACIENTE_NO_ENCONTRADO'; end if;
  perform 1 from public.clinicas where id = v_clinica for share;                                   -- L1
  select clinica_id into v_clinica2 from public.pacientes where id = p_paciente for update;        -- L2
  if not found then raise exception 'Paciente no encontrado.' using errcode = 'P0001', hint = 'PACIENTE_NO_ENCONTRADO'; end if;
  if v_clinica2 is distinct from v_clinica then raise exception 'El paciente cambió de clínica durante la operación.' using errcode = 'P0001', hint = 'CONFLICTO_CONCURRENCIA'; end if;
  perform 1 from public.expedientes where paciente_id = p_paciente for update;                     -- L3 (las notas cuelgan del expediente)
  perform 1 from public.odontograma_piezas where paciente_id = p_paciente for update;
  perform 1 from public.periodontograma_piezas where paciente_id = p_paciente for update;
  v_estado := public.fn_conservacion_paciente(p_paciente);                                         -- evaluación DESPUÉS de bloquear
  if (v_estado ->> 'puede_suprimirse')::boolean is not true then
    insert into public.conservacion_historial (clinica_id, paciente_id, categoria, accion, valor_nuevo, motivo, actor)
    values (v_clinica, p_paciente, 'expediente_clinico', 'supresion_rechazada', v_estado, p_motivo, p_actor);
    return v_estado || jsonb_build_object('ok', false);
  end if;
  insert into public.conservacion_historial (clinica_id, paciente_id, categoria, accion, valor_nuevo, motivo, actor)
  values (v_clinica, p_paciente, 'expediente_clinico', 'supresion_autorizada', v_estado, p_motivo, p_actor);
  perform set_config('siro.supresion_autorizada', 'on', true);
  delete from public.pacientes where id = p_paciente;
  get diagnostics v_n = row_count;
  perform set_config('siro.supresion_autorizada', 'off', true);
  if v_n <> 1 then   -- deshace también la fila de historial: nunca queda «supresión autorizada» sin supresión
    raise exception 'El paciente ya no existe: no se suprimió nada.' using errcode = 'P0001', hint = 'PACIENTE_NO_ENCONTRADO';
  end if;
  return v_estado || jsonb_build_object('ok', true);
end $$;
revoke all on function public.fn_suprimir_paciente_autorizado(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.fn_suprimir_paciente_autorizado(uuid, text, uuid) to service_role;

commit;
