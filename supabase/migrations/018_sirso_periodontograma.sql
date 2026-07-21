-- ============================================================
-- SIRO — Periodontograma
-- ============================================================
-- Estructura clínica estándar: 6 sitios de medición por pieza (mesial,
-- medio, distal — vestibular y palatino/lingual). Un solo número por
-- diente no sirve para diagnóstico periodontal real; los 6 sitios sí.
-- Movilidad y furcación son por pieza completa (así se miden en
-- clínica). Mismo patrón de auto-creación que el odontograma: al dar de
-- alta un paciente, se crean solas sus 32 piezas y sus 192 sitios (32×6).

create table periodontograma_piezas (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  numero_pieza text not null,
  movilidad integer not null default 0 check (movilidad between 0 and 3),
  furcacion integer not null default 0 check (furcacion between 0 and 3),
  actualizado_en timestamptz default now(),
  actualizado_por uuid references usuarios(id) on delete set null,
  unique (paciente_id, numero_pieza)
);

create index idx_periodontograma_piezas_paciente on periodontograma_piezas(paciente_id);

create table periodontograma_sitios (
  id uuid primary key default gen_random_uuid(),
  pieza_id uuid not null references periodontograma_piezas(id) on delete cascade,
  sitio text not null check (sitio in ('mesial_v', 'medio_v', 'distal_v', 'mesial_l', 'medio_l', 'distal_l')),
  profundidad_sondaje integer not null default 0 check (profundidad_sondaje between 0 and 20), -- mm
  recesion integer not null default 0 check (recesion between -10 and 15), -- mm, negativo = margen coronal a la unión cemento-esmalte
  sangrado boolean not null default false,
  placa boolean not null default false,
  calculo boolean not null default false,
  actualizado_en timestamptz default now(),
  actualizado_por uuid references usuarios(id) on delete set null,
  unique (pieza_id, sitio)
);

create index idx_periodontograma_sitios_pieza on periodontograma_sitios(pieza_id);

-- Función reutilizable: crea las 32 piezas + 192 sitios de un paciente.
-- Se usa tanto en el trigger (pacientes nuevos) como en el backfill
-- (pacientes que ya existían antes de esta migración).
create or replace function fn_crear_periodontograma_paciente_para(p_paciente_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_piezas text[] := array[
    '18','17','16','15','14','13','12','11','21','22','23','24','25','26','27','28',
    '48','47','46','45','44','43','42','41','31','32','33','34','35','36','37','38'
  ];
  v_sitios text[] := array['mesial_v', 'medio_v', 'distal_v', 'mesial_l', 'medio_l', 'distal_l'];
  v_pieza text;
  v_sitio text;
  v_pieza_id uuid;
begin
  foreach v_pieza in array v_piezas loop
    insert into periodontograma_piezas (paciente_id, numero_pieza)
    values (p_paciente_id, v_pieza)
    on conflict (paciente_id, numero_pieza) do nothing
    returning id into v_pieza_id;

    if v_pieza_id is not null then
      foreach v_sitio in array v_sitios loop
        insert into periodontograma_sitios (pieza_id, sitio)
        values (v_pieza_id, v_sitio);
      end loop;
    end if;
    v_pieza_id := null;
  end loop;
end;
$$;

create or replace function fn_crear_periodontograma_paciente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform fn_crear_periodontograma_paciente_para(new.id);
  return new;
end;
$$;

create trigger trg_crear_periodontograma_paciente
after insert on pacientes
for each row execute function fn_crear_periodontograma_paciente();

-- Backfill: pacientes que ya existían antes de esta migración también
-- reciben su periodontograma vacío.
do $$
declare
  v_paciente record;
begin
  for v_paciente in select id from pacientes loop
    if not exists (select 1 from periodontograma_piezas where paciente_id = v_paciente.id) then
      perform fn_crear_periodontograma_paciente_para(v_paciente.id);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- RLS — mismo criterio que el odontograma: solo owner/dentista, tanto
-- para ver como para editar (información clínica).
-- ------------------------------------------------------------
alter table periodontograma_piezas enable row level security;
alter table periodontograma_sitios enable row level security;

create policy periodontograma_piezas_select on periodontograma_piezas
  for select using (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
  );
create policy periodontograma_piezas_write on periodontograma_piezas
  for update using (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
    and auth_rol() in ('owner', 'dentista')
  );

create policy periodontograma_sitios_select on periodontograma_sitios
  for select using (
    exists (
      select 1 from periodontograma_piezas pp
      join pacientes p on p.id = pp.paciente_id
      where pp.id = pieza_id and p.clinica_id = auth_clinica_id()
    )
  );
create policy periodontograma_sitios_write on periodontograma_sitios
  for update using (
    exists (
      select 1 from periodontograma_piezas pp
      join pacientes p on p.id = pp.paciente_id
      where pp.id = pieza_id and p.clinica_id = auth_clinica_id()
    )
    and auth_rol() in ('owner', 'dentista')
  );

grant select, update on periodontograma_piezas to authenticated;
grant select, update on periodontograma_sitios to authenticated;
