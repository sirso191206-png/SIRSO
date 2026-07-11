-- ============================================================
-- FASE 1 — Sistema de Gestión Odontológica
-- Migración inicial para Supabase
-- ============================================================

create extension if not exists "pgcrypto";
create extension if not exists "btree_gist"; -- necesario para EXCLUDE en citas

-- ============================================================
-- 1. CLÍNICAS
-- ============================================================
-- No estaba explícita en el doc de Fase 1 pero todo referencia clinica_id,
-- así que es la raíz multi-tenant desde el día uno.
create table clinicas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  creado_en timestamptz default now()
);

-- ============================================================
-- 2. USUARIOS
-- ============================================================
-- En Supabase NO se guarda password_hash: eso lo maneja auth.users.
-- Esta tabla es un "perfil" 1:1 con auth.users, usando el mismo id.
create table usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  clinica_id uuid not null references clinicas(id),
  nombre text not null,
  correo text unique not null,
  rol text not null check (rol in ('owner','dentista','recepcion','asistente')),
  activo boolean default true,
  creado_en timestamptz default now(),
  ultimo_acceso timestamptz
);

-- Helper: clinica del usuario autenticado actual (se usa en todas las policies)
create or replace function auth_clinica_id()
returns uuid
language sql stable
security definer
set search_path = public
as $$
  select clinica_id from usuarios where id = auth.uid()
$$;

create or replace function auth_rol()
returns text
language sql stable
security definer
set search_path = public
as $$
  select rol from usuarios where id = auth.uid()
$$;

-- ============================================================
-- 3. AUDITORÍA
-- ============================================================
create table auditoria (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references usuarios(id),
  accion text not null,
  entidad text not null,
  entidad_id uuid,
  detalle jsonb,
  creado_en timestamptz default now()
);

-- Trigger genérico reutilizable: se ata a cualquier tabla clínica sensible
create or replace function fn_auditoria()
returns trigger
language plpgsql
security definer
as $$
declare
  v_accion text;
begin
  if (tg_op = 'INSERT') then v_accion := 'crear_' || tg_table_name;
  elsif (tg_op = 'UPDATE') then v_accion := 'editar_' || tg_table_name;
  elsif (tg_op = 'DELETE') then v_accion := 'eliminar_' || tg_table_name;
  end if;

  insert into auditoria (usuario_id, accion, entidad, entidad_id, detalle)
  values (
    auth.uid(),
    v_accion,
    tg_table_name,
    coalesce(new.id, old.id),
    case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end
  );

  return coalesce(new, old);
end;
$$;

-- ============================================================
-- 4. PACIENTES
-- ============================================================
create table pacientes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id),
  nombre_completo text not null,
  fecha_nacimiento date,
  telefono text,
  correo text,
  direccion text,
  contacto_emergencia jsonb,
  seguro_medico jsonb,
  notas_generales text,
  creado_en timestamptz default now(),
  creado_por uuid references usuarios(id)
);

create index idx_pacientes_clinica on pacientes(clinica_id);
create index idx_pacientes_busqueda on pacientes using gin (
  to_tsvector('spanish', coalesce(nombre_completo,'') || ' ' || coalesce(telefono,''))
);

-- clinica_id y creado_por se rellenan solos con los datos del usuario que
-- inserta; el frontend no necesita conocer el id de su propia clínica.
create or replace function fn_set_clinica_pacientes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.clinica_id is null then
    new.clinica_id := auth_clinica_id();
  end if;
  if new.creado_por is null then
    new.creado_por := auth.uid();
  end if;
  return new;
end;
$$;

create trigger trg_set_clinica_pacientes
before insert on pacientes
for each row execute function fn_set_clinica_pacientes();

create trigger trg_auditoria_pacientes
after insert or update or delete on pacientes
for each row execute function fn_auditoria();

-- Vista de solo lectura para el frontend: recepción no ve contacto de
-- emergencia, seguro médico ni notas generales del paciente — solo lo
-- necesario para agendar/cobrar. owner, dentista y asistente ven todo.
create view v_pacientes_seguro
with (security_invoker = true) as
select
  id,
  clinica_id,
  nombre_completo,
  fecha_nacimiento,
  telefono,
  correo,
  direccion,
  creado_en,
  creado_por,
  case when auth_rol() in ('owner', 'dentista', 'asistente')
    then contacto_emergencia end as contacto_emergencia,
  case when auth_rol() in ('owner', 'dentista', 'asistente')
    then seguro_medico end as seguro_medico,
  case when auth_rol() in ('owner', 'dentista', 'asistente')
    then notas_generales end as notas_generales
