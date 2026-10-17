-- ROLLBACK de la migración 096: restituye la política de lectura de logos de la migración 042 (abierta al rol public). Seguro de re-ejecutar.
begin;
drop policy if exists storage_logos_select on storage.objects;
create policy storage_logos_select on storage.objects for select using (bucket_id = 'logos-clinicas');
commit;
