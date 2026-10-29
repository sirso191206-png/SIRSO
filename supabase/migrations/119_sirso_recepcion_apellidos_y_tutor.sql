-- ============================================================
-- SIRO — 119: recepción ve los apellidos, el sexo y el tutor de los pacientes, y puede registrar al tutor de un menor.
-- ------------------------------------------------------------
-- Hallazgos de la prueba con personas (29/10/2026):
--  * Recepción da de alta al paciente con primer y segundo apellido y sexo, pero después la vista v_pacientes_seguro se los
--    ocultaba (solo los veía quien tiene al paciente asignado). No podía buscar por apellido y el formulario de edición los
--    mostraba vacíos; además de confundir, al guardar los borraba (el frontend ya solo envía lo que cambió).
--  * La ficha de un menor sin tutor le pide a recepción registrarlo, pero el trigger fn_restringir_columnas_pacientes_update
--    no le permitía modificar tutor_legal.
-- Apellidos, sexo y tutor son datos de identificación y contacto, los mismos que recepción ya captura y ya puede MODIFICAR
-- (044/048). No se abre nada clínico: curp, contacto de emergencia, seguro, notas, domicilio desglosado, etc. siguen igual.
-- La vista se reproduce tal cual la 070 (mismo orden de columnas); solo cambian las 4 columnas indicadas.
-- También: precios del catálogo y costos de tratamientos no negativos.
-- Re-ejecutable. Rollback: supabase/rollback/siro_v3/rollback_119.sql.
-- ============================================================
begin;

create or replace view v_pacientes_seguro
with (security_invoker = true) as
select
  id, clinica_id, nombre_completo, fecha_nacimiento, telefono, correo,
  direccion, creado_en, creado_por, archivado_en, numero_expediente,
  dentista_responsable_id,
  case when auth_paciente_asignado(id) then contacto_emergencia end as contacto_emergencia,
  case when auth_paciente_asignado(id) then seguro_medico end as seguro_medico,
  case when auth_paciente_asignado(id) then notas_generales end as notas_generales,
  case when auth_paciente_asignado(id) then curp end as curp,
  case when auth_paciente_asignado(id) or auth_rol() = 'recepcion' then sexo end as sexo,
  case when auth_paciente_asignado(id) or auth_rol() = 'recepcion' then primer_apellido end as primer_apellido,
  case when auth_paciente_asignado(id) or auth_rol() = 'recepcion' then segundo_apellido end as segundo_apellido,
  case when auth_paciente_asignado(id) or auth_rol() = 'recepcion' then tutor_legal end as tutor_legal,
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
  case when auth_paciente_asignado(id) then referido_por end as referido_por,
  actualizado_en
from pacientes;

-- Igual que la 048, más tutor_legal para recepción.
create or replace function fn_restringir_columnas_pacientes_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_columnas_base text[] := array[
    'nombre_completo', 'primer_apellido', 'segundo_apellido',
    'fecha_nacimiento', 'sexo',
    'telefono', 'telefono_secundario', 'whatsapp', 'correo',
    'direccion', 'calle', 'numero_exterior', 'numero_interior',
    'colonia', 'municipio', 'estado_domicilio', 'codigo_postal',
    'nacionalidad', 'referido_por', 'archivado_en'
  ];
  v_columnas_permitidas text[];
  v_old_reducido jsonb;
  v_new_reducido jsonb;
  v_clave text;
begin
  if auth_rol() in ('owner', 'dentista') or auth_rol() is null then
    return new;
  end if;

  if auth_rol() = 'recepcion' then
    v_columnas_permitidas := v_columnas_base || array['curp', 'tipo_paciente', 'tutor_legal'];
  else
    v_columnas_permitidas := v_columnas_base;
  end if;

  v_old_reducido := to_jsonb(old);
  v_new_reducido := to_jsonb(new);
  foreach v_clave in array v_columnas_permitidas loop
    v_old_reducido := v_old_reducido - v_clave;
    v_new_reducido := v_new_reducido - v_clave;
  end loop;

  if v_old_reducido is distinct from v_new_reducido then
    raise exception 'El rol % solo puede modificar los datos administrativos permitidos — no información clínica ni estado_expediente.', auth_rol();
  end if;

  return new;
end;
$$;

-- Precios y costos nunca negativos (la prueba guardó «$-100.00» en el catálogo). NOT VALID: se exige a partir de ahora sin
-- revisar filas viejas (si hubiera alguna negativa, el alta de la migración no falla; se corrige a mano).
alter table catalogo_tratamientos drop constraint if exists catalogo_tratamientos_precio_no_negativo;
alter table catalogo_tratamientos add constraint catalogo_tratamientos_precio_no_negativo check (precio >= 0) not valid;
alter table tratamientos drop constraint if exists tratamientos_costo_no_negativo;
alter table tratamientos add constraint tratamientos_costo_no_negativo check (costo >= 0) not valid;

commit;
