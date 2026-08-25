-- ============================================================
-- SIRO — Permisos por asignación de paciente
-- Migración 038
-- ------------------------------------------------------------
-- HALLAZGO DE LA AUDITORÍA (antes de este cambio): ninguna política
-- RLS de las tablas clínicas distinguía "¿es MI paciente?" — todas
-- solo verificaban "¿es de MI clínica?". Un odontólogo veía citas,
-- pagos, tratamientos y notas de pacientes que no eran suyos. Esta
-- migración agrega el concepto de "odontólogo responsable" que no
-- existía, y lo usa para restringir acceso clínico real, no solo
-- ocultar botones en el frontend.
-- ============================================================

-- ---------- 1. Odontólogo responsable del paciente ----------
alter table pacientes add column if not exists dentista_responsable_id uuid references usuarios(id) on delete set null;
create index if not exists idx_pacientes_dentista_responsable on pacientes(dentista_responsable_id);

-- Backfill de pacientes existentes: se asignan a quien los creó,
-- SOLO si esa persona es dentista (decisión confirmada). Los creados
-- por owner/recepción/asistente quedan sin asignar — el owner los
-- asigna manualmente después.
update pacientes p
set dentista_responsable_id = p.creado_por
where p.dentista_responsable_id is null
  and p.creado_por is not null
  and exists (select 1 from usuarios u where u.id = p.creado_por and u.rol = 'dentista');

-- De aquí en adelante, un paciente nuevo creado por un dentista se
-- autoasigna a sí mismo — mismo criterio que el backfill, aplicado
-- hacia adelante. Si lo crea owner/recepción/asistente, queda sin
-- asignar (NULL) salvo que se especifique explícitamente.
create or replace function fn_autoasignar_dentista_responsable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.dentista_responsable_id is null and auth_rol() = 'dentista' then
    new.dentista_responsable_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_autoasignar_dentista_responsable on pacientes;
create trigger trg_autoasignar_dentista_responsable
before insert on pacientes
for each row execute function fn_autoasignar_dentista_responsable();

