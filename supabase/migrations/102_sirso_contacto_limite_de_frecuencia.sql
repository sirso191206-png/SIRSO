-- ============================================================
-- SIRO — Formulario de contacto público: límite de FRECUENCIA aplicado en el servidor
-- Migración 102 (fase final). Complementa la 099 (que limitó el TAMAÑO).
-- ------------------------------------------------------------
-- DEFECTO: la tabla pública `mensajes_contacto` aceptaba INSERT de cualquiera sin límite de frecuencia: un script anónimo podía crear miles de filas y, a través de
-- enviar-contacto, inundar el buzón de soporte. Un límite solo en el frontend no protege nada.
-- CORRECCIÓN (en la base de datos): un disparador BEFORE INSERT rechaza el mensaje si, en la ÚLTIMA HORA, ya hay demasiados:
--   · del mismo correo (sin distinguir mayúsculas): `contacto_max_por_correo_hora` (por omisión 5);
--   · en TOTAL (sea cual sea el correo): `contacto_max_global_hora` (por omisión 100).
-- Se pueden ajustar en `plataforma_config` (entero positivo; un valor inválido se ignora y rige el de por omisión). Son valores TÉCNICOS de seguridad, no una política legal.
-- LIMITACIONES HONESTAS: la base no conoce la IP de quien escribe, así que un atacante que cambie de correo en cada intento agota el límite GLOBAL (y bloquea temporalmente a las
-- personas legítimas); la defensa completa exige un CAPTCHA o un límite por IP en la capa de red (Supabase/Vercel/Resend): PENDIENTE DE ENTORNO. No toca filas existentes.
-- Seguro de re-ejecutar. Rollback: supabase/rollback/102_rollback.sql.
-- ============================================================
begin;
create index if not exists idx_mensajes_contacto_creado on public.mensajes_contacto (creado_en);
create index if not exists idx_mensajes_contacto_correo_creado on public.mensajes_contacto (lower(correo), creado_en);

create or replace function fn_config_limite(p_clave text, p_defecto integer) returns integer
language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  select pc.valor into v from plataforma_config pc where pc.clave = p_clave;
  if v is null or v !~ '^[0-9]{1,6}$' or v::integer < 1 then return p_defecto; end if;
  return v::integer;
end;
$$;
revoke all on function fn_config_limite(text, integer) from public, anon, authenticated;

create or replace function fn_limitar_frecuencia_contacto() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_por_correo integer := fn_config_limite('contacto_max_por_correo_hora', 5); v_global integer := fn_config_limite('contacto_max_global_hora', 100);
begin
  if (select count(*) from mensajes_contacto m where m.creado_en > now() - interval '1 hour' and lower(m.correo) = lower(new.correo)) >= v_por_correo
     or (select count(*) from mensajes_contacto m where m.creado_en > now() - interval '1 hour') >= v_global then
    raise exception 'Se han recibido demasiados mensajes. Inténtalo de nuevo más tarde.' using errcode = 'P0001', hint = 'CONTACTO_DEMASIADOS_MENSAJES';
  end if;
  return new;
end;
$$;
revoke all on function fn_limitar_frecuencia_contacto() from public, anon, authenticated;
drop trigger if exists trg_limitar_frecuencia_contacto on public.mensajes_contacto;
create trigger trg_limitar_frecuencia_contacto before insert on public.mensajes_contacto for each row execute function fn_limitar_frecuencia_contacto();
commit;
