-- SIRO — Quitar el límite de retrofecha de las notas (vuelve a NO haber límite). Seguro de re-ejecutar.
\set ON_ERROR_STOP on
delete from plataforma_config where clave = 'nota_retrofecha_max_horas';
\echo '✔ Sin límite de retrofecha.'
