-- ============================================================
-- SIRO — Fase 3: logo de la clínica
-- Migración 042
-- ------------------------------------------------------------
-- Auditado antes de implementar (pedido explícito): no existía ningún
-- campo de logo en `clinicas`, y los dos buckets de storage
-- existentes (fotos-clinicas, documentos-clinicos) son PRIVADOS
-- (acceso por URL firmada) — patrón correcto para datos clínicos
-- sensibles, pero innecesariamente complicado para un logo, que no es
-- sensible y se necesita mostrar libremente en la UI y en los
-- documentos impresos. Se crea un bucket nuevo, público, dedicado.
--
-- El logo pertenece a la CLÍNICA, no al odontólogo — vive en
-- `clinicas.logo_url`, no en `usuarios`. La escritura en `clinicas` ya
-- está restringida a owner por la política clinicas_update_owner
-- existente (no se toca, no hace falta una política nueva para la
-- columna): no se duplica esa protección aquí, solo se agrega la
-- columna.
-- ============================================================

alter table clinicas add column if not exists logo_url text;

-- Bucket público: el logo no es información sensible, y necesita
-- mostrarse en recetas impresas y en la UI sin fricción de URLs
-- firmadas. Path de subida: {clinica_id}/logo.{ext} — un logo por
-- clínica, se sobreescribe al cambiarlo.
insert into storage.buckets (id, name, public)
values ('logos-clinicas', 'logos-clinicas', true)
on conflict (id) do nothing;

-- Solo el owner de ESA clínica específica puede subir/reemplazar/
-- borrar su propio logo — nunca el de otra clínica, aunque conozca el
-- UUID (verificado contra auth_clinica_id(), no contra un valor que
-- el cliente pudiera mandar).
drop policy if exists storage_logos_insert on storage.objects;
create policy storage_logos_insert on storage.objects
  for insert with check (
    bucket_id = 'logos-clinicas'
    and auth_rol() = 'owner'
    and (storage.foldername(name))[1]::uuid = auth_clinica_id()
  );

drop policy if exists storage_logos_update on storage.objects;
create policy storage_logos_update on storage.objects
  for update using (
    bucket_id = 'logos-clinicas'
    and auth_rol() = 'owner'
    and (storage.foldername(name))[1]::uuid = auth_clinica_id()
  );

drop policy if exists storage_logos_delete on storage.objects;
create policy storage_logos_delete on storage.objects
  for delete using (
    bucket_id = 'logos-clinicas'
    and auth_rol() = 'owner'
    and (storage.foldername(name))[1]::uuid = auth_clinica_id()
  );

-- SELECT: no se necesita política — el bucket es público, Supabase
-- sirve los archivos por URL pública sin pasar por RLS de
-- storage.objects para ese endpoint. Se agrega de todas formas, por
-- explicitud y consistencia con el resto del esquema (nunca depender
-- silenciosamente de "no hace falta política").
drop policy if exists storage_logos_select on storage.objects;
create policy storage_logos_select on storage.objects
  for select using (bucket_id = 'logos-clinicas');