from pacientes;

grant select on v_pacientes_seguro to authenticated;

-- ============================================================
-- 5. EXPEDIENTE CLÍNICO
-- ============================================================
create table expedientes (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null unique references pacientes(id) on delete cascade,
  alergias jsonb default '[]',
  enfermedades jsonb default '[]',
  medicamentos_actuales jsonb default '[]',
  antecedentes_familiares text,
  actualizado_en timestamptz default now()
);

create table notas_clinicas (
  id uuid primary key default gen_random_uuid(),
  expediente_id uuid not null references expedientes(id) on delete cascade,
  usuario_id uuid not null references usuarios(id),
  contenido text not null,
  tipo text check (tipo in ('consulta','llamada','observacion')),
  creado_en timestamptz default now(),
  editado boolean default false,
  version_anterior_id uuid references notas_clinicas(id)
);

create trigger trg_auditoria_expedientes
after insert or update on expedientes
for each row execute function fn_auditoria();

create policy expedientes_insert on expedientes
  for insert with check (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
  );

-- El expediente vacío se crea solo cuando nace el paciente; el frontend
-- nunca lo inserta directamente.
create or replace function fn_crear_expediente_paciente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into expedientes (paciente_id) values (new.id);
  return new;
end;
$$;

create trigger trg_crear_expediente_paciente
after insert on pacientes
for each row execute function fn_crear_expediente_paciente();

create trigger trg_auditoria_notas
after insert on notas_clinicas
for each row execute function fn_auditoria();

-- Append-only real: nadie puede editar ni borrar una nota ya creada.
-- Las "ediciones" se hacen vía version_anterior_id (nueva fila); el flag
-- `editado` de la nota anterior lo pone este trigger, no el cliente.
revoke update, delete on notas_clinicas from authenticated;

create or replace function fn_marcar_nota_editada()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.version_anterior_id is not null then
    update notas_clinicas set editado = true where id = new.version_anterior_id;
  end if;
  return new;
end;
$$;

create trigger trg_marcar_nota_editada
after insert on notas_clinicas
for each row execute function fn_marcar_nota_editada();

-- ============================================================
-- 6. FOTOGRAFÍAS
-- ============================================================
create table fotografias (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  tratamiento_id uuid, -- FK se agrega tras crear tabla tratamientos (ver abajo)
  url_storage text not null, -- path dentro del bucket de Supabase Storage
  fecha_captura timestamptz default now(),
  etiqueta text check (etiqueta in ('intraoral','extraoral','antes','despues')),
  subido_por uuid references usuarios(id)
);

-- ============================================================
-- 7. TRATAMIENTOS
-- ============================================================
create table tratamientos (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  descripcion text not null,
  pieza_dental text,
  estado text check (estado in ('planeado','en_progreso','completado','cancelado')) default 'planeado',
  costo numeric(10,2) not null,
  dentista_id uuid references usuarios(id),
  creado_en timestamptz default now(),
  completado_en timestamptz
);

alter table fotografias
  add constraint fk_fotografias_tratamiento
  foreign key (tratamiento_id) references tratamientos(id);

create trigger trg_auditoria_tratamientos
after insert or update or delete on tratamientos
for each row execute function fn_auditoria();

-- ============================================================
-- 8. PAGOS
-- ============================================================
create table pagos (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  tratamiento_id uuid references tratamientos(id),
  monto numeric(10,2) not null check (monto > 0),
  metodo text check (metodo in ('efectivo','tarjeta','transferencia','otro')),
  tipo text check (tipo in ('anticipo','pago','reembolso')),
  registrado_por uuid references usuarios(id),
  creado_en timestamptz default now()
);

create trigger trg_auditoria_pagos
after insert or update or delete on pagos
for each row execute function fn_auditoria();

-- Saldo calculado, no cacheado (view en vez de columna)
create view v_saldo_pacientes as
select
  p.id as paciente_id,
  coalesce(sum(t.costo) filter (where t.estado <> 'cancelado'), 0) as total_tratamientos,
  coalesce((select sum(monto) from pagos pg where pg.paciente_id = p.id and pg.tipo <> 'reembolso'), 0)
    - coalesce((select sum(monto) from pagos pg where pg.paciente_id = p.id and pg.tipo = 'reembolso'), 0)
    as total_pagado,
  coalesce(sum(t.costo) filter (where t.estado <> 'cancelado'), 0)
    - (
        coalesce((select sum(monto) from pagos pg where pg.paciente_id = p.id and pg.tipo <> 'reembolso'), 0)
        - coalesce((select sum(monto) from pagos pg where pg.paciente_id = p.id and pg.tipo = 'reembolso'), 0)
      ) as saldo
