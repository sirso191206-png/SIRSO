-- ============================================================
-- SIRSO — FASE 4: Expediente clínico completo
-- ============================================================
-- alergias, enfermedades y medicamentos_actuales YA EXISTÍAN desde
-- Fase 1 (jsonb, nunca expuestos en la interfaz) — no se tocan, solo se
-- van a usar. Todo lo demás es aditivo: columnas nuevas opcionales y dos
-- tablas nuevas (signos_vitales, documentos_clinicos), append-only igual
-- que notas_clinicas.

-- ------------------------------------------------------------
-- 1. Datos médicos y hábitos — columnas nuevas en expedientes
-- ------------------------------------------------------------
alter table expedientes add column if not exists cirugias_anteriores jsonb default '[]';
alter table expedientes add column if not exists hospitalizaciones jsonb default '[]';
alter table expedientes add column if not exists antecedentes_odontologicos text;

alter table expedientes add column if not exists tabaquismo text check (tabaquismo in ('no', 'ocasional', 'frecuente'));
alter table expedientes add column if not exists consumo_alcohol text check (consumo_alcohol in ('no', 'ocasional', 'frecuente'));
alter table expedientes add column if not exists bruxismo boolean;
alter table expedientes add column if not exists higiene_dental text check (higiene_dental in ('buena', 'regular', 'mala'));
alter table expedientes add column if not exists frecuencia_cepillado text;

-- ------------------------------------------------------------
-- 2. Consulta estructurada — campos opcionales en notas_clinicas
--    (la nota simple de "contenido" libre sigue funcionando igual;
--    esto es adicional para cuando se quiera registrar una consulta
--    completa)
-- ------------------------------------------------------------
alter table notas_clinicas add column if not exists diagnostico text;
alter table notas_clinicas add column if not exists pronostico text;
alter table notas_clinicas add column if not exists plan_tratamiento text;

-- ------------------------------------------------------------
-- 3. Signos vitales — un registro por toma (historial real, no un
--    solo valor que se sobreescribe)
-- ------------------------------------------------------------
create table signos_vitales (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  presion_arterial text,
  frecuencia_cardiaca integer,
  temperatura numeric(4, 1),
  peso numeric(5, 2),
  estatura numeric(5, 2),
  registrado_por uuid references usuarios(id) on delete set null,
  creado_en timestamptz default now()
);

alter table signos_vitales enable row level security;

create policy signos_vitales_select on signos_vitales
  for select using (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
    and auth_rol() in ('owner', 'dentista')
  );

create policy signos_vitales_insert on signos_vitales
  for insert with check (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
    and auth_rol() in ('owner', 'dentista')
  );

-- ------------------------------------------------------------
-- 4. Documentos clínicos: consentimientos, documentos, estudios,
--    adjuntos — mismo patrón que fotografías (Storage privado)
-- ------------------------------------------------------------
create table documentos_clinicos (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  tipo text not null check (tipo in ('consentimiento', 'documento', 'estudio', 'adjunto')),
  nombre text not null,
  descripcion text,
  url_storage text not null,
  subido_por uuid references usuarios(id) on delete set null,
  creado_en timestamptz default now()
);

alter table documentos_clinicos enable row level security;

create policy documentos_clinicos_select on documentos_clinicos
  for select using (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
    and auth_rol() in ('owner', 'dentista')
  );

create policy documentos_clinicos_insert on documentos_clinicos
  for insert with check (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
    and auth_rol() in ('owner', 'dentista')
  );

insert into storage.buckets (id, name, public)
values ('documentos-clinicos', 'documentos-clinicos', false)
on conflict (id) do nothing;

create policy storage_documentos_select on storage.objects
  for select using (bucket_id = 'documentos-clinicos' and auth.role() = 'authenticated');

create policy storage_documentos_insert on storage.objects
  for insert with check (bucket_id = 'documentos-clinicos' and auth.role() = 'authenticated');
