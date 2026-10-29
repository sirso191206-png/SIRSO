-- ROLLBACK de la 119. Deja v_pacientes_seguro como la 070 y fn_restringir_columnas_pacientes_update como la 048. Re-ejecutable.
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
  case when auth_paciente_asignado(id) then referido_por end as referido_por,
  actualizado_en
from pacientes;

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
    v_columnas_permitidas := v_columnas_base || array['curp', 'tipo_paciente'];
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

alter table catalogo_tratamientos drop constraint if exists catalogo_tratamientos_precio_no_negativo;
alter table tratamientos drop constraint if exists tratamientos_costo_no_negativo;

commit;
