-- ============================================================
-- SIRO — Fase 7: Pagos — folio de recibo
-- ============================================================
alter table clinicas add column if not exists siguiente_folio_recibo integer not null default 1;
alter table pagos add column if not exists numero_recibo text;

create or replace function fn_asignar_numero_recibo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinica_id uuid;
  v_folio integer;
begin
  if new.numero_recibo is not null then
    return new;
  end if;

  select clinica_id into v_clinica_id from pacientes where id = new.paciente_id;

  select siguiente_folio_recibo into v_folio
  from clinicas where id = v_clinica_id
  for update;

  new.numero_recibo := 'REC-' || lpad(v_folio::text, 5, '0');

  update clinicas set siguiente_folio_recibo = v_folio + 1 where id = v_clinica_id;

  return new;
end;
$$;

create trigger trg_asignar_numero_recibo
before insert on pagos
for each row execute function fn_asignar_numero_recibo();

-- Backfill: a los pagos que ya existían (creados antes de este folio) se
-- les asigna uno en orden cronológico, para que nada se quede sin número.
do $$
declare
  v_pago record;
  v_clinica_actual uuid := null;
  v_contador integer := 0;
begin
  for v_pago in
    select p.id, pa.clinica_id
    from pagos p
    join pacientes pa on pa.id = p.paciente_id
    where p.numero_recibo is null
    order by pa.clinica_id, p.creado_en
  loop
    if v_pago.clinica_id is distinct from v_clinica_actual then
      v_clinica_actual := v_pago.clinica_id;
      v_contador := 0;
    end if;
    v_contador := v_contador + 1;
    update pagos set numero_recibo = 'REC-' || lpad(v_contador::text, 5, '0') where id = v_pago.id;
  end loop;

  update clinicas c
  set siguiente_folio_recibo = greatest(
    siguiente_folio_recibo,
    coalesce((select count(*) + 1 from pagos p join pacientes pa on pa.id = p.paciente_id where pa.clinica_id = c.id), 1)
  );
end $$;
