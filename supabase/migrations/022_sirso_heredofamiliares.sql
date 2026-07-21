-- ============================================================
-- SIRO — Antecedentes heredofamiliares estructurados
-- ============================================================
-- Ya existía `antecedentes_familiares` como texto libre — se conserva
-- tal cual (no se borra información existente), y se agrega ESTE campo
-- nuevo, estructurado por familiar, que es lo que pide el documento
-- NOM-004 de verdad (poder saber "¿la madre tuvo diabetes?" como dato
-- consultable, no enterrado en un párrafo). Mismo patrón jsonb que ya
-- usan alergias/enfermedades/medicamentos en esta misma tabla.
--
-- Cada elemento del arreglo: { parentesco, enfermedades: [...], notas }

alter table expedientes add column if not exists antecedentes_heredofamiliares jsonb not null default '[]'::jsonb;
