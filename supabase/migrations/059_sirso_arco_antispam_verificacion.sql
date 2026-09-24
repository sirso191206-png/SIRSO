-- ============================================================
-- SIRO — Módulo legal: protecciones reales para ARCO
-- Migración 059
-- ------------------------------------------------------------
-- Corrige un hueco señalado explícitamente: el formulario público de
-- /legal/arco no tenía protección anti-spam ni verificación de
-- identidad antes de responder con información real.
--
-- No se agregó ningún SDK de terceros (reCAPTCHA, etc.) — eso
-- implicaría declarar una dependencia nueva y actualizar el inventario
-- de cookies/proveedores, y no se decidió agregar eso todavía. Lo que
-- sí se construyó no depende de ningún tercero:
--   1) Límite de solicitudes por correo en 24h — a nivel de base de
--      datos, no solo en el frontend (así que no se puede saltar
--      llamando directamente a la API).
--   2) Un candado real: no se puede marcar una solicitud como
--      'aprobada' ni 'atendida' sin haber marcado antes que se
--      verificó la identidad del solicitante — esto no verifica la
--      identidad por sí solo (eso lo sigue haciendo un humano, por
--      teléfono o en persona), pero impide que alguien la marque como
--      resuelta sin haber pasado por ese paso.
-- ============================================================

-- ---------- 1. Verificación de identidad ----------
alter table arco_solicitudes add column if not exists identidad_verificada boolean not null default false;
alter table arco_solicitudes add column if not exists identidad_verificada_por uuid references usuarios(id) on delete set null;
alter table arco_solicitudes add column if not exists identidad_verificada_en timestamptz;
alter table arco_solicitudes add column if not exists metodo_verificacion text;

create or replace function fn_exigir_verificacion_arco()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado in ('aprobada', 'atendida') and not new.identidad_verificada then
    raise exception 'No se puede marcar una solicitud ARCO como "%" sin antes verificar la identidad del solicitante.', new.estado;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_exigir_verificacion_arco on arco_solicitudes;
create trigger trg_exigir_verificacion_arco
before update on arco_solicitudes
for each row execute function fn_exigir_verificacion_arco();

-- ---------- 2. Límite anti-spam por correo ----------
-- 3 solicitudes por correo en 24 horas es generoso para alguien real
-- (nadie necesita mandar más de 3 solicitudes ARCO genuinas en un
-- día) pero corta un envío automatizado en bucle.
create or replace function fn_limitar_solicitudes_arco()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conteo integer;
begin
  select count(*) into v_conteo
  from arco_solicitudes
  where lower(solicitante_correo) = lower(new.solicitante_correo)
    and creado_en > now() - interval '24 hours';

  if v_conteo >= 3 then
    raise exception 'Se alcanzó el límite de solicitudes para este correo en las últimas 24 horas. Si necesitas ayuda urgente, contáctanos directamente en /contacto.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_limitar_solicitudes_arco on arco_solicitudes;
create trigger trg_limitar_solicitudes_arco
before insert on arco_solicitudes
for each row execute function fn_limitar_solicitudes_arco();
