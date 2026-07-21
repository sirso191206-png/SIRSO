-- ============================================================
-- SIRO — Consentimientos informados estructurados
-- ============================================================
-- Distinto del "consentimiento" que ya subes como archivo escaneado en
-- Archivos (eso se conserva, sigue sirviendo para formatos externos) —
-- este es un consentimiento generado y firmado DENTRO del sistema, con
-- las firmas capturadas de verdad (no solo un archivo).

create table consentimientos_informados (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  dentista_id uuid references usuarios(id) on delete set null,
  procedimiento text not null,
  riesgos text,
  beneficios text,
  alternativas text,
  firma_paciente_nombre text,
  firma_paciente_png text, -- imagen PNG en base64, capturada con el pad de firma
  firma_medico_nombre text,
  firma_medico_png text,
  testigo1_nombre text,
  testigo2_nombre text,
  creado_en timestamptz default now()
);

create index idx_consentimientos_paciente on consentimientos_informados(paciente_id);

alter table consentimientos_informados enable row level security;

-- Mismo criterio que recetas/notas: información clínica, solo
-- owner/dentista la ven o crean.
create policy consentimientos_select on consentimientos_informados
  for select using (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
    and auth_rol() in ('owner', 'dentista')
  );

create policy consentimientos_insert on consentimientos_informados
  for insert with check (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
    and auth_rol() in ('owner', 'dentista')
  );

create trigger trg_auditoria_consentimientos
after insert on consentimientos_informados
for each row execute function fn_auditoria();

grant select, insert on consentimientos_informados to authenticated;
