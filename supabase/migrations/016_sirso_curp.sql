-- ============================================================
-- SIRO — CURP inteligente al registrar paciente
-- ============================================================
alter table pacientes add column if not exists curp text;
alter table pacientes add column if not exists sexo text;

alter table pacientes add constraint pacientes_sexo_check check (sexo is null or sexo in ('M', 'F', 'X'));

-- Único por clínica (no globalmente — dos clínicas distintas usando SIRO
-- podrían coincidentemente atender al mismo paciente cada una con su
-- propio expediente, eso es válido).
create unique index if not exists idx_pacientes_curp_por_clinica
  on pacientes (clinica_id, curp)
  where curp is not null;
