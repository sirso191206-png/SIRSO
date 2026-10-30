-- ============================================================
-- SIRO — 121: datos personales del equipo y CURP de pacientes protegidos POR COLUMNA en la base.
-- ------------------------------------------------------------
-- Hallazgos (pruebas con personas, 29/10/2026):
--  * Cualquier rol de una clínica leía por la API la CURP, el RFC y la firma (firma_png) de sus compañeros: RLS filtra
--    FILAS, no columnas, y la tabla `usuarios` daba SELECT completo a `authenticated`.
--  * Recepción leía y modificaba la CURP de los pacientes en la tabla base `pacientes` (la vista v_pacientes_seguro la
--    ocultaba, pero la tabla no).
-- Solución (mismo patrón en ambas tablas):
--  1. SELECT por columna: `authenticated` puede leer todas las columnas MENOS las sensibles (usuarios: curp, rfc,
--     firma_png; pacientes: curp). Pedir esas columnas —o filtrar por ellas— responde «permission denied».
--  2. Funciones SECURITY DEFINER, cada una con su regla:
--       mi_perfil_privado()            → la propia CURP/RFC/firma (cualquier usuario, solo lo suyo).
--       datos_privados_equipo()        → RFC y CURP del equipo (solo el propietario: los administra en «Usuarios»).
--       fn_curp_visible(paciente)      → la CURP si el paciente le está asignado (owner, su dentista, su asistente).
--       fn_paciente_por_curp(curp)     → si ya existe un paciente con esa CURP en la clínica (para evitar duplicados al
--                                        dar de alta), SIN devolver la CURP.
--  3. v_pacientes_seguro toma la CURP de fn_curp_visible (la vista corre con los permisos de quien consulta).
--  4. Recepción ya no puede MODIFICAR la CURP (fn_restringir_columnas_pacientes_update); la sigue capturando al dar de
--     alta a un paciente nuevo (INSERT), sin poder leerla después.
-- Las Edge Functions (service_role) y los procesos internos no cambian. UPDATE/INSERT siguen como estaban (los limitan RLS
-- y los triggers); solo cambia qué columnas se pueden LEER.
-- Re-ejecutable. Rollback: supabase/rollback/siro_v3/rollback_121.sql.
-- ============================================================
begin;

-- ---------- usuarios ----------
revoke select on usuarios from authenticated, anon;
grant select (id, clinica_id, nombre, correo, rol, activo, creado_en, ultimo_acceso, es_super_admin, cedula_profesional,
              escuela_procedencia, ejerce_como_dentista, debe_cambiar_password) on usuarios to authenticated;

create or replace function mi_perfil_privado()
returns table (curp text, rfc text, firma_png text)
language sql stable security definer set search_path = public
as $$
  select u.curp, u.rfc, u.firma_png from usuarios u where u.id = auth.uid()
$$;
revoke all on function mi_perfil_privado() from public, anon;
grant execute on function mi_perfil_privado() to authenticated;

create or replace function datos_privados_equipo()
returns table (id uuid, curp text, rfc text)
language sql stable security definer set search_path = public
as $$
  select u.id, u.curp, u.rfc
  from usuarios u
  where auth_rol() = 'owner' and u.clinica_id = auth_clinica_id()
$$;
revoke all on function datos_privados_equipo() from public, anon;
grant execute on function datos_privados_equipo() to authenticated;

-- ---------- pacientes ----------
revoke select on pacientes from authenticated, anon;
grant select (id, clinica_id, nombre_completo, fecha_nacimiento, telefono, correo, direccion, contacto_emergencia,
              seguro_medico, notas_generales, creado_en, creado_por, archivado_en, numero_expediente, sexo, primer_apellido,
              segundo_apellido, estado_civil, ocupacion, escolaridad, nacionalidad, telefono_secundario, whatsapp, calle,
              numero_exterior, numero_interior, colonia, municipio, estado_domicilio, codigo_postal, tipo_paciente,
              estado_expediente, referido_por, tutor_legal, dentista_responsable_id, actualizado_en)
  on pacientes to authenticated;

create or replace function fn_curp_visible(p_paciente uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select p.curp from pacientes p where p.id = p_paciente and auth_paciente_asignado(p_paciente)
$$;
revoke all on function fn_curp_visible(uuid) from public, anon;
grant execute on function fn_curp_visible(uuid) to authenticated;

create or replace function fn_paciente_por_curp(p_curp text)
returns table (id uuid, nombre_completo text, numero_expediente text, archivado_en timestamptz, fecha_nacimiento date,
               telefono text, correo text, direccion text)
language sql stable security definer set search_path = public
as $$
  select p.id, p.nombre_completo, p.numero_expediente, p.archivado_en, p.fecha_nacimiento, p.telefono, p.correo, p.direccion
  from pacientes p
  where auth_clinica_id() is not null
    and p.clinica_id = auth_clinica_id()
    and p.curp = upper(btrim(p_curp))
  limit 1
$$;
revoke all on function fn_paciente_por_curp(text) from public, anon;
grant execute on function fn_paciente_por_curp(text) to authenticated;

-- Igual que la 119, salvo la CURP: ahora la da fn_curp_visible.
create or replace view v_pacientes_seguro
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

-- Igual que la 119, salvo que recepción ya no tiene 'curp' entre sus columnas modificables.
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

commit;
