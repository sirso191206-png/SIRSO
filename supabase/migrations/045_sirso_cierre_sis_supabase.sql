-- ============================================================
-- SIRO — Cierre V1: eliminación de SIS en Supabase
-- Migración 045
-- ------------------------------------------------------------
-- Siguiente número real disponible tras la migración 044 (no se
-- asumió 045 — se confirmó listando el directorio).
--
-- Objetos eliminados, con evidencia verificada antes de este DROP:
--
-- 1) sis_catalogo_establecimientos — tabla de solo lectura (catálogo
--    CLUES, 64,006 filas), sin ninguna FK hacia/desde ella, cuyo único
--    consumidor (services/sisReportes.js) ya se eliminó del frontend.
--    Sin CASCADE: no hace falta, nada depende de esta tabla.
--
-- 2) 14 columnas SIS-exclusivas, verificadas SIN NINGÚN uso — ni en
--    frontend (ningún .jsx/.js las lee/escribe, ni siquiera en un
--    comentario salvo la explicación de por qué se dejaron), ni en
--    SQL (ninguna vista/función/índice las referencia fuera de la
--    migración donde se crearon, 031_sirso_captura_sis.sql):
--
--    usuarios: primer_apellido, segundo_apellido, tipo_personal_sis,
--              pais_nacimiento, programa_smym_g
--    pacientes: pais_nacimiento, entidad_nacimiento, sexo_biologico,
--               genero, se_autodenomina_afromexicano,
--               se_considera_indigena, migrante, pais_procedencia,
--               derechohabiencia
--
-- CONSERVADAS explícitamente (confirmado con el usuario, o con uso
-- real verificado):
--   usuarios.curp — conservar por instrucción explícita
--   pacientes.curp, pacientes.primer_apellido, pacientes.segundo_apellido
--     — en uso activo real: TabDatosGenerales.jsx, Pacientes.jsx,
--     imprimirExpedienteCompleto.js. NO son las mismas columnas que
--     usuarios.primer_apellido/segundo_apellido aunque compartan
--     nombre — son de tablas distintas.
--
-- Sin CASCADE en ningún DROP COLUMN: se verificó que ninguna de las
-- 14 columnas tiene un índice propio ni es referenciada por ninguna
-- vista/función — un DROP COLUMN simple no arrastra nada más.
-- ============================================================

-- ---------- 1. Catálogo CLUES (sis_catalogo_establecimientos) ----------
drop table if exists sis_catalogo_establecimientos;

-- ---------- 2. Columnas SIS-exclusivas en usuarios ----------
alter table usuarios drop column if exists primer_apellido;
alter table usuarios drop column if exists segundo_apellido;
alter table usuarios drop column if exists tipo_personal_sis;
alter table usuarios drop column if exists pais_nacimiento;
alter table usuarios drop column if exists programa_smym_g;

-- ---------- 3. Columnas SIS-exclusivas en pacientes ----------
alter table pacientes drop column if exists pais_nacimiento;
alter table pacientes drop column if exists entidad_nacimiento;
alter table pacientes drop column if exists sexo_biologico;
alter table pacientes drop column if exists genero;
alter table pacientes drop column if exists se_autodenomina_afromexicano;
alter table pacientes drop column if exists se_considera_indigena;
alter table pacientes drop column if exists migrante;
alter table pacientes drop column if exists pais_procedencia;
alter table pacientes drop column if exists derechohabiencia;
