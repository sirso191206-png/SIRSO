-- ============================================================
-- SIRO — 116: registro de errores de la aplicación (auditoría P1-06 / P1-05).
-- ------------------------------------------------------------
--  * errores_app: errores del navegador (origen 'frontend') y de las Edge Functions (origen 'edge'). Solo los lee el
--    superadmin. NO guarda datos clínicos: ruta, mensaje y detalle técnico recortados.
--  * fn_registrar_error_cliente: la usa el navegador (usuario con sesión); límite de 30 por usuario y hora para que un
--    error en bucle no llene la tabla. Las Edge Functions escriben con service_role.
--  * fn_alerta_reciente: para no mandar más de un correo de alerta por función cada 30 minutos.
--  * Retención: 90 días (se limpia sola al registrar).
-- Re-ejecutable. Rollback: supabase/rollback/siro_v3/rollback_116.sql.
-- ============================================================
begin;

create table if not exists errores_app (
  id bigserial primary key,
  creado_en timestamptz not null default now(),
  origen text not null check (origen in ('frontend', 'edge')),
  gravedad text not null default 'error' check (gravedad in ('error', 'critico')),
  usuario_id uuid,
  clinica_id uuid,
  ruta text,
  mensaje text not null,
  detalle text,
  version text
);
create index if not exists idx_errores_app_creado on errores_app (creado_en desc);
create index if not exists idx_errores_app_usuario on errores_app (usuario_id, creado_en desc);
alter table errores_app enable row level security;
revoke all on errores_app from anon, authenticated;
grant select on errores_app to authenticated;
drop policy if exists errores_app_select on errores_app;
create policy errores_app_select on errores_app for select to authenticated using (fn_es_super_admin());
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'errores_app' and policyname = 'sesion_activa_errores_app') then
    create policy sesion_activa_errores_app on public.errores_app as restrictive for all to authenticated
      using ((select fn_sesion_activa())) with check ((select fn_sesion_activa()));
  end if;
end $$;

create or replace function fn_registrar_error_cliente(p_ruta text, p_mensaje text, p_detalle text default null, p_version text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or coalesce(btrim(p_mensaje), '') = '' then return; end if;
  if (select count(*) from errores_app where usuario_id = v_uid and creado_en > now() - interval '1 hour') >= 30 then return; end if;
  insert into errores_app (origen, usuario_id, clinica_id, ruta, mensaje, detalle, version)
  values ('frontend', v_uid, auth_clinica_id_raw(), left(p_ruta, 200), left(p_mensaje, 500), left(p_detalle, 2000), left(p_version, 60));
  delete from errores_app where creado_en < now() - interval '90 days';
end $$;
revoke all on function fn_registrar_error_cliente(text, text, text, text) from public, anon;
grant execute on function fn_registrar_error_cliente(text, text, text, text) to authenticated;

-- ¿Ya hubo otro error crítico de esta función en los últimos 30 minutos? (para no repetir el correo de alerta)
create or replace function fn_alerta_reciente(p_ruta text) returns boolean
language sql stable security definer set search_path = public as $$
  select (select count(*) from errores_app where origen = 'edge' and gravedad = 'critico' and ruta = p_ruta
            and creado_en > now() - interval '30 minutes') > 1
$$;
revoke all on function fn_alerta_reciente(text) from public, anon, authenticated;
grant execute on function fn_alerta_reciente(text) to service_role;

-- Para la pantalla del superadmin (con el nombre de la clínica).
create or replace function sa_errores_app(p_limite integer default 200) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not fn_es_super_admin() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(e) || jsonb_build_object('clinica_nombre', c.nombre) order by e.creado_en desc)
    from (select * from errores_app order by creado_en desc limit least(greatest(coalesce(p_limite, 200), 1), 1000)) e
    left join clinicas c on c.id = e.clinica_id), '[]'::jsonb);
end $$;
revoke all on function sa_errores_app(integer) from public, anon;
grant execute on function sa_errores_app(integer) to authenticated;

commit;
