-- ============================================================
-- SIRO — Formulario de contacto público
-- ============================================================
-- Tabla de respaldo: aunque el correo (vía Resend) falle o tarde, el
-- mensaje queda guardado de verdad en la base de datos, no se pierde.
-- No pertenece a ninguna clínica — es un formulario público del sitio,
-- por eso no lleva clinica_id ni se filtra por auth_clinica_id().
--
-- El INSERT público (with check true) es intencional aquí: a diferencia
-- del resto del sistema, este formulario debe poder recibir mensajes de
-- visitantes SIN sesión — es la naturaleza del formulario, no un
-- descuido de seguridad. El SELECT sigue restringido solo al
-- superadministrador, nadie puede leer mensajes ajenos.

create table mensajes_contacto (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  correo text not null,
  mensaje text not null,
  correo_enviado boolean not null default false,
  creado_en timestamptz not null default now()
);

alter table mensajes_contacto enable row level security;

create policy mensajes_contacto_insert on mensajes_contacto
  for insert
  with check (true);

create policy mensajes_contacto_select_superadmin on mensajes_contacto
  for select
  using (
    exists (
      select 1 from usuarios
      where usuarios.id = auth.uid() and usuarios.es_super_admin = true
    )
  );
