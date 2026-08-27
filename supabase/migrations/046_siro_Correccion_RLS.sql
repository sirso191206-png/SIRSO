-- ============================================================
-- SIRO — Corrección RLS y permisos de clínicas
-- Migración 046
-- ============================================================

-- 1. Corregir política SELECT que apuntaba a una función inexistente
DROP POLICY IF EXISTS clinicas_select ON public.clinicas;

CREATE POLICY clinicas_select
ON public.clinicas
FOR SELECT
USING (
  id = auth_clinica_id()
);

-- 2. El owner de la clínica puede actualizar sus datos
DROP POLICY IF EXISTS clinicas_update_owner ON public.clinicas;

CREATE POLICY clinicas_update_owner
ON public.clinicas
FOR UPDATE
USING (
  id = auth_clinica_id()
  AND auth_rol() = 'owner'
);

-- 3. Permitir UPDATE a usuarios autenticados.
-- RLS sigue determinando QUIÉN puede actualizar.
GRANT UPDATE ON TABLE public.clinicas TO authenticated;