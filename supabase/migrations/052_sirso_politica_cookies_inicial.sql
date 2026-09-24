-- ============================================================
-- SIRO — Módulo legal, Fase 3: Política de Cookies (borrador)
-- Migración 052
-- ------------------------------------------------------------
-- Mismo criterio que 051: se inserta vía SQL directo porque RLS
-- correctamente no deja que un owner publique el documento de
-- plataforma (clinica_id NULL). El inventario real que respalda este
-- texto vive en frontend/src/lib/inventarioCookies.js — si ese archivo
-- cambia, este texto debe revisarse para que ambos digan lo mismo.
-- ============================================================

insert into legal_documents (clinica_id, tipo, version, titulo, contenido, vigente_desde, publicado_en, activo)
values (
  null, 'cookies', '0.1-borrador', 'Política de Cookies',
'⚠ BORRADOR — pendiente de revisión legal profesional. Este documento se publica de forma preliminar y no debe considerarse definitivo.

SIRO no utiliza cookies de rastreo, analítica ni publicidad. Utilizamos almacenamiento local del navegador (localStorage) únicamente para lo siguiente:

1. Mantener tu sesión iniciada (necesario para que SIRO funcione — no se puede desactivar).
2. Recordar tu preferencia de vista del odontograma (2D o 3D), si eliges configurarla.
3. Recordar tu correo electrónico si activas la opción "recordarme" al iniciar sesión.

Ninguno de estos elementos se comparte con terceros ni se utiliza con fines publicitarios. Puedes revisar el detalle técnico completo, y cambiar tus preferencias en cualquier momento, en /legal/cookies y /legal/cookies/preferencias.

Si en el futuro SIRO incorpora herramientas de analítica o marketing, esta política se actualizará antes de que entren en uso, y se te pedirá tu consentimiento conforme corresponda.

Versión {{VERSION}} — Última actualización: {{FECHA_ACTUALIZACION}}.',
  now(), now(), true
);
