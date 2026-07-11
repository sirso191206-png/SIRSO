-- ============================================================
-- SIRSO — FASE 1: Agenda semanal profesional
-- ============================================================
-- No se elimina ni se reestructura nada existente: se amplían los
-- estados de `citas`, se agregan columnas nuevas, y se crean dos tablas
-- nuevas (horarios bloqueados, lista de espera). La restricción de
-- traslapes entre citas del mismo dentista (EXCLUDE USING gist) se
-- conserva intacta, tal como se pidió.

-- ------------------------------------------------------------
-- 1. Ampliar estados de citas (sin quitar los que ya existían)
-- ------------------------------------------------------------
do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'citas'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%estado%';
  if v_constraint_name is not null then
    execute format('alter table citas drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table citas add constraint citas_estado_check check (estado in (
  'pendiente_confirmar', 'agendada', 'confirmada', 'en_espera', 'en_consulta',
  'completada', 'cancelada', 'no_asistio'
));

-- ------------------------------------------------------------
-- 2. Columnas nuevas en citas (todas opcionales, no rompen filas viejas)
-- ------------------------------------------------------------
alter table citas add column if not exists motivo_consulta text;
alter table citas add column if not exists tipo_consulta text;
alter table citas add column if not exists consultorio text;
alter table citas add column if not exists recordatorio boolean not null default false;

-- ------------------------------------------------------------
-- 3. Dentista puede actualizar (no crear/borrar) SUS PROPIAS citas —
--    necesario para acciones del flujo clínico: confirmar, iniciar
--    consulta, completar. Antes solo owner/recepción podían tocar citas.
-- ------------------------------------------------------------
create policy citas_update_dentista on citas
  for update using (
    dentista_id = auth.uid()
    and exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
  );

-- ------------------------------------------------------------
-- 4. Horarios bloqueados (comida, descanso, vacaciones, ausencias)
-- ------------------------------------------------------------
create table horarios_bloqueados (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id),
  dentista_id uuid references usuarios(id) on delete set null, -- null = bloqueo de toda la clínica
  tipo text not null check (tipo in ('comida', 'descanso', 'vacaciones', 'ausencia', 'otro')),
  titulo text,
  inicio timestamptz not null,
  fin timestamptz not null,
  creado_por uuid references usuarios(id) on delete set null,
  creado_en timestamptz default now(),
  constraint chk_horario_bloqueado check (fin > inicio)
);

create index idx_horarios_bloqueados_clinica on horarios_bloqueados(clinica_id);

alter table horarios_bloqueados enable row level security;

create policy horarios_bloqueados_select on horarios_bloqueados
  for select using (clinica_id = auth_clinica_id());

create policy horarios_bloqueados_write on horarios_bloqueados
  for all using (clinica_id = auth_clinica_id() and auth_rol() in ('owner', 'recepcion'));

-- Impide agendar una cita encima de un horario bloqueado (comida,
-- vacaciones, etc.), para el dentista específico o para toda la clínica
-- si el bloqueo no tiene dentista_id.
create or replace function fn_validar_horario_bloqueado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from horarios_bloqueados hb
    where hb.clinica_id = auth_clinica_id()
      and (hb.dentista_id is null or hb.dentista_id = new.dentista_id)
      and tstzrange(hb.inicio, hb.fin) && tstzrange(new.inicio, new.fin)
  ) then
    raise exception 'Ese horario está bloqueado (comida, descanso, vacaciones u otra ausencia).';
  end if;
  return new;
end;
$$;

create trigger trg_validar_horario_bloqueado
before insert or update on citas
for each row execute function fn_validar_horario_bloqueado();

-- ------------------------------------------------------------
-- 5. Lista de espera (pacientes que quieren ocupar una cancelación)
-- ------------------------------------------------------------
create table lista_espera (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  dentista_id uuid references usuarios(id) on delete set null,
  motivo text,
  disponibilidad text,
  atendido boolean not null default false,
  creado_por uuid references usuarios(id) on delete set null,
  creado_en timestamptz default now()
);

alter table lista_espera enable row level security;

create policy lista_espera_select on lista_espera
  for select using (clinica_id = auth_clinica_id());

create policy lista_espera_write on lista_espera
  for all using (clinica_id = auth_clinica_id() and auth_rol() in ('owner', 'recepcion'));

-- clinica_id se rellena solo, igual que en pacientes, para que el
-- frontend no tenga que conocer/enviar el id de su propia clínica.
create or replace function fn_set_clinica_generico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.clinica_id is null then
    new.clinica_id := auth_clinica_id();
  end if;
  return new;
end;
$$;

create trigger trg_set_clinica_horarios_bloqueados
before insert on horarios_bloqueados
for each row execute function fn_set_clinica_generico();

create trigger trg_set_clinica_lista_espera
before insert on lista_espera
for each row execute function fn_set_clinica_generico();
