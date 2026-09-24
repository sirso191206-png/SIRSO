-- ============================================================
-- SIRO — Módulo legal, Fase 7: registro de incidentes de seguridad
-- Migración 058
-- ------------------------------------------------------------
-- clinica_id nullable, mismo criterio que legal_documents/arco: NULL
-- es un incidente de plataforma (infraestructura de SIRO en general),
-- no nulo es específico de una clínica (p. ej. alguien de esa clínica
-- reportó un acceso indebido). Información interna de seguridad —
-- nunca visible para roles distintos de owner/super_admin (pedido
-- explícito: "no mostrar información interna de incidentes a usuarios
-- no autorizados").
-- ============================================================

create table if not exists incidentes_seguridad (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid references clinicas(id) on delete set null,
  tipo text not null,
  severidad text not null check (severidad in ('baja', 'media', 'alta', 'critica')),
  fecha timestamptz not null default now(),
  detectado_por uuid references usuarios(id) on delete set null,
  descripcion text not null,
  datos_afectados text,
  usuarios_afectados text,
  acciones text,
  estado text not null default 'detectado' check (estado in (
    'detectado', 'en_investigacion', 'contenido', 'resuelto', 'cerrado'
  )),
  resolucion text,
  fecha_cierre timestamptz,
  creado_en timestamptz default now()
);

create index idx_incidentes_clinica on incidentes_seguridad(clinica_id);
create index idx_incidentes_estado on incidentes_seguridad(estado);

alter table incidentes_seguridad enable row level security;

create policy incidentes_select on incidentes_seguridad
  for select using (
    (clinica_id is not null and auth_rol() = 'owner' and clinica_id = auth_clinica_id())
    or (clinica_id is null and exists (select 1 from usuarios u where u.id = auth.uid() and u.es_super_admin))
  );

create policy incidentes_insert on incidentes_seguridad
  for insert with check (
    (clinica_id is not null and auth_rol() = 'owner' and clinica_id = auth_clinica_id())
    or (clinica_id is null and exists (select 1 from usuarios u where u.id = auth.uid() and u.es_super_admin))
  );

create policy incidentes_update on incidentes_seguridad
  for update using (
    (clinica_id is not null and auth_rol() = 'owner' and clinica_id = auth_clinica_id())
    or (clinica_id is null and exists (select 1 from usuarios u where u.id = auth.uid() and u.es_super_admin))
  );

grant select, insert, update on incidentes_seguridad to authenticated;

create trigger trg_auditoria_incidentes
after insert or update on incidentes_seguridad
for each row execute function fn_auditoria();
