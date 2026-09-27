-- ============================================================
-- SIRO — Expone actualizado_en (069) en v_pacientes_seguro
-- Migración 070
-- ------------------------------------------------------------
-- pacientes.actualizado_en no viaja solo hasta el frontend: la vista
-- que realmente consulta el frontend (v_pacientes_seguro) tiene una
-- lista explícita de columnas, no `select *`, así que la columna
-- nueva de la migración 069 no aparecía ahí todavía.
--
-- Se reproduce exactamente la vista de la migración 038, columna por
-- columna, y se agrega actualizado_en AL FINAL de la lista —
-- `create or replace view` en Postgres permite agregar columnas
-- nuevas, pero no insertarlas en medio de las existentes sin romper
-- la vista, así que no puede ir junto a creado_en aunque
-- lógicamente fuera el lugar más natural.
--
-- No es un dato sensible (a diferencia de curp, contacto_emergencia,
-- etc.) — es solo una marca de tiempo de la última modificación, igual
-- de inofensiva que creado_en, que ya se expone sin condición. Por eso
-- va sin el `case when auth_paciente_asignado(id) then ... end`.
-- ============================================================

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
