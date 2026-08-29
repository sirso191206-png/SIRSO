-- ============================================================
-- SIRO — Fase 1: fundación de Multi-Sucursal
-- Migración 047
-- ------------------------------------------------------------
-- CONTEXTO: SIRO hoy es de una sola ubicación por clínica. Esta
-- migración agrega la ESTRUCTURA (sucursales → consultorios →
-- sillones) y la ASIGNACIÓN de usuarios a sucursales, sin romper
-- nada de lo existente.
--
-- DECISIÓN DE DISEÑO CENTRAL — compatibilidad hacia atrás real:
-- `sucursal_id` en citas/pagos es NULLABLE. Si una clínica nunca crea
-- una sucursal, todo su comportamiento queda IDÉNTICO al de hoy — la
-- función auth_sucursal_permitida() devuelve true cuando el valor es
-- NULL, así que ninguna política nueva restringe nada extra para
-- quien no adopta esto.
--
-- ALCANCE DELIBERADAMENTE LIMITADO: los pacientes y TODO lo clínico
-- (expediente, notas, tratamientos, recetas, documentos, odontograma,
-- periodontograma, fotografías, signos vitales) NO se tocan — un
-- paciente es global a la clínica, no a la sucursal (pedido
-- explícito: "no duplicar pacientes por sucursal"). Solo citas y
-- pagos, que sí representan un evento en un lugar físico concreto,
-- reciben sucursal_id.
-- ============================================================

-- ---------- 1. Estructura física ----------
create table if not exists sucursales (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  nombre text not null,
  direccion text,
  telefono text,
  whatsapp text,
  correo text,
  activa boolean not null default true,
  creado_en timestamptz default now()
);

create table if not exists consultorios (
  id uuid primary key default gen_random_uuid(),
  sucursal_id uuid not null references sucursales(id) on delete cascade,
  nombre text not null,
  activo boolean not null default true,
  creado_en timestamptz default now()
);

create table if not exists sillones (
  id uuid primary key default gen_random_uuid(),
  consultorio_id uuid not null references consultorios(id) on delete cascade,
  nombre text not null,
  activo boolean not null default true,
  creado_en timestamptz default now()
);

-- ---------- 2. Asignación de usuarios a sucursales ----------
-- Un usuario puede estar en una o varias sucursales. El owner NO
-- necesita fila aquí — auth_sucursal_permitida() lo deja pasar
-- siempre, igual que auth_paciente_asignado() ya hace para pacientes.
create table if not exists sucursal_usuarios (
  id uuid primary key default gen_random_uuid(),
  sucursal_id uuid not null references sucursales(id) on delete cascade,
  usuario_id uuid not null references usuarios(id) on delete cascade,
  activo boolean not null default true,
  creado_en timestamptz default now(),
  unique (sucursal_id, usuario_id)
);

-- Nunca permitir vincular un usuario a una sucursal de otra clínica
-- — mismo patrón ya usado en asistente_dentista_asignaciones.
create or replace function fn_validar_sucursal_usuarios()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinica_sucursal uuid;
  v_clinica_usuario uuid;
begin
  select clinica_id into v_clinica_sucursal from sucursales where id = new.sucursal_id;
  select clinica_id into v_clinica_usuario from usuarios where id = new.usuario_id;
  if v_clinica_sucursal is distinct from v_clinica_usuario then
    raise exception 'No se puede asignar un usuario a una sucursal de otra clínica.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validar_sucursal_usuarios on sucursal_usuarios;
create trigger trg_validar_sucursal_usuarios
before insert or update on sucursal_usuarios
for each row execute function fn_validar_sucursal_usuarios();

