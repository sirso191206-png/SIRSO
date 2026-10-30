-- ROLLBACK de la 122. Devuelve el saldo, la vista y el trigger como los dejó la 121, regresa los teléfonos a su valor
-- original (telefonos_normalizacion_122) y quita la búsqueda sin acentos, la vista de teléfonos y planes_publicos().
-- Re-ejecutable (si ya no existe la bitácora de teléfonos, no hay nada que regresar).
begin;

-- Teléfonos: primero quitar el trigger (si no, volvería a normalizar lo que se restaura).
do $$
declare v_tabla text;
begin
  foreach v_tabla in array array['pacientes', 'clinicas', 'sucursales', 'solicitudes_cita'] loop
    execute format('drop trigger if exists trg_normalizar_telefonos on %I', v_tabla);
  end loop;
  if to_regclass('public.telefonos_normalizacion_122') is not null then
    update pacientes p set telefono = l.antes from telefonos_normalizacion_122 l where l.tabla = 'pacientes' and l.campo = 'telefono' and l.registro_id = p.id;
    update pacientes p set telefono_secundario = l.antes from telefonos_normalizacion_122 l where l.tabla = 'pacientes' and l.campo = 'telefono_secundario' and l.registro_id = p.id;
    update pacientes p set whatsapp = l.antes from telefonos_normalizacion_122 l where l.tabla = 'pacientes' and l.campo = 'whatsapp' and l.registro_id = p.id;
    update pacientes p set contacto_emergencia = jsonb_set(p.contacto_emergencia, '{telefono}', to_jsonb(l.antes)) from telefonos_normalizacion_122 l where l.tabla = 'pacientes' and l.campo = 'contacto_emergencia.telefono' and l.registro_id = p.id;
    update pacientes p set contacto_emergencia = jsonb_set(p.contacto_emergencia, '{telefono_alterno}', to_jsonb(l.antes)) from telefonos_normalizacion_122 l where l.tabla = 'pacientes' and l.campo = 'contacto_emergencia.telefono_alterno' and l.registro_id = p.id;
    update pacientes p set tutor_legal = jsonb_set(p.tutor_legal, '{telefono}', to_jsonb(l.antes)) from telefonos_normalizacion_122 l where l.tabla = 'pacientes' and l.campo = 'tutor_legal.telefono' and l.registro_id = p.id;
    update clinicas c set telefono = l.antes from telefonos_normalizacion_122 l where l.tabla = 'clinicas' and l.campo = 'telefono' and l.registro_id = c.id;
    update sucursales s set telefono = l.antes from telefonos_normalizacion_122 l where l.tabla = 'sucursales' and l.campo = 'telefono' and l.registro_id = s.id;
    update sucursales s set whatsapp = l.antes from telefonos_normalizacion_122 l where l.tabla = 'sucursales' and l.campo = 'whatsapp' and l.registro_id = s.id;
    update solicitudes_cita s set telefono = l.antes from telefonos_normalizacion_122 l where l.tabla = 'solicitudes_cita' and l.campo = 'telefono' and l.registro_id = s.id;
  end if;
end $$;
drop table if exists telefonos_normalizacion_122;
drop view if exists v_telefonos_por_revisar;
drop function if exists fn_normalizar_telefonos_fila();
drop function if exists fn_normalizar_telefono(text);

drop function if exists planes_publicos();

-- Vistas: una columna no se puede quitar con «create or replace»; se recrean con sus permisos.
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
  fn_curp_visible(id) as curp,
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
grant select, insert, update, delete on v_pacientes_seguro to authenticated;
revoke all on v_pacientes_seguro from anon;   -- los permisos por omisión del esquema se lo darían (la 120 se lo quitó)

drop view if exists v_saldo_pacientes;
create view v_saldo_pacientes
with (security_invoker = true) as
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
grant select, insert, update, delete on v_saldo_pacientes to authenticated;
revoke all on v_saldo_pacientes from anon;

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
    v_columnas_permitidas := v_columnas_base || array['tipo_paciente', 'tutor_legal'];
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

drop index if exists idx_pacientes_busqueda_trgm;
alter table pacientes drop column if exists busqueda;
drop function if exists fn_sin_acentos(text);

commit;
