-- ============================================================
-- SIRO — Urgencias, turnos y cola de espera
-- ============================================================
-- Decisión de diseño: NO se crea una tabla `turnos` paralela. "Turno" es
-- simplemente el número consecutivo del día que ya tiene cada `cita`
-- (agendada o de urgencia) — así Mi día, Agenda y Consulta unificada
-- siguen leyendo de la misma tabla de siempre, sin lógica duplicada.

-- ------------------------------------------------------------
-- 1) Columnas nuevas en citas
-- ------------------------------------------------------------
alter table citas add column if not exists es_urgencia boolean not null default false;
alter table citas add column if not exists numero_turno integer;
alter table citas add column if not exists prioridad text not null default 'normal';

alter table citas add constraint citas_prioridad_check check (prioridad in ('normal', 'alta', 'urgente'));

-- ------------------------------------------------------------
-- 2) Ampliar estados: se agrega 'pausado' (el único que faltaba de la
--    lista pedida — "Llegó" se sigue tratando igual que "en_espera" para
--    no duplicar un paso que ya cumplía la misma función).
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
  'pendiente_confirmar', 'agendada', 'confirmada', 'en_espera',
  'en_consulta', 'pausado', 'completada', 'cancelada', 'no_asistio'
));

-- ------------------------------------------------------------
-- 3) Número de turno automático — consecutivo por clínica, se reinicia
--    cada día. Cubre TODAS las citas del día (agendadas y urgencias),
--    tal como el ejemplo del documento (Turno 21, 22, 23... mezclados).
-- ------------------------------------------------------------
create or replace function fn_asignar_numero_turno()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinica_id uuid;
  v_siguiente integer;
begin
  if new.numero_turno is not null then
    return new;
  end if;

  select clinica_id into v_clinica_id from pacientes where id = new.paciente_id;

  select coalesce(max(c.numero_turno), 0) + 1 into v_siguiente
  from citas c
  join pacientes p on p.id = c.paciente_id
  where p.clinica_id = v_clinica_id
    and c.inicio >= date_trunc('day', new.inicio)
    and c.inicio < date_trunc('day', new.inicio) + interval '1 day';

  new.numero_turno := v_siguiente;
  return new;
end;
$$;

create trigger trg_asignar_numero_turno
before insert on citas
for each row execute function fn_asignar_numero_turno();
