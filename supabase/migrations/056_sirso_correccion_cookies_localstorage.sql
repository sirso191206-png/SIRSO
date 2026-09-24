-- ============================================================
-- SIRO — Corrección de precisión: Cookies vs localStorage
-- Migración 056
-- ------------------------------------------------------------
-- El documento sembrado en 052 se titulaba "Política de Cookies", pero
-- el propio inventario técnico (lib/inventarioCookies.js) siempre
-- identificó cada elemento como localStorage, no como cookie HTTP.
-- Declarar algo como "cookie" cuando técnicamente es localStorage no
-- es honesto, aunque el efecto práctico para el usuario sea similar —
-- corregido con una versión nueva, no editando la 052.
-- ============================================================

update legal_documents
set activo = false
where tipo = 'cookies' and clinica_id is null and activo = true;

insert into legal_documents (clinica_id, tipo, version, titulo, contenido, vigente_desde, publicado_en, activo)
values (
  null, 'cookies', '0.2-borrador', 'Cookies y Tecnologías de Almacenamiento',
'⚠ BORRADOR — pendiente de revisión legal profesional. Este documento se publica de forma preliminar y no debe considerarse definitivo.

Este documento se sigue encontrando bajo el nombre común "cookies" porque es donde la mayoría de la gente lo busca — pero, para ser precisos: SIRO no utiliza cookies HTTP tradicionales. Utiliza almacenamiento local del navegador (localStorage), una tecnología distinta con un efecto práctico similar (guardar información en tu dispositivo), pero técnicamente diferente.

SIRO no utiliza ninguna tecnología de rastreo, analítica ni publicidad. El almacenamiento local se usa únicamente para lo siguiente:

1. Mantener tu sesión iniciada (necesario para que SIRO funcione — no se puede desactivar).
2. Recordar tu preferencia de vista del odontograma (2D o 3D), si eliges configurarla.
3. Recordar tu correo electrónico si activas la opción "recordarme" al iniciar sesión.

Ninguno de estos elementos se comparte con terceros ni se utiliza con fines publicitarios. Puedes revisar el detalle técnico completo, y cambiar tus preferencias en cualquier momento, en /legal/cookies y /legal/cookies/preferencias.

Si en el futuro SIRO incorpora herramientas de analítica, marketing, o cookies HTTP tradicionales, esta política se actualizará antes de que entren en uso, y se te pedirá tu consentimiento conforme corresponda.

Versión {{VERSION}} — Última actualización: {{FECHA_ACTUALIZACION}}.',
  now(), now(), true
);