-- ---------- 2. Asignación asistente → odontólogo(s) ----------
-- Un asistente puede apoyar a uno o más odontólogos (confirmado: "el/
-- los odontólogo(s) que tenga asignado") — tabla puente, no una
-- columna única, para no limitarlo a uno solo.
create table if not exists asistente_dentista_asignaciones (
  id uuid primary key default gen_random_uuid(),
  asistente_id uuid not null references usuarios(id) on delete cascade,
  dentista_id uuid not null references usuarios(id) on delete cascade,
  clinica_id uuid not null references clinicas(id) on delete cascade,
  creado_en timestamptz default now(),
  unique(asistente_id, dentista_id)
);

create index if not exists idx_asignaciones_asistente on asistente_dentista_asignaciones(asistente_id);
create index if not exists idx_asignaciones_dentista on asistente_dentista_asignaciones(dentista_id);

alter table asistente_dentista_asignaciones enable row level security;

-- Solo el owner de la clínica administra estas asignaciones.
drop policy if exists asignaciones_select on asistente_dentista_asignaciones;
create policy asignaciones_select on asistente_dentista_asignaciones
  for select using (clinica_id = auth_clinica_id());

drop policy if exists asignaciones_write on asistente_dentista_asignaciones;
create policy asignaciones_write on asistente_dentista_asignaciones
  for all using (auth_rol() = 'owner' and clinica_id = auth_clinica_id())
  with check (
    auth_rol() = 'owner' and clinica_id = auth_clinica_id()
    -- Nunca permitir vincular a un usuario de otra clínica, aunque el
    -- owner intente forzar el UUID a mano.
    and exists (select 1 from usuarios u where u.id = asistente_id and u.clinica_id = auth_clinica_id() and u.rol = 'asistente')
    and exists (select 1 from usuarios u where u.id = dentista_id and u.clinica_id = auth_clinica_id() and u.rol = 'dentista')
  );

-- ---------- 3. Función central: ¿puedo ver clínicamente a este paciente? ----------
-- Única fuente de verdad para "acceso clínico" — se reutiliza en
-- pacientes, notas_clinicas, tratamientos, recetas, documentos
-- clínicos, odontograma y periodontograma, en vez de repetir la
-- misma lógica compleja en cada política por separado.
create or replace function auth_paciente_asignado(p_paciente_id uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from pacientes p
    where p.id = p_paciente_id
      and p.clinica_id = auth_clinica_id()
      and (
        auth_rol() = 'owner'
        or (auth_rol() = 'dentista' and p.dentista_responsable_id = auth.uid())
        or (
          auth_rol() = 'asistente'
          and p.dentista_responsable_id is not null
          and exists (
            select 1 from asistente_dentista_asignaciones a
            where a.asistente_id = auth.uid() and a.dentista_id = p.dentista_responsable_id
          )
        )
      )
  );
$$;

-- ---------- 4. pacientes_select — filtro de FILA, no solo de columna ----------
-- CORRECCIÓN IMPORTANTE encontrada en revisión propia: hasta este
-- punto de la migración, la columna sensible ya estaba protegida en
-- v_pacientes_seguro, pero la política de FILA (pacientes_select)
-- seguía siendo "toda la clínica" para todos los roles — un dentista
-- seguiría viendo nombre/teléfono de pacientes que no son suyos, sin
-- notas clínicas pero viendo que existen. Owner y recepción SÍ deben
-- ver toda la clínica (recepción necesita buscar/agendar a cualquiera);
-- dentista/asistente, solo sus pacientes asignados — la fila completa,
-- no solo columnas sensibles.
drop policy if exists pacientes_select on pacientes;
create policy pacientes_select on pacientes
  for select using (
    clinica_id = auth_clinica_id()
    and (auth_rol() in ('owner', 'recepcion') or auth_paciente_asignado(id))
  );

-- ---------- 5. v_pacientes_seguro — actualizada ----------
-- Estaba desactualizada: solo tenía las columnas de 2019 (migración
-- 007). Las columnas sensibles agregadas después (CURP, tutor legal,
-- domicilio completo, estado civil, etc.) nunca se agregaron aquí —
-- lo que probablemente ya causaba que TabDatosGenerales.jsx no
-- pudiera leerlas al abrir un expediente (usa esta vista, no
-- `pacientes` directo). Se agregan ahora, con la misma restricción:
-- solo visibles para quien tiene acceso clínico real a ESE paciente
-- (auth_paciente_asignado), no cualquiera de la clínica.
drop view if exists v_pacientes_seguro;
create view v_pacientes_seguro
with (security_invoker = true) as
select
  id, clinica_id, nombre_completo, fecha_nacimiento, telefono, correo,
  direccion, creado_en, creado_por, archivado_en, numero_expediente,
  dentista_responsable_id,
  case when auth_paciente_asignado(id) then contacto_emergencia end as contacto_emergencia,
  case when auth_paciente_asignado(id) then seguro_medico end as seguro_medico,
  case when auth_paciente_asignado(id) then notas_generales end as notas_generales,
  case when auth_paciente_asignado(id) then curp end as curp,
  case when auth_paciente_asignado(id) then sexo end as sexo,
  case when auth_paciente_asignado(id) then primer_apellido end as primer_apellido,
  case when auth_paciente_asignado(id) then segundo_apellido end as segundo_apellido,
  case when auth_paciente_asignado(id) then tutor_legal end as tutor_legal,
  case when auth_paciente_asignado(id) then estado_civil end as estado_civil,
  case when auth_paciente_asignado(id) then ocupacion end as ocupacion,
  case when auth_paciente_asignado(id) then escolaridad end as escolaridad,
  case when auth_paciente_asignado(id) then nacionalidad end as nacionalidad,
  case when auth_paciente_asignado(id) then telefono_secundario end as telefono_secundario,
  case when auth_paciente_asignado(id) then whatsapp end as whatsapp,
  case when auth_paciente_asignado(id) then calle end as calle,
  case when auth_paciente_asignado(id) then numero_exterior end as numero_exterior,
  case when auth_paciente_asignado(id) then numero_interior end as numero_interior,
  case when auth_paciente_asignado(id) then colonia end as colonia,
  case when auth_paciente_asignado(id) then municipio end as municipio,
  case when auth_paciente_asignado(id) then estado_domicilio end as estado_domicilio,
  case when auth_paciente_asignado(id) then codigo_postal end as codigo_postal,
  case when auth_paciente_asignado(id) then tipo_paciente end as tipo_paciente,
  estado_expediente,
  case when auth_paciente_asignado(id) then referido_por end as referido_por
from pacientes;

-- ---------- 5. Vista limitada de tratamientos para recepción ----------
-- Decisión confirmada: recepción ve costo/estado para poder cobrar,
-- NUNCA la descripción clínica (puede contener diagnóstico).
create or replace view v_tratamientos_recepcion
with (security_invoker = true) as
select id, paciente_id, estado, costo, dentista_id, creado_en, completado_en
from tratamientos;

-- ---------- 6. Políticas reescritas: acceso clínico por asignación ----------
-- notas_clinicas: antes cualquier dentista/asistente de la clínica
-- veía las notas de CUALQUIER paciente. Ahora solo si está asignado.
drop policy if exists notas_select on notas_clinicas;
create policy notas_select on notas_clinicas
  for select using (
    exists (select 1 from expedientes e where e.id = expediente_id and auth_paciente_asignado(e.paciente_id))
  );

drop policy if exists notas_insert on notas_clinicas;
create policy notas_insert on notas_clinicas
  for insert with check (
    exists (select 1 from expedientes e where e.id = expediente_id and auth_paciente_asignado(e.paciente_id))
    and auth_rol() in ('owner', 'dentista')
  );

-- expedientes: mismo criterio.
drop policy if exists expedientes_select on expedientes;
create policy expedientes_select on expedientes
  for select using (auth_paciente_asignado(paciente_id));

drop policy if exists expedientes_update on expedientes;
create policy expedientes_update on expedientes
  for update using (auth_paciente_asignado(paciente_id) and auth_rol() in ('owner', 'dentista'));

-- tratamientos: la tabla completa (con descripción clínica) solo para
-- quien tiene acceso clínico al paciente. Recepción deja de tener
-- select aquí — usa v_tratamientos_recepcion.
drop policy if exists tratamientos_select on tratamientos;
create policy tratamientos_select on tratamientos
  for select using (auth_paciente_asignado(paciente_id));

drop policy if exists tratamientos_write on tratamientos;
create policy tratamientos_write on tratamientos
  for all using (auth_paciente_asignado(paciente_id) and auth_rol() in ('owner', 'dentista'));

-- recetas: se agrega el filtro de asignación (ya excluía asistente/recepción, eso no cambia).
drop policy if exists recetas_select on recetas;
create policy recetas_select on recetas
  for select using (auth_paciente_asignado(paciente_id) and auth_rol() in ('owner', 'dentista'));

drop policy if exists recetas_insert on recetas;
create policy recetas_insert on recetas
  for insert with check (auth_paciente_asignado(paciente_id) and auth_rol() in ('owner', 'dentista'));

-- documentos_clinicos: mismo criterio.
drop policy if exists documentos_clinicos_select on documentos_clinicos;
create policy documentos_clinicos_select on documentos_clinicos
  for select using (auth_paciente_asignado(paciente_id) and auth_rol() in ('owner', 'dentista'));

drop policy if exists documentos_clinicos_insert on documentos_clinicos;
create policy documentos_clinicos_insert on documentos_clinicos
  for insert with check (auth_paciente_asignado(paciente_id) and auth_rol() in ('owner', 'dentista'));

-- odontograma_piezas: se agrega el filtro de asignación.
drop policy if exists odontograma_select on odontograma_piezas;
create policy odontograma_select on odontograma_piezas
  for select using (auth_paciente_asignado(paciente_id) and auth_rol() in ('owner', 'dentista'));

drop policy if exists odontograma_update on odontograma_piezas;
create policy odontograma_update on odontograma_piezas
  for update using (auth_paciente_asignado(paciente_id) and auth_rol() in ('owner', 'dentista'));

-- odontograma_caras: mismo criterio.
drop policy if exists odontograma_caras_select on odontograma_caras;
create policy odontograma_caras_select on odontograma_caras
  for select using (
    exists (select 1 from odontograma_piezas op where op.id = pieza_id and auth_paciente_asignado(op.paciente_id))
    and auth_rol() in ('owner', 'dentista')
  );

drop policy if exists odontograma_caras_update on odontograma_caras;
create policy odontograma_caras_update on odontograma_caras
  for update using (
    exists (select 1 from odontograma_piezas op where op.id = pieza_id and auth_paciente_asignado(op.paciente_id))
    and auth_rol() in ('owner', 'dentista')
  );

-- periodontograma_piezas / periodontograma_sitios: mismo criterio.
drop policy if exists periodontograma_piezas_select on periodontograma_piezas;
create policy periodontograma_piezas_select on periodontograma_piezas
  for select using (auth_paciente_asignado(paciente_id) and auth_rol() in ('owner', 'dentista'));

drop policy if exists periodontograma_piezas_write on periodontograma_piezas;
create policy periodontograma_piezas_write on periodontograma_piezas
  for all using (auth_paciente_asignado(paciente_id) and auth_rol() in ('owner', 'dentista'));

drop policy if exists periodontograma_sitios_select on periodontograma_sitios;
create policy periodontograma_sitios_select on periodontograma_sitios
  for select using (
    exists (select 1 from periodontograma_piezas pp where pp.id = pieza_id and auth_paciente_asignado(pp.paciente_id))
    and auth_rol() in ('owner', 'dentista')
  );

drop policy if exists periodontograma_sitios_write on periodontograma_sitios;
create policy periodontograma_sitios_write on periodontograma_sitios
  for all using (
    exists (select 1 from periodontograma_piezas pp where pp.id = pieza_id and auth_paciente_asignado(pp.paciente_id))
    and auth_rol() in ('owner', 'dentista')
  );

-- citas: owner y recepción administran TODA la agenda de la clínica
-- (correcto, no cambia). Dentista/asistente solo ven/actualizan las
-- citas del odontólogo correspondiente — antes veían la agenda
-- completa de la clínica sin distinción.
drop policy if exists citas_select on citas;
create policy citas_select on citas
  for select using (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
    and (
      auth_rol() in ('owner', 'recepcion')
      or (auth_rol() = 'dentista' and dentista_id = auth.uid())
      or (auth_rol() = 'asistente' and exists (
            select 1 from asistente_dentista_asignaciones a
            where a.asistente_id = auth.uid() and a.dentista_id = citas.dentista_id
          ))
    )
  );

-- pagos: decisión confirmada — información financiera, fuera del
-- alcance de dentista/asistente por completo (antes cualquier rol de
-- la clínica podía leer pagos de cualquier paciente).
drop policy if exists pagos_select on pagos;
create policy pagos_select on pagos
  for select using (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
    and auth_rol() in ('owner', 'recepcion')
  );

-- ---------- 7. Reasignación de paciente — solo owner, solo dentro de la clínica ----------
-- pacientes_update (sin cambios, existente) permite a cualquier rol de
-- la clínica actualizar la fila — necesario para que recepción edite
-- datos administrativos. Pero reasignar el odontólogo responsable es
-- una acción distinta y más sensible: solo el owner puede hacerla, y
-- nunca hacia un usuario de otra clínica (ítem 5 y 6 del pedido).
create or replace function fn_validar_reasignacion_paciente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.dentista_responsable_id is distinct from old.dentista_responsable_id then
    if auth_rol() <> 'owner' then
      raise exception 'Solo el owner de la clínica puede reasignar el odontólogo responsable de un paciente.';
    end if;
    if new.dentista_responsable_id is not null and not exists (
      select 1 from usuarios u
      where u.id = new.dentista_responsable_id
        and u.rol = 'dentista'
        and u.clinica_id = new.clinica_id
    ) then
      raise exception 'El odontólogo responsable debe ser un dentista de la misma clínica del paciente.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validar_reasignacion_paciente on pacientes;
create trigger trg_validar_reasignacion_paciente
before update on pacientes
for each row execute function fn_validar_reasignacion_paciente();

-- odontograma_historial / periodontograma_historial: mismo criterio.
drop policy if exists odontograma_historial_select on odontograma_historial;
create policy odontograma_historial_select on odontograma_historial
  for select using (
    exists (select 1 from odontograma_piezas op where op.id = pieza_id and auth_paciente_asignado(op.paciente_id))
    and auth_rol() in ('owner', 'dentista')
  );

drop policy if exists periodontograma_historial_select on periodontograma_historial;
create policy periodontograma_historial_select on periodontograma_historial
  for select using (
    exists (select 1 from periodontograma_piezas pp where pp.id = pieza_id and auth_paciente_asignado(pp.paciente_id))
    and auth_rol() in ('owner', 'dentista')
  );