from pacientes p
left join tratamientos t on t.paciente_id = p.id
group by p.id;

-- ============================================================
-- 9. AGENDA / CITAS
-- ============================================================
create table citas (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  dentista_id uuid not null references usuarios(id),
  inicio timestamptz not null,
  fin timestamptz not null,
  estado text check (estado in ('agendada','confirmada','completada','cancelada','no_asistio')) default 'agendada',
  notas text,
  creado_en timestamptz default now(),
  constraint chk_horario check (fin > inicio),
  -- Impide traslapes de horario para el mismo dentista a nivel de BD
  exclude using gist (
    dentista_id with =,
    tstzrange(inicio, fin) with &&
  ) where (estado not in ('cancelada'))
);

create trigger trg_auditoria_citas
after insert or update or delete on citas
for each row execute function fn_auditoria();

-- ============================================================
-- 10. ROW LEVEL SECURITY
-- ============================================================
alter table usuarios enable row level security;
alter table pacientes enable row level security;
alter table expedientes enable row level security;
alter table notas_clinicas enable row level security;
alter table fotografias enable row level security;
alter table tratamientos enable row level security;
alter table pagos enable row level security;
alter table citas enable row level security;
alter table auditoria enable row level security;

-- Usuarios: cada quien ve solo su propia clínica
create policy usuarios_select on usuarios
  for select using (clinica_id = auth_clinica_id());
create policy usuarios_insert_owner on usuarios
  for insert with check (auth_rol() = 'owner' and clinica_id = auth_clinica_id());
create policy usuarios_update_owner on usuarios
  for update using (auth_rol() = 'owner' and clinica_id = auth_clinica_id());

-- Pacientes: toda la clínica puede ver/crear; recepción y asistente también
create policy pacientes_select on pacientes
  for select using (clinica_id = auth_clinica_id());
create policy pacientes_insert on pacientes
  for insert with check (clinica_id = auth_clinica_id());
create policy pacientes_update on pacientes
  for update using (clinica_id = auth_clinica_id());

-- Expedientes y notas clínicas: dentista y asistente sí, recepción NO
create policy expedientes_select on expedientes
  for select using (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
    and auth_rol() in ('owner','dentista','asistente')
  );
create policy expedientes_update on expedientes
  for update using (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
    and auth_rol() in ('owner','dentista')
  );

create policy notas_select on notas_clinicas
  for select using (
    exists (
      select 1 from expedientes e join pacientes p on p.id = e.paciente_id
      where e.id = expediente_id and p.clinica_id = auth_clinica_id()
    )
    and auth_rol() in ('owner','dentista','asistente')
  );
create policy notas_insert on notas_clinicas
  for insert with check (
    exists (
      select 1 from expedientes e join pacientes p on p.id = e.paciente_id
      where e.id = expediente_id and p.clinica_id = auth_clinica_id()
    )
    and auth_rol() in ('owner','dentista')
  );

-- Fotografías: mismo criterio que expediente
create policy fotos_select on fotografias
  for select using (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
  );
create policy fotos_insert on fotografias
  for insert with check (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
    and auth_rol() in ('owner','dentista','asistente')
  );

-- Tratamientos: visibles para todos en la clínica, editables por dentista/owner
create policy tratamientos_select on tratamientos
  for select using (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
  );
create policy tratamientos_write on tratamientos
  for all using (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
    and auth_rol() in ('owner','dentista')
  );

-- Pagos: recepción y owner
create policy pagos_select on pagos
  for select using (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
  );
create policy pagos_write on pagos
  for insert with check (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
    and auth_rol() in ('owner','recepcion')
  );

-- Citas: recepción y owner administran, dentista ve las suyas
create policy citas_select on citas
  for select using (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
  );
create policy citas_write on citas
  for all using (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
    and auth_rol() in ('owner','recepcion')
  );

-- Auditoría: solo lectura, solo owner
create policy auditoria_select on auditoria
  for select using (auth_rol() = 'owner');

-- ============================================================
-- 11. STORAGE (fotografías clínicas)
-- ============================================================
-- Ejecutar aparte o vía dashboard: bucket privado, acceso solo por URL firmada.
insert into storage.buckets (id, name, public)
values ('fotos-clinicas', 'fotos-clinicas', false)
on conflict (id) do nothing;

create policy storage_fotos_select on storage.objects
  for select using (
    bucket_id = 'fotos-clinicas'
    and auth.role() = 'authenticated'
  );
