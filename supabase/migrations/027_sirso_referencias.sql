-- ============================================================
-- SIRO — Referencias a otros médicos
-- ============================================================
-- Cubre las dos direcciones: referencias que ESTA clínica envía a un
-- especialista, y referencias que ESTA clínica recibe de otro médico
-- sobre un paciente. `direccion` distingue cuál es cuál.

create table referencias_medicas (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  dentista_id uuid references usuarios(id) on delete set null, -- quién la registra en el sistema
  direccion text not null check (direccion in ('enviada', 'recibida')),
  medico_nombre text not null,
  especialidad text,
  motivo text,
  diagnostico text,
  tratamiento_realizado text,
  creado_en timestamptz default now()
);

create index idx_referencias_paciente on referencias_medicas(paciente_id);

alter table referencias_medicas enable row level security;

-- Mismo criterio que recetas/consentimientos: información clínica,
-- solo owner/dentista.
create policy referencias_select on referencias_medicas
  for select using (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
    and auth_rol() in ('owner', 'dentista')
  );

create policy referencias_insert on referencias_medicas
  for insert with check (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
    and auth_rol() in ('owner', 'dentista')
  );

create trigger trg_auditoria_referencias
after insert on referencias_medicas
for each row execute function fn_auditoria();

grant select, insert on referencias_medicas to authenticated;