-- ---------- 3. Función central — única fuente de verdad ----------
-- Mismo patrón que auth_paciente_asignado(): un solo lugar con la
-- regla de "¿puedo operar en esta sucursal?", reutilizado en todas
-- las políticas de abajo. NULL = sin restricción (compatibilidad).
create or replace function auth_sucursal_permitida(p_sucursal_id uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select
    p_sucursal_id is null
    or auth_rol() = 'owner'
    or exists (
      select 1 from sucursal_usuarios su
      where su.usuario_id = auth.uid() and su.sucursal_id = p_sucursal_id and su.activo
    )
$$;

-- ---------- 4. RLS de la estructura nueva ----------
alter table sucursales enable row level security;
create policy sucursales_select on sucursales
  for select using (
    clinica_id = auth_clinica_id()
    and (auth_rol() = 'owner' or exists (
      select 1 from sucursal_usuarios su
      where su.sucursal_id = sucursales.id and su.usuario_id = auth.uid() and su.activo
    ))
  );
create policy sucursales_write on sucursales
  for all using (clinica_id = auth_clinica_id() and auth_rol() = 'owner');

alter table consultorios enable row level security;
create policy consultorios_select on consultorios
  for select using (
    exists (select 1 from sucursales s where s.id = sucursal_id and s.clinica_id = auth_clinica_id())
    and auth_sucursal_permitida(sucursal_id)
  );
create policy consultorios_write on consultorios
  for all using (
    exists (select 1 from sucursales s where s.id = sucursal_id and s.clinica_id = auth_clinica_id())
    and auth_rol() = 'owner'
  );

alter table sillones enable row level security;
create policy sillones_select on sillones
  for select using (
    exists (
      select 1 from consultorios c join sucursales s on s.id = c.sucursal_id
      where c.id = consultorio_id and s.clinica_id = auth_clinica_id() and auth_sucursal_permitida(s.id)
    )
  );
create policy sillones_write on sillones
  for all using (
    exists (
      select 1 from consultorios c join sucursales s on s.id = c.sucursal_id
      where c.id = consultorio_id and s.clinica_id = auth_clinica_id()
    )
    and auth_rol() = 'owner'
  );

alter table sucursal_usuarios enable row level security;
create policy sucursal_usuarios_select on sucursal_usuarios
  for select using (
    exists (select 1 from sucursales s where s.id = sucursal_id and s.clinica_id = auth_clinica_id())
    and (auth_rol() = 'owner' or usuario_id = auth.uid())
  );
create policy sucursal_usuarios_write on sucursal_usuarios
  for all using (
    exists (select 1 from sucursales s where s.id = sucursal_id and s.clinica_id = auth_clinica_id())
    and auth_rol() = 'owner'
  );

-- ---------- 5. Enganchar citas y pagos a sucursal (columnas nuevas, NULLABLE) ----------
alter table citas add column if not exists sucursal_id uuid references sucursales(id) on delete set null;
alter table citas add column if not exists consultorio_id uuid references consultorios(id) on delete set null;
alter table citas add column if not exists sillon_id uuid references sillones(id) on delete set null;

alter table pagos add column if not exists sucursal_id uuid references sucursales(id) on delete set null;

-- Conflicto de sillón: mismo mecanismo ya usado para dentista_id — a
-- nivel de base de datos, no solo validación de frontend. Solo aplica
-- si la cita SÍ tiene sillón asignado (compatibilidad con citas sin
-- multi-sucursal).
alter table citas add constraint chk_sillon_no_traslape
  exclude using gist (
    sillon_id with =,
    tstzrange(inicio, fin) with &&
  ) where (estado <> 'cancelada' and sillon_id is not null);

-- Defensa adicional: si una cita/pago SÍ tiene sucursal, esa sucursal
-- debe ser de la MISMA clínica que el paciente — nunca cruzar clínicas
-- aunque alguien manipule el sucursal_id directamente.
create or replace function fn_validar_sucursal_misma_clinica()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinica_sucursal uuid;
  v_clinica_paciente uuid;
begin
  if new.sucursal_id is null then
    return new;
  end if;
  select clinica_id into v_clinica_sucursal from sucursales where id = new.sucursal_id;
  select clinica_id into v_clinica_paciente from pacientes where id = new.paciente_id;
  if v_clinica_sucursal is distinct from v_clinica_paciente then
    raise exception 'La sucursal debe pertenecer a la misma clínica del paciente.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validar_sucursal_citas on citas;
create trigger trg_validar_sucursal_citas
before insert or update on citas
for each row execute function fn_validar_sucursal_misma_clinica();

drop trigger if exists trg_validar_sucursal_pagos on pagos;
create trigger trg_validar_sucursal_pagos
before insert or update on pagos
for each row execute function fn_validar_sucursal_misma_clinica();

-- ---------- 6. Políticas de citas/pagos — se agrega auth_sucursal_permitida ----------
-- Todo lo demás de cada política queda EXACTAMENTE igual a como
-- estaba (038/041) — solo se agrega el chequeo de sucursal, que es un
-- no-op para cualquier fila con sucursal_id = NULL.
drop policy if exists citas_select on citas;
create policy citas_select on citas
  for select using (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
    and (auth_rol() in ('owner', 'recepcion') or auth_paciente_asignado(paciente_id))
    and auth_sucursal_permitida(sucursal_id)
  );

drop policy if exists citas_update_dentista on citas;
create policy citas_update_dentista on citas
  for update using (
    auth_rol() = 'dentista'
    and auth_paciente_asignado(paciente_id)
    and auth_sucursal_permitida(sucursal_id)
  );

drop policy if exists citas_write on citas;
create policy citas_write on citas
  for all using (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
    and auth_rol() in ('owner','recepcion')
    and auth_sucursal_permitida(sucursal_id)
  );

drop policy if exists pagos_select on pagos;
create policy pagos_select on pagos
  for select using (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
    and auth_rol() in ('owner', 'recepcion')
    and auth_sucursal_permitida(sucursal_id)
  );

drop policy if exists pagos_write on pagos;
create policy pagos_write on pagos
  for insert with check (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
    and auth_rol() in ('owner','recepcion')
    and auth_sucursal_permitida(sucursal_id)
  );
