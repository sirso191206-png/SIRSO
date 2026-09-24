-- ============================================================
-- SIRO — Módulo legal, Fase 4: Derechos ARCO
-- Migración 053
-- ------------------------------------------------------------
-- Una solicitud ARCO puede venir de alguien que NUNCA ha iniciado
-- sesión en SIRO (un paciente pidiendo acceso a sus propios datos, sin
-- cuenta) — por eso usuario_id y paciente_id son NULLABLE, y se pide
-- nombre/correo de contacto en texto libre para poder responderle.
-- clinica_id también es nullable: la persona puede no saber a qué
-- clínica pertenece exactamente su solicitud, o esta puede referirse
-- a SIRO como plataforma (p. ej. un ex-empleado pidiendo cancelación
-- de sus propios datos de usuario).
-- ============================================================

create table if not exists arco_solicitudes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('acceso', 'rectificacion', 'cancelacion', 'oposicion')),
  solicitante_nombre text not null,
  solicitante_correo text not null,
  usuario_id uuid references usuarios(id) on delete set null,
  paciente_id uuid references pacientes(id) on delete set null,
  clinica_id uuid references clinicas(id) on delete set null,
  descripcion text not null,
  estado text not null default 'recibida' check (estado in (
    'recibida', 'en_revision', 'requiere_informacion', 'aprobada', 'rechazada', 'atendida', 'cerrada'
  )),
  responsable_id uuid references usuarios(id) on delete set null,
  respuesta text,
  fecha_respuesta timestamptz,
  creado_en timestamptz default now()
);

create index idx_arco_clinica on arco_solicitudes(clinica_id);
create index idx_arco_usuario on arco_solicitudes(usuario_id);
create index idx_arco_estado on arco_solicitudes(estado);

alter table arco_solicitudes enable row level security;

-- Cualquiera puede levantar una solicitud — con o sin sesión iniciada,
-- exactamente como debe funcionar un formulario ARCO público. Si hay
-- sesión, se exige que usuario_id (cuando se manda) sea el propio —
-- nadie puede levantar una solicitud fingiendo ser otro usuario del
-- sistema.
create policy arco_insert_publico on arco_solicitudes
  for insert with check (
    usuario_id is null or usuario_id = auth.uid()
  );

-- El owner de la clínica ve las solicitudes de SU clínica. Quien
-- levantó la solicitud (si tenía sesión) puede ver el estado de la
-- suya. Un super_admin ve las que no tienen clínica asociada
-- (solicitudes sobre SIRO como plataforma, no sobre una clínica en
-- particular).
create policy arco_select_clinica on arco_solicitudes
  for select using (
    (clinica_id is not null and auth_rol() = 'owner' and clinica_id = auth_clinica_id())
    or usuario_id = auth.uid()
    or (clinica_id is null and exists (select 1 from usuarios u where u.id = auth.uid() and u.es_super_admin))
  );

-- Solo quien puede verla puede darle seguimiento (cambiar estado,
-- responder) — mismo criterio que el select, para clínica o plataforma.
create policy arco_update_clinica on arco_solicitudes
  for update using (
    (clinica_id is not null and auth_rol() = 'owner' and clinica_id = auth_clinica_id())
    or (clinica_id is null and exists (select 1 from usuarios u where u.id = auth.uid() and u.es_super_admin))
  );

grant select, insert on arco_solicitudes to anon;
grant select, insert, update on arco_solicitudes to authenticated;

-- Mismo mecanismo de auditoría genérico que ya usan pacientes,
-- consentimientos, recetas, etc. — cada cambio de estado o respuesta
-- queda registrado solo (pedido explícito: "todas las acciones deben
-- auditarse").
create trigger trg_auditoria_arco
after insert or update on arco_solicitudes
for each row execute function fn_auditoria();
