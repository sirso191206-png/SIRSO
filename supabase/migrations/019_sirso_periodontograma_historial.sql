-- ============================================================
-- SIRO — Historial del periodontograma
-- ============================================================
-- Mismo patrón que odontograma_historial: append-only, se registra
-- automáticamente vía trigger, nunca se escribe a mano desde el
-- frontend. Cubre AMBAS tablas (piezas y sitios) porque un cambio real
-- en consulta casi siempre toca varios sitios a la vez — se guarda un
-- registro por cada campo que realmente cambió, no uno genérico.

create table periodontograma_historial (
  id uuid primary key default gen_random_uuid(),
  pieza_id uuid not null references periodontograma_piezas(id) on delete cascade,
  sitio text, -- null si el cambio fue a nivel de la pieza completa (movilidad/furcación)
  campo text not null,
  valor_anterior text,
  valor_nuevo text not null,
  cambiado_por uuid references usuarios(id) on delete set null,
  creado_en timestamptz default now()
);

create index idx_periodontograma_historial_pieza on periodontograma_historial(pieza_id);

-- ------------------------------------------------------------
-- Trigger sobre periodontograma_piezas: movilidad y furcación
-- ------------------------------------------------------------
create or replace function fn_registrar_historial_periodontal_pieza()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.movilidad is distinct from old.movilidad then
    insert into periodontograma_historial (pieza_id, campo, valor_anterior, valor_nuevo, cambiado_por)
    values (new.id, 'movilidad', old.movilidad::text, new.movilidad::text, auth.uid());
  end if;

  if new.furcacion is distinct from old.furcacion then
    insert into periodontograma_historial (pieza_id, campo, valor_anterior, valor_nuevo, cambiado_por)
    values (new.id, 'furcacion', old.furcacion::text, new.furcacion::text, auth.uid());
  end if;

  return new;
end;
$$;

create trigger trg_historial_periodontal_pieza
after update on periodontograma_piezas
for each row execute function fn_registrar_historial_periodontal_pieza();

-- ------------------------------------------------------------
-- Trigger sobre periodontograma_sitios: sondaje, recesión, sangrado,
-- placa, cálculo — cada campo que cambie queda como su propia fila.
-- ------------------------------------------------------------
create or replace function fn_registrar_historial_periodontal_sitio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.profundidad_sondaje is distinct from old.profundidad_sondaje then
    insert into periodontograma_historial (pieza_id, sitio, campo, valor_anterior, valor_nuevo, cambiado_por)
    values (new.pieza_id, new.sitio, 'profundidad_sondaje', old.profundidad_sondaje::text, new.profundidad_sondaje::text, auth.uid());
  end if;

  if new.recesion is distinct from old.recesion then
    insert into periodontograma_historial (pieza_id, sitio, campo, valor_anterior, valor_nuevo, cambiado_por)
    values (new.pieza_id, new.sitio, 'recesion', old.recesion::text, new.recesion::text, auth.uid());
  end if;

  if new.sangrado is distinct from old.sangrado then
    insert into periodontograma_historial (pieza_id, sitio, campo, valor_anterior, valor_nuevo, cambiado_por)
    values (new.pieza_id, new.sitio, 'sangrado', old.sangrado::text, new.sangrado::text, auth.uid());
  end if;

  if new.placa is distinct from old.placa then
    insert into periodontograma_historial (pieza_id, sitio, campo, valor_anterior, valor_nuevo, cambiado_por)
    values (new.pieza_id, new.sitio, 'placa', old.placa::text, new.placa::text, auth.uid());
  end if;

  if new.calculo is distinct from old.calculo then
    insert into periodontograma_historial (pieza_id, sitio, campo, valor_anterior, valor_nuevo, cambiado_por)
    values (new.pieza_id, new.sitio, 'calculo', old.calculo::text, new.calculo::text, auth.uid());
  end if;

  return new;
end;
$$;

create trigger trg_historial_periodontal_sitio
after update on periodontograma_sitios
for each row execute function fn_registrar_historial_periodontal_sitio();

-- ------------------------------------------------------------
-- RLS — mismo criterio que el resto del periodontograma: solo lectura
-- para owner/dentista, y nunca escritura directa desde el frontend (el
-- historial solo lo escribe el trigger, con security definer).
-- ------------------------------------------------------------
alter table periodontograma_historial enable row level security;

create policy periodontograma_historial_select on periodontograma_historial
  for select using (
    exists (
      select 1 from periodontograma_piezas pp
      join pacientes p on p.id = pp.paciente_id
      where pp.id = pieza_id and p.clinica_id = auth_clinica_id()
      and auth_rol() in ('owner', 'dentista')
    )
  );

grant select on periodontograma_historial to authenticated;
