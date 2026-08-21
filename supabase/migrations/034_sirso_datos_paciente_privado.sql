-- ============================================================
-- SIRO — Fase A: datos completos del paciente (enfoque privado)
-- Migración 034
-- ------------------------------------------------------------
-- Aditiva: ninguna columna existente se toca, se renombra ni se
-- elimina. `contacto_emergencia` y `seguro_medico` (jsonb) ya
-- existían desde 001_fase1_schema.sql — nunca se conectaron a
-- ningún formulario; esta migración no las modifica, solo se les
-- construye la UI aparte.
-- ============================================================

-- ---------- Identificación ----------
alter table pacientes add column if not exists estado_civil text
  check (estado_civil is null or estado_civil in ('soltero', 'casado', 'union_libre', 'divorciado', 'viudo'));
alter table pacientes add column if not exists ocupacion text;
alter table pacientes add column if not exists escolaridad text
  check (escolaridad is null or escolaridad in ('sin_escolaridad', 'basica', 'media', 'superior'));
alter table pacientes add column if not exists nacionalidad text default 'Mexicana';

-- ---------- Contacto ----------
alter table pacientes add column if not exists telefono_secundario text;
alter table pacientes add column if not exists whatsapp text;

-- ---------- Domicilio estructurado ----------
-- `direccion` (texto libre) se mantiene tal cual para no perder nada ya
-- capturado. Estos campos nuevos son la vía preferida hacia adelante.
alter table pacientes add column if not exists calle text;
alter table pacientes add column if not exists numero_exterior text;
alter table pacientes add column if not exists numero_interior text;
alter table pacientes add column if not exists colonia text;
alter table pacientes add column if not exists municipio text;
alter table pacientes add column if not exists estado_domicilio text; -- "estado" ya es ambiguo (civil) — nombre distinto a propósito
alter table pacientes add column if not exists codigo_postal text;

-- ---------- Administrativo (privado, no gubernamental) ----------
-- Aseguradora vive en `seguro_medico` (jsonb, ya existía) — no se
-- duplica en una columna nueva.
alter table pacientes add column if not exists tipo_paciente text
  check (tipo_paciente is null or tipo_paciente in ('particular', 'referido', 'aseguradora', 'convenio'));
alter table pacientes add column if not exists estado_expediente text not null default 'activo'
  check (estado_expediente in ('activo', 'inactivo', 'de_alta'));
alter table pacientes add column if not exists referido_por text;
