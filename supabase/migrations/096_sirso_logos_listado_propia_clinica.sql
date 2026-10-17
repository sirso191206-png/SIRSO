-- ============================================================
-- SIRO — Logos: la lectura por la API de Storage queda limitada a la PROPIA clínica
-- Migración 096 (fase 7). Cierra la decisión de la propuesta 002.
-- ------------------------------------------------------------
-- La migración 042 crea el bucket `logos-clinicas` PÚBLICO a propósito y su comentario dice que la política SELECT «no se necesita» para servir por URL
-- pública (se añadió «por explicitud»). Esa política, abierta al rol public, permitía a cualquiera con la clave anon (que viaja en el bundle) LISTAR las
-- carpetas del bucket, es decir, los UUID de TODAS las clínicas clientes. Esta migración la sustituye por una limitada a la propia clínica: el propietario
-- sigue pudiendo subir y REEMPLAZAR su logo (el upsert necesita SELECT sobre su carpeta), la visibilidad del bucket NO cambia y las URLs públicas no usan esta política.
-- LIMITACIÓN: que Supabase real sirva la URL pública sin esta política (como dice la 042) NO se pudo probar aquí → verificarlo en desarrollo con
-- supabase/verificacion/logos_solo_lectura.sql y los pasos de docs/FASE7_INFORME_CIERRE_PREPRODUCCION.md. Rollback: supabase/rollback/096_rollback.sql.
-- ============================================================
begin;
drop policy if exists storage_logos_select on storage.objects;
create policy storage_logos_select on storage.objects for select to authenticated
  using (bucket_id = 'logos-clinicas' and (storage.foldername(name))[1] = auth_clinica_id()::text);
commit;
