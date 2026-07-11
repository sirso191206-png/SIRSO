-- ============================================================
-- FASE 2 — Odontograma: caras individuales por pieza
-- ============================================================
-- odontograma_piezas.estado sigue existiendo para condiciones que cubren
-- TODO el diente (ausente, corona, implante, endodoncia, en_tratamiento).
-- Esta tabla nueva es para condiciones de UNA superficie específica
-- (caries, obturado, fracturado) — cada pieza tiene 5 caras.

create table odontograma_caras (
  id uuid primary key default gen_random_uuid(),
  pieza_id uuid not null references odontograma_piezas(id) on delete cascade,
  cara text not null check (cara in ('oclusal', 'mesial', 'distal', 'vestibular', 'lingual')),
  estado text not null default 'sano' check (estado in ('sano', 'caries', 'obturado', 'fracturado', 'en_tratamiento')),
  actualizado_en timestamptz default now(),
  actualizado_por uuid references usuarios(id) on delete set null,
  unique (pieza_id, cara)
);

-- El historial ya existente se reutiliza; solo se le agrega de qué cara
-- viene el cambio (null = era un cambio de la pieza completa).
alter table odontograma_historial add column cara text;

-- Al crear una pieza, se le crean sus 5 caras en 'sano' automáticamente
create or replace function fn_crear_caras_pieza()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cara text;
begin
  foreach v_cara in array array['oclusal', 'mesial', 'distal', 'vestibular', 'lingual'] loop
    insert into odontograma_caras (pieza_id, cara) values (new.id, v_cara);
  end loop;
  return new;
end;
$$;

create trigger trg_crear_caras_pieza
after insert on odontograma_piezas
for each row execute function fn_crear_caras_pieza();

-- Cada cambio de estado de una cara queda en el historial, igual que las
-- piezas completas
create or replace function fn_registrar_historial_cara()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado is distinct from old.estado then
    insert into odontograma_historial (pieza_id, estado_anterior, estado_nuevo, cambiado_por, cara)
    values (new.pieza_id, old.estado, new.estado, auth.uid(), new.cara);
  end if;
  return new;
end;
$$;

create trigger trg_historial_cara
after update on odontograma_caras
for each row execute function fn_registrar_historial_cara();

alter table odontograma_caras enable row level security;

create policy odontograma_caras_select on odontograma_caras
  for select using (
    exists (
      select 1 from odontograma_piezas op join pacientes p on p.id = op.paciente_id
      where op.id = pieza_id and p.clinica_id = auth_clinica_id()
    )
    and auth_rol() in ('owner', 'dentista')
  );

create policy odontograma_caras_update on odontograma_caras
  for update using (
    exists (
      select 1 from odontograma_piezas op join pacientes p on p.id = op.paciente_id
      where op.id = pieza_id and p.clinica_id = auth_clinica_id()
    )
    and auth_rol() in ('owner', 'dentista')
  );

-- Backfill: piezas que ya existían de antes no tienen sus 5 caras todavía
do $$
declare
  v_pieza record;
  v_cara text;
begin
  for v_pieza in select id from odontograma_piezas loop
    foreach v_cara in array array['oclusal', 'mesial', 'distal', 'vestibular', 'lingual'] loop
      insert into odontograma_caras (pieza_id, cara)
      values (v_pieza.id, v_cara)
      on conflict (pieza_id, cara) do nothing;
    end loop;
  end loop;
end $$;
