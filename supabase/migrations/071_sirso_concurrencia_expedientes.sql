-- ============================================================
-- SIRO — Concurrencia (versión ligera) para expedientes
-- Migración 071
-- ------------------------------------------------------------
-- expedientes.actualizado_en ya existía (desde el esquema original,
-- 001) — pero solo tenía `default now()`, sin ningún trigger que la
-- mantuviera al día en cada UPDATE. En la práctica, era la fecha de
-- CREACIÓN disfrazada de fecha de actualización. Peor aún:
-- actualizarExpediente() (services/expedientes.js) la ponía a mano
-- desde el FRONTEND en cada guardado (`new Date().toISOString()`) —
-- funcionaba para mostrar "última actualización", pero no servía como
-- candado de concurrencia real, porque el propio cliente decide su
-- valor en vez de que lo decida el servidor.
--
-- Se reutiliza fn_set_actualizado_en() (069) tal cual — es genérica,
-- no depende de ninguna tabla en particular — en vez de duplicar la
-- misma función con otro nombre.
-- ============================================================

drop trigger if exists trg_set_actualizado_en_expedientes on expedientes;
create trigger trg_set_actualizado_en_expedientes
before update on expedientes
for each row execute function fn_set_actualizado_en();
