-- ============================================================
-- SIRO — Fase C: consentimiento informado completo
-- Migración 035
-- ------------------------------------------------------------
-- Aditiva. Los campos que ya existían (procedimiento, riesgos,
-- beneficios, alternativas, firmas, testigos) se conservan tal cual.
-- Estos son los que faltaban frente a una carta de consentimiento
-- formal: diagnóstico, pronóstico, molestias/efectos secundarios
-- (distinto de "riesgos" — son las molestias esperadas del
-- procedimiento en sí, no complicaciones), motivo de elección del
-- tratamiento, grado de urgencia, y lugar (normalmente la propia
-- clínica, pero puede variar si se realiza en otro sitio).
-- ============================================================

alter table consentimientos_informados add column if not exists diagnostico text;
alter table consentimientos_informados add column if not exists pronostico text;
alter table consentimientos_informados add column if not exists molestias_efectos_secundarios text;
alter table consentimientos_informados add column if not exists motivo_eleccion text;
alter table consentimientos_informados add column if not exists grado_urgencia text
  check (grado_urgencia is null or grado_urgencia in ('electivo', 'urgente', 'emergencia'));
alter table consentimientos_informados add column if not exists lugar text;
