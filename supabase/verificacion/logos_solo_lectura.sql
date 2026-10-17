-- ============================================================
-- SIRO — ¿Existe el bucket de logos y es público? (SOLO LECTURA; ejecutar en el SQL Editor del proyecto de DESARROLLO antes de decidir la propuesta 002)
-- Va envuelta en BEGIN READ ONLY. No devuelve UUID de clínicas ni nombres de archivos: solo la configuración del bucket, sus políticas y conteos.
-- ============================================================
begin read only;

-- 1) El bucket: esperado 1 fila con public = true si la app usa URLs públicas (getPublicUrl). 0 filas = el bucket no existe en este proyecto.
select id as bucket, public from storage.buckets where id = 'logos-clinicas';

-- 2) Políticas que gobiernan los logos (la propuesta 002 sustituye la de SELECT por una limitada a la propia clínica)
select policyname, cmd, roles::text as roles from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'storage_logos%' order by policyname, cmd;

-- 3) ¿Quién puede LISTAR hoy? Esperado ANTES de la 002: la política de SELECT incluye al rol public (cualquiera, incluso anónimo).
select count(*) as politicas_select_de_logos_abiertas_a_public
  from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT' and policyname like 'storage_logos%' and roles::text like '%public%';

-- 4) Cuántos logos hay y de cuántas clínicas (solo conteos)
select count(*) as logos_en_storage, count(distinct (storage.foldername(name))[1]) as clinicas_con_logo from storage.objects where bucket_id = 'logos-clinicas';

rollback;
