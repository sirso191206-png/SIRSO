-- ============================================================
-- SIRO — Módulo legal, Fase 2: datos legales mínimos por clínica
-- Migración 050
-- ------------------------------------------------------------
-- clinicas ya tenía direccion, telefono, correo, responsable_sanitario
-- (migración 021) — se reutilizan tal cual para las variables
-- {{DOMICILIO}}, {{TELEFONO}}. Solo se agrega lo que genuinamente
-- falta: razón social (puede ser distinta del nombre comercial que ya
-- existe en `nombre`), RFC, y un correo de privacidad específico
-- (puede ser distinto del correo de contacto general).
-- Todas nullable — ninguna clínica queda obligada a llenarlas de
-- inmediato, y las páginas legales muestran un estado vacío honesto
-- mientras no estén configuradas, en vez de inventar un valor.
-- ============================================================

alter table clinicas add column if not exists razon_social text;
alter table clinicas add column if not exists rfc text;
alter table clinicas add column if not exists correo_privacidad text;
