-- ============================================================
-- SIRO — Auditoría final de seguridad (ronda posterior a 038/039)
-- Migración 040
-- ------------------------------------------------------------
-- Tres hallazgos, los tres verificados por lectura cuidadosa del SQL
-- existente, no por ejecución real (sin Postgres disponible en este
-- entorno):
--
-- 1) v_tratamientos_recepcion NUNCA funcionó para recepción.
--    security_invoker=true hace que Postgres aplique el RLS de
--    `tratamientos` (la tabla real) con el rol de quien consulta.
--    tratamientos_select es auth_paciente_asignado(paciente_id), que
--    NO tiene ninguna rama para 'recepcion' — así que recepción
--    consultando la vista recibía 0 filas, siempre. Se corrige usando
--    el patrón CLÁSICO de vista (sin security_invoker=true — el
--    default es false), con su propia lógica de seguridad embebida,
--    completamente desacoplada de tratamientos_select. Así la vista
--    es su propio perímetro de seguridad, tal como se pidió
--    explícitamente ("vista/función controlada").
--
-- 2) archivado_en: v_pacientes_seguro selecciona esta columna desde
--    la migración 007 (¡y sigue en la 038!) pero NUNCA se declaró con
--    ningún ALTER TABLE. Si esta migración se hubiera ejecutado
--    alguna vez contra Postgres real, habría fallado con "column
--    archivado_en does not exist" — bloqueando el CREATE VIEW y, por
--    lo tanto, deteniendo todo el pipeline de migraciones en ese
--    punto. El frontend (archivarPaciente/restaurarPaciente en
--    services/pacientes.js) ya asume que esta columna existe. Se
--    agrega ahora.
--
-- 3) UPDATE de pacientes por columna: RLS de Postgres es por FILA, no
--    por COLUMNA — no puede, por sí sola, impedir que recepción
--    modifique notas_generales aunque sí pueda modificar teléfono.
--    GRANT UPDATE (columna) tampoco sirve aquí: Supabase usa un solo
--    rol de Postgres ("authenticated") para todos los usuarios finales,
--    así que un GRANT no puede distinguir "recepción" de "dentista".
--    La única herramienta segura es un trigger — con LISTA BLANCA
--    (no lista negra): así, cualquier columna que se agregue en el
--    futuro queda protegida por defecto hasta que alguien la agregue
--    explícitamente a la lista de columnas administrativas.
-- ============================================================

-- ---------- Hallazgo 2: columna faltante ----------
alter table pacientes add column if not exists archivado_en timestamptz;

-- ---------- Hallazgo 1: v_tratamientos_recepcion reescrita ----------
-- SIN security_invoker=true (el default, false, hace que la vista
-- corra con los privilegios de quien la creó — normalmente un rol de
-- migración con más permisos que "authenticated" — así que el RLS de
-- `tratamientos` NO se vuelve a evaluar aquí). La seguridad la impone
-- el WHERE de la propia vista, no la tabla subyacente.
drop view if exists v_tratamientos_recepcion;
create view v_tratamientos_recepcion as
select t.id, t.paciente_id, t.estado, t.costo, t.dentista_id, t.creado_en, t.completado_en
from tratamientos t
join pacientes p on p.id = t.paciente_id
where p.clinica_id = auth_clinica_id()
  and auth_rol() in ('owner', 'recepcion');

-- Nota deliberada: esta vista NO expone `descripcion` en absoluto —
-- ni siquiera como columna enmascarada (NULL) — para que ni
-- inspeccionando el resultado se sepa que ese campo existe.
-- dentista/asistente NO usan esta vista — siguen usando la tabla
-- `tratamientos` directa, protegida por tratamientos_select
-- (auth_paciente_asignado), que ya funcionaba correctamente para
-- ellos.

-- ---------- Hallazgo 3: restricción de columnas en pacientes UPDATE ----------
-- Lista blanca de columnas "administrativas" — lo único que
-- recepción/asistente pueden tocar. Todo lo demás (clínico, sensible,
-- o cualquier columna que se agregue después y no esté aquí) queda
-- bloqueado por defecto para esos dos roles.
create or replace function fn_restringir_columnas_pacientes_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_columnas_administrativas text[] := array[
    'nombre_completo', 'primer_apellido', 'segundo_apellido',
    'fecha_nacimiento', 'sexo',
    'telefono', 'telefono_secundario', 'whatsapp', 'correo',
    'direccion', 'calle', 'numero_exterior', 'numero_interior',
    'colonia', 'municipio', 'estado_domicilio', 'codigo_postal',
    'nacionalidad', 'referido_por', 'archivado_en'
  ];
  v_old_reducido jsonb;
  v_new_reducido jsonb;
  v_clave text;
begin
  -- owner: sin restricción — puede modificar cualquier columna dentro
  -- de su clínica (ya lo garantiza pacientes_update a nivel de fila).
  --
  -- dentista: RLS (pacientes_update) YA exige auth_paciente_asignado()
  -- para llegar hasta aquí — solo puede tocar la fila de SUS
  -- pacientes. Dentro de esa fila, puede modificar cualquier columna,
  -- clínica o administrativa: es quien atiende al paciente y necesita
  -- poder corregir cualquier dato suyo.
  if auth_rol() in ('owner', 'dentista') then
    return new;
  end if;

  -- recepción y asistente: cualquier columna FUERA de la lista blanca
  -- debe llegar IDÉNTICA — si algo cambió ahí (incluido
  -- dentista_responsable_id, que además ya tiene su propio trigger
  -- exclusivo de owner), se rechaza toda la actualización.
  v_old_reducido := to_jsonb(old);
  v_new_reducido := to_jsonb(new);
  foreach v_clave in array v_columnas_administrativas loop
    v_old_reducido := v_old_reducido - v_clave;
    v_new_reducido := v_new_reducido - v_clave;
  end loop;

  if v_old_reducido is distinct from v_new_reducido then
    raise exception 'El rol % solo puede modificar datos administrativos del paciente (nombre, contacto, domicilio) — no información clínica.', auth_rol();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_restringir_columnas_pacientes_update on pacientes;
create trigger trg_restringir_columnas_pacientes_update
before update on pacientes
for each row execute function fn_restringir_columnas_pacientes_update();
