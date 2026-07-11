-- ============================================================
-- FASE 2 — Módulo 1: Odontograma interactivo
-- ============================================================
-- Notación FDI (11-48), 32 piezas permanentes. El historial es
-- append-only, igual que las notas clínicas de Fase 1: nunca se
-- sobreescribe un cambio de estado, se registra como evento nuevo.

create table odontograma_piezas (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  numero_pieza text not null,
  estado text not null default 'sano' check (estado in (
    'sano', 'caries', 'obturado', 'corona', 'ausente',
    'implante', 'endodoncia', 'fracturado', 'en_tratamiento'
  )),
  superficie text check (superficie in ('oclusal', 'mesial', 'distal', 'vestibular', 'lingual')),
  actualizado_en timestamptz default now(),
  actualizado_por uuid references usuarios(id) on delete set null,
  unique (paciente_id, numero_pieza)
);

create index idx_odontograma_paciente on odontograma_piezas(paciente_id);

create table odontograma_historial (
  id uuid primary key default gen_random_uuid(),
  pieza_id uuid not null references odontograma_piezas(id) on delete cascade,
  estado_anterior text,
  estado_nuevo text not null,
  cambiado_por uuid references usuarios(id) on delete set null,
  creado_en timestamptz default now()
);

-- Al crear un paciente, se le crean automáticamente sus 32 piezas en
-- estado 'sano' — igual que el expediente vacío de Fase 1.
create or replace function fn_crear_odontograma_paciente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_piezas text[] := array[
    '18','17','16','15','14','13','12','11','21','22','23','24','25','26','27','28',
    '48','47','46','45','44','43','42','41','31','32','33','34','35','36','37','38'
  ];
  v_pieza text;
begin
  foreach v_pieza in array v_piezas loop
    insert into odontograma_piezas (paciente_id, numero_pieza, estado)
    values (new.id, v_pieza, 'sano');
  end loop;
  return new;
end;
$$;

create trigger trg_crear_odontograma_paciente
after insert on pacientes
for each row execute function fn_crear_odontograma_paciente();

-- Cada cambio de estado queda registrado en el historial automáticamente
create or replace function fn_registrar_historial_odontograma()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado is distinct from old.estado then
    insert into odontograma_historial (pieza_id, estado_anterior, estado_nuevo, cambiado_por)
    values (new.id, old.estado, new.estado, auth.uid());
  end if;
  return new;
end;
$$;

create trigger trg_historial_odontograma
after update on odontograma_piezas
for each row execute function fn_registrar_historial_odontograma();

-- RLS: mismo criterio que expediente/notas — solo owner y dentista, ni
-- recepción ni asistente ven ni tocan el odontograma (es dato clínico).
alter table odontograma_piezas enable row level security;
alter table odontograma_historial enable row level security;

create policy odontograma_select on odontograma_piezas
  for select using (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
    and auth_rol() in ('owner', 'dentista')
  );

create policy odontograma_update on odontograma_piezas
  for update using (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
    and auth_rol() in ('owner', 'dentista')
  );

create policy odontograma_historial_select on odontograma_historial
  for select using (
    exists (
      select 1 from odontograma_piezas op join pacientes p on p.id = op.paciente_id
      where op.id = pieza_id and p.clinica_id = auth_clinica_id()
    )
    and auth_rol() in ('owner', 'dentista')
  );

-- Backfill: pacientes que ya existían antes de este módulo no tienen
-- piezas todavía — se les crean ahora mismo.
do $$
declare
  v_piezas text[] := array[
    '18','17','16','15','14','13','12','11','21','22','23','24','25','26','27','28',
    '48','47','46','45','44','43','42','41','31','32','33','34','35','36','37','38'
  ];
  v_pieza text;
  v_paciente record;
begin
  for v_paciente in select id from pacientes loop
    foreach v_pieza in array v_piezas loop
      insert into odontograma_piezas (paciente_id, numero_pieza, estado)
      values (v_paciente.id, v_pieza, 'sano')
      on conflict (paciente_id, numero_pieza) do nothing;
    end loop;
  end loop;
end $$;
