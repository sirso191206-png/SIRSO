-- ============================================================
-- SIRO — Datos de identificación del establecimiento (NOM-004)
-- ============================================================
alter table clinicas add column if not exists tipo_establecimiento text;
alter table clinicas add column if not exists clave_unidad_medica text;
alter table clinicas add column if not exists direccion text;
alter table clinicas add column if not exists telefono text;
alter table clinicas add column if not exists correo text;
alter table clinicas add column if not exists responsable_sanitario text;

-- ------------------------------------------------------------
-- Fix de seguridad real: `clinicas` nunca tuvo RLS activado — antes
-- solo guardaba el nombre (impacto menor), pero ahora que guarda datos
-- de contacto y responsable sanitario, se cierra el hueco. Todos los
-- lugares del código que ya consultan `clinicas` lo hacen siempre con
-- el propio clinica_id del usuario (perfil.clinica_id), así que esta
-- política no rompe nada existente.
-- ------------------------------------------------------------
alter table clinicas enable row level security;

create policy clinicas_select on clinicas
  for select using (id = auth_clinica_id());

create policy clinicas_update_owner on clinicas
  for update using (id = auth_clinica_id() and auth_rol() = 'owner');

grant select, update on clinicas to authenticated;
