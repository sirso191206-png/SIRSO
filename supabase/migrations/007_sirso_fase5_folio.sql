-- ============================================================
-- SIRSO — FASE 5: Pacientes — folio automático de expediente
-- ============================================================
-- Cada clínica lleva su propio contador (EXP-0001, EXP-0002... por
-- clínica, no global) — se guarda en `clinicas` y se usa con un lock de
-- fila (FOR UPDATE) para evitar folios duplicados si dos personas crean
-- un paciente al mismo tiempo.

alter table clinicas add column if not exists siguiente_folio_paciente integer not null default 1;
alter table pacientes add column if not exists numero_expediente text;

-- Se integra al trigger que YA existía (fn_set_clinica_pacientes), en
-- vez de crear uno nuevo — mismo momento (BEFORE INSERT), misma
-- transacción, evita problemas de orden entre triggers.
create or replace function fn_set_clinica_pacientes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_folio integer;
begin
  if new.clinica_id is null then
    new.clinica_id := auth_clinica_id();
  end if;
  if new.creado_por is null then
    new.creado_por := auth.uid();
  end if;

  if new.numero_expediente is null then
    select siguiente_folio_paciente into v_folio
    from clinicas where id = new.clinica_id
    for update;

    new.numero_expediente := 'EXP-' || lpad(v_folio::text, 4, '0');

    update clinicas set siguiente_folio_paciente = v_folio + 1 where id = new.clinica_id;
  end if;

  return new;
end;
$$;

-- Folio único por clínica (dos clínicas SÍ pueden tener cada una su
-- propio "EXP-0001", son independientes)
create unique index if not exists idx_pacientes_numero_expediente on pacientes(clinica_id, numero_expediente);

-- Backfill: pacientes que ya existían no tienen folio todavía — se les
-- asigna en el orden en que fueron creados, por clínica.
do $$
declare
  v_paciente record;
  v_clinica_actual uuid := null;
  v_contador integer := 0;
begin
  for v_paciente in
    select id, clinica_id from pacientes where numero_expediente is null order by clinica_id, creado_en
  loop
    if v_paciente.clinica_id is distinct from v_clinica_actual then
      v_clinica_actual := v_paciente.clinica_id;
      v_contador := 0;
    end if;
    v_contador := v_contador + 1;
    update pacientes set numero_expediente = 'EXP-' || lpad(v_contador::text, 4, '0') where id = v_paciente.id;
  end loop;

  update clinicas c
  set siguiente_folio_paciente = greatest(
    siguiente_folio_paciente,
    coalesce((select count(*) + 1 from pacientes p where p.clinica_id = c.id), 1)
  );
end $$;

-- La vista de lectura también expone el folio (se agrega al final, no
-- se reordena nada, así que no hace falta DROP VIEW esta vez).
create or replace view v_pacientes_seguro
with (security_invoker = true) as
select
  id, clinica_id, nombre_completo, fecha_nacimiento, telefono, correo,
  direccion, creado_en, creado_por, archivado_en, numero_expediente,
  case when auth_rol() in ('owner', 'dentista') then contacto_emergencia end as contacto_emergencia,
  case when auth_rol() in ('owner', 'dentista') then seguro_medico end as seguro_medico,
  case when auth_rol() in ('owner', 'dentista') then notas_generales end as notas_generales
from pacientes;
