-- ============================================================
-- SIRO — Firma en recetas: dentista (guardada) + paciente (por receta)
-- Migración 063
-- ------------------------------------------------------------
-- IMPORTANTE — lo que esto ES y lo que NO es: esta es una firma
-- GRÁFICA (un trazo dibujado, capturado como imagen), exactamente el
-- mismo mecanismo que ya usan los consentimientos informados desde
-- hace varias migraciones. No es una firma electrónica con validez
-- legal formal (no usa certificados, no usa PKI) — es el equivalente
-- digital de firmar con el dedo sobre una tableta, no una firma
-- electrónica avanzada.
--
-- "Firma del dentista" se configura UNA VEZ (en Datos profesionales) y
-- se copia (snapshot) a cada receta nueva que emite — mismo criterio
-- ya usado para nombre_medico_snapshot/rfc_snapshot/etc: si el
-- dentista cambia su firma después, las recetas ya emitidas no
-- cambian. "Firma del paciente" se captura al momento de cada receta,
-- porque es específica de esa consulta, no algo que tenga sentido
-- guardar de antemano.
-- ============================================================

-- ---------- 1. Firma guardada del dentista (usuarios) ----------
alter table usuarios add column if not exists firma_png text;

-- ---------- 2. Snapshot en cada receta ----------
alter table recetas add column if not exists firma_dentista_png text;
alter table recetas add column if not exists firma_paciente_png text;
