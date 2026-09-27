-- ============================================================
-- SIRO — Índices reales, verificados contra patrones de consulta
-- existentes, no adivinados. Migración 065
-- ------------------------------------------------------------
-- Mismo criterio de bloqueo que la migración 028: `create index`
-- normal toma un lock breve de escritura mientras construye el
-- índice — instantáneo con el volumen actual. Si en el futuro la base
-- ya tiene volumen real y no se quiere ese bloqueo, se ejecuta a mano
-- la versión con `concurrently` (no puede ir dentro de una migración
-- transaccional).
--
-- Cada índice de aquí corresponde a un patrón de consulta real,
-- verificado en el código — no una lista genérica de "por si acaso".
--
-- NOTA sobre lo que NO se agregó: sucursal_usuarios ya tiene un
-- constraint `unique(sucursal_id, usuario_id)` (047), que crea su
-- propio índice compuesto — auth_sucursal_permitida() y el único query
-- real del frontend que toca esta tabla (listarUsuariosDeSucursal,
-- que filtra solo por sucursal_id, la columna líder) ya quedan
-- perfectamente servidos por ese índice existente. Agregar uno nuevo
-- con las columnas invertidas solo hubiera sido peso muerto en cada
-- escritura, sin ningún beneficio real de lectura.
--
-- 1) usuarios(clinica_id): listar el personal de una clínica filtra
--    por esta columna (servicio de usuarios); sin índice, cada listado
--    escanea toda la tabla de usuarios de la plataforma.
-- 2) citas(sucursal_id) / pagos(sucursal_id), parciales (solo where no
--    es null): el filtro por sucursal en Agenda y Corte de Caja no
--    tenía índice propio — hoy no duele porque hay pocas filas, pero
--    es justo el tipo de cosa que si no se hace ahora, duele después.
-- 3) auditoria(clinica_id, creado_en desc): obtenerActividadReciente()
--    (dashboard.js) ordena por creado_en, y RLS ya filtra por clínica
--    por debajo — sin este índice compuesto, Postgres tiene que
--    revisar cada vez más filas conforme la auditoría crece, y la
--    auditoría es la única tabla de todo el sistema que nunca se poda.
-- 4) auditoria(entidad, entidad_id): no hay hoy una pantalla de "ver
--    todo el historial de este registro en particular", pero es la
--    consulta natural de una tabla de auditoría, y agregarla ahora
--    cuesta lo mismo que agregarla después con la tabla ya grande.
-- ============================================================

create index if not exists idx_usuarios_clinica on usuarios(clinica_id);
create index if not exists idx_citas_sucursal on citas(sucursal_id) where sucursal_id is not null;
create index if not exists idx_pagos_sucursal on pagos(sucursal_id) where sucursal_id is not null;
create index if not exists idx_auditoria_clinica_creado on auditoria(clinica_id, creado_en desc);
create index if not exists idx_auditoria_entidad on auditoria(entidad, entidad_id);
