-- ROLLBACK de la migración 103: restituye los cuatro ayudantes con su cuerpo BYTE A BYTE IDÉNTICO al original (la huella de esquema compara el texto de cada función), retira el disparador
-- y elimina la columna `debe_cambiar_password`. Atención: se pierde el indicador (los usuarios con cambio pendiente dejarían de estar obligados). Seguro de re-ejecutar.
begin;
drop trigger if exists trg_proteger_debe_cambiar_password on public.usuarios;
drop function if exists fn_proteger_debe_cambiar_password();
create or replace function public.auth_clinica_id() returns uuid language sql stable security definer set search_path = public as $rb$
  select u.clinica_id
  from usuarios u
  join clinicas c on c.id = u.clinica_id
  where u.id = auth.uid()
    and c.estado = 'activa'
$rb$;
create or replace function public.auth_clinica_id_raw() returns uuid language sql stable security definer set search_path = public as $rb$
  select clinica_id from usuarios where id = auth.uid()
$rb$;
create or replace function public.auth_rol() returns text language sql stable security definer set search_path = public as $rb$
  select rol from usuarios where id = auth.uid()
$rb$;
create or replace function public.fn_es_super_admin() returns boolean language sql stable security definer set search_path = public as $rb$
  select coalesce((select es_super_admin from usuarios where id = auth.uid()), false)
$rb$;
alter table public.usuarios drop column if exists debe_cambiar_password;
commit;