create policy storage_fotos_insert on storage.objects
  for insert with check (
    bucket_id = 'fotos-clinicas'
    and auth.role() = 'authenticated'
  );

-- ============================================================
-- 12. AJUSTES POSTERIORES (borrado forzado de usuarios, super admin)
-- ============================================================

-- Un usuario se puede eliminar aunque tenga historial: las referencias se
-- quedan en null en vez de bloquear el borrado (el registro del PACIENTE
-- no se pierde, solo deja de decir qué usuario lo hizo).
alter table citas alter column dentista_id drop not null;
alter table citas drop constraint citas_dentista_id_fkey;
alter table citas add constraint citas_dentista_id_fkey
  foreign key (dentista_id) references usuarios(id) on delete set null;

alter table tratamientos drop constraint tratamientos_dentista_id_fkey;
alter table tratamientos add constraint tratamientos_dentista_id_fkey
  foreign key (dentista_id) references usuarios(id) on delete set null;

alter table pagos drop constraint pagos_registrado_por_fkey;
alter table pagos add constraint pagos_registrado_por_fkey
  foreign key (registrado_por) references usuarios(id) on delete set null;

alter table fotografias drop constraint fotografias_subido_por_fkey;
alter table fotografias add constraint fotografias_subido_por_fkey
  foreign key (subido_por) references usuarios(id) on delete set null;

alter table notas_clinicas alter column usuario_id drop not null;
alter table notas_clinicas drop constraint notas_clinicas_usuario_id_fkey;
alter table notas_clinicas add constraint notas_clinicas_usuario_id_fkey
  foreign key (usuario_id) references usuarios(id) on delete set null;

alter table pacientes drop constraint pacientes_creado_por_fkey;
alter table pacientes add constraint pacientes_creado_por_fkey
  foreign key (creado_por) references usuarios(id) on delete set null;

alter table auditoria drop constraint auditoria_usuario_id_fkey;
alter table auditoria add constraint auditoria_usuario_id_fkey
  foreign key (usuario_id) references usuarios(id) on delete set null;

-- Eliminar pacientes: solo el owner, en cascada (se lleva expediente,
-- notas, tratamientos, pagos, fotos y citas de ese paciente).
create policy pacientes_delete on pacientes
  for delete using (clinica_id = auth_clinica_id() and auth_rol() = 'owner');

-- Super admin: una sola persona en todo el sistema puede ver todas las
-- clínicas (vía las Edge Functions admin-listar-clinicas / admin-ver-clinica,
-- nunca directo por RLS). El resto de la app sigue aislada por clínica.
alter table usuarios add column es_super_admin boolean not null default false;

-- ============================================================
-- 13. ASISTENTE AL MISMO NIVEL QUE RECEPCIÓN PARA DATOS CLÍNICOS
-- ============================================================
-- Solo owner y dentista ven expediente, notas clínicas, fotografías y
-- campos sensibles del paciente (contacto de emergencia, seguro médico,
-- notas generales). Asistente y recepción quedan igual: solo lo
-- necesario para agendar y cobrar.

create or replace view v_pacientes_seguro
with (security_invoker = true) as
select
  id, clinica_id, nombre_completo, fecha_nacimiento, telefono, correo,
  direccion, creado_en, creado_por,
  case when auth_rol() in ('owner', 'dentista') then contacto_emergencia end as contacto_emergencia,
  case when auth_rol() in ('owner', 'dentista') then seguro_medico end as seguro_medico,
  case when auth_rol() in ('owner', 'dentista') then notas_generales end as notas_generales
from pacientes;

drop policy expedientes_select on expedientes;
create policy expedientes_select on expedientes
  for select using (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
    and auth_rol() in ('owner', 'dentista')
  );

drop policy notas_select on notas_clinicas;
create policy notas_select on notas_clinicas
  for select using (
    exists (
      select 1 from expedientes e join pacientes p on p.id = e.paciente_id
      where e.id = expediente_id and p.clinica_id = auth_clinica_id()
    )
    and auth_rol() in ('owner', 'dentista')
  );

drop policy fotos_select on fotografias;
create policy fotos_select on fotografias
  for select using (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
    and auth_rol() in ('owner', 'dentista')
  );

drop policy fotos_insert on fotografias;
create policy fotos_insert on fotografias
  for insert with check (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
    and auth_rol() in ('owner', 'dentista')
  );

-- ============================================================
-- 14. FIX DE SEGURIDAD: v_saldo_pacientes debe respetar RLS
-- ============================================================
alter view v_saldo_pacientes set (security_invoker = true);
