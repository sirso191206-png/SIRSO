-- ============================================================
-- SIRO — Cancelar tratamiento / anular pago (sin borrado destructivo)
-- Migración 062
-- ------------------------------------------------------------
-- Hallazgo real (verificado en código, no supuesto): hoy no existe
-- NINGUNA forma de eliminar ni cancelar un tratamiento o un pago — ni
-- función de servicio, ni botón, ni política de UPDATE en pagos.
--
-- TRATAMIENTOS: el esquema original (migración 001) YA soporta el
-- estado 'cancelado' desde siempre, y v_saldo_pacientes YA excluye
-- los tratamientos cancelados del total (`filter (where t.estado <>
-- 'cancelado')`) — el hueco era puramente de frontend (falta un botón
-- que ponga ese estado), no de base de datos. Aquí solo se agrega un
-- campo de motivo, para que cancelar deje contexto, no solo un cambio
-- de estado silencioso.
--
-- PAGOS: no tenía absolutamente ninguna política de UPDATE — insert
-- solamente. Se agrega la capacidad de "anular" (nunca de editar
-- monto/método/tipo) con el mismo patrón ya usado para revocar
-- consentimientos: columnas de anulación, una política de UPDATE, y
-- un trigger que protege todo lo demás de ser tocado.
-- ============================================================

-- ---------- 1. Tratamientos: motivo de cancelación ----------
alter table tratamientos add column if not exists motivo_cancelacion text;
alter table tratamientos add column if not exists cancelado_por uuid references usuarios(id) on delete set null;

-- ---------- 2. Pagos: anulación ----------
alter table pagos add column if not exists anulado_en timestamptz;
alter table pagos add column if not exists anulado_por uuid references usuarios(id) on delete set null;
alter table pagos add column if not exists motivo_anulacion text;

-- Mismos roles que ya pueden registrar un pago (pagos_write, 047) —
-- quien puede crearlo puede anularlo.
create policy pagos_update on pagos
  for update using (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
    and auth_rol() in ('owner', 'recepcion')
  );

-- Nunca se permite cambiar monto, método, tipo, paciente ni
-- tratamiento asociado de un pago ya registrado — solo anularlo. Un
-- pago mal capturado se anula y se vuelve a registrar bien; nunca se
-- "corrige" en el mismo registro (eso perdería el rastro de qué pasó
-- realmente).
create or replace function fn_solo_anulacion_pago()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
       new.monto is distinct from old.monto
    or new.metodo is distinct from old.metodo
    or new.tipo is distinct from old.tipo
    or new.paciente_id is distinct from old.paciente_id
    or new.tratamiento_id is distinct from old.tratamiento_id
    or new.registrado_por is distinct from old.registrado_por
    or new.creado_en is distinct from old.creado_en
  )
  then
    raise exception 'Un pago registrado no se puede editar — solo se puede anular.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_solo_anulacion_pago on pagos;
create trigger trg_solo_anulacion_pago
before update on pagos
for each row execute function fn_solo_anulacion_pago();

-- ---------- 3. Saldo: excluir tratamientos cancelados sigue igual, ----------
-- ---------- se agrega excluir pagos anulados también ----------
create or replace view v_saldo_pacientes as
select
  p.id as paciente_id,
  coalesce(sum(t.costo) filter (where t.estado <> 'cancelado'), 0) as total_tratamientos,
  coalesce((select sum(monto) from pagos pg where pg.paciente_id = p.id and pg.tipo <> 'reembolso' and pg.anulado_en is null), 0)
    - coalesce((select sum(monto) from pagos pg where pg.paciente_id = p.id and pg.tipo = 'reembolso' and pg.anulado_en is null), 0)
    as total_pagado,
  coalesce(sum(t.costo) filter (where t.estado <> 'cancelado'), 0)
    - (
        coalesce((select sum(monto) from pagos pg where pg.paciente_id = p.id and pg.tipo <> 'reembolso' and pg.anulado_en is null), 0)
        - coalesce((select sum(monto) from pagos pg where pg.paciente_id = p.id and pg.tipo = 'reembolso' and pg.anulado_en is null), 0)
      ) as saldo
from pacientes p
left join tratamientos t on t.paciente_id = p.id
group by p.id;

alter view v_saldo_pacientes set (security_invoker = true);
