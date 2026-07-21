-- ============================================================
-- SIRO — Recetas médicas
-- ============================================================
-- Un medicamento por receta requiere varios campos (dosis, vía,
-- frecuencia...) y una receta casi siempre lleva más de un medicamento
-- — se guarda como jsonb (mismo patrón ya usado para alergias/
-- enfermedades en expedientes), no una tabla hija nueva.

alter table usuarios add column if not exists cedula_profesional text;

create table recetas (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  dentista_id uuid references usuarios(id) on delete set null,
  medicamentos jsonb not null default '[]'::jsonb,
  -- cada elemento: { medicamento, presentacion, dosis, via, frecuencia, duracion, indicaciones }
  indicaciones_generales text,
  creado_en timestamptz default now()
);

create index idx_recetas_paciente on recetas(paciente_id);

alter table recetas enable row level security;

-- Mismo criterio que notas_clinicas/expedientes: es información médica,
-- solo owner/dentista la ven o crean — recepción/asistente no.
create policy recetas_select on recetas
  for select using (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
    and auth_rol() in ('owner', 'dentista')
  );

create policy recetas_insert on recetas
  for insert with check (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
    and auth_rol() in ('owner', 'dentista')
  );

create trigger trg_auditoria_recetas
after insert on recetas
for each row execute function fn_auditoria();

grant select, insert on recetas to authenticated;
