-- ============================================================
-- SIRO — Interoperabilidad SIS: captura de datos faltantes
-- Migración 031 (corte C)
-- ------------------------------------------------------------
-- Agrega las columnas necesarias para reducir las advertencias
-- 'supuesto' y 'bloqueante' que reporta sis-mapper.ts hoy. Es
-- puramente aditiva: ninguna columna existente se toca, se renombra
-- ni se elimina. Todas las columnas nuevas son NULLABLE — nada dejará
-- de funcionar para pacientes/prestadores/consultas ya existentes.
--
-- El propio sis-mapper.ts se actualiza (en el mismo corte) para
-- preferir estas columnas cuando existan, y caer de vuelta a la
-- heurística/defaults anteriores cuando sean null. Es decir: nada se
-- vuelve obligatorio de golpe, la calidad del dato mejora conforme se
-- vaya capturando.
-- ============================================================

-- ---------- PACIENTES ----------
-- Nombre separado (hoy solo existe nombre_completo). Al llenarse,
-- sis-mapper deja de usar la separación heurística para este paciente.
alter table pacientes add column if not exists primer_apellido text;
alter table pacientes add column if not exists segundo_apellido text;

-- Demográficos que pide la guía SIS y SIRO no preguntaba.
alter table pacientes add column if not exists pais_nacimiento integer; -- CATALOG_KEY de PAIS (142 = México)
alter table pacientes add column if not exists entidad_nacimiento text; -- CATALOG_KEY de 2 caracteres
alter table pacientes add column if not exists sexo_biologico text;     -- distinto de `sexo` (que es el legal/CURP)
alter table pacientes add column if not exists genero text;
alter table pacientes add column if not exists se_autodenomina_afromexicano text;
alter table pacientes add column if not exists se_considera_indigena text;
alter table pacientes add column if not exists migrante text;
alter table pacientes add column if not exists pais_procedencia integer; -- solo si migrante = 'internacional'
alter table pacientes add column if not exists derechohabiencia text[];  -- multivalor nativo (array)

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pacientes_sexo_biologico_check') then
    alter table pacientes add constraint pacientes_sexo_biologico_check
      check (sexo_biologico is null or sexo_biologico in ('M', 'F', 'X'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pacientes_genero_check') then
    alter table pacientes add constraint pacientes_genero_check
      check (genero is null or genero in (
        'no_especificado', 'masculino', 'femenino', 'transgenero',
        'transexual', 'travesti', 'intersexual', 'otro'
      ));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pacientes_afromexicano_check') then
    alter table pacientes add constraint pacientes_afromexicano_check
      check (se_autodenomina_afromexicano is null or se_autodenomina_afromexicano in ('si', 'no', 'no_responde', 'no_sabe'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pacientes_indigena_check') then
    alter table pacientes add constraint pacientes_indigena_check
      check (se_considera_indigena is null or se_considera_indigena in ('si', 'no', 'no_responde', 'no_sabe'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pacientes_migrante_check') then
    alter table pacientes add constraint pacientes_migrante_check
      check (migrante is null or migrante in ('nacional', 'internacional', 'retornado', 'no'));
  end if;
end $$;

-- ---------- USUARIOS (prestador de servicio) ----------
alter table usuarios add column if not exists curp text;
alter table usuarios add column if not exists primer_apellido text;
alter table usuarios add column if not exists segundo_apellido text;
alter table usuarios add column if not exists tipo_personal_sis text; -- catálogo TIPO PERSONAL–SIS
alter table usuarios add column if not exists pais_nacimiento integer;
alter table usuarios add column if not exists programa_smym_g boolean;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'usuarios_tipo_personal_sis_check') then
    alter table usuarios add constraint usuarios_tipo_personal_sis_check
      check (tipo_personal_sis is null or tipo_personal_sis in (
        'pasante_odontologia', 'odontologo', 'odontologo_especialista', 'tecnico_odontologia'
      ));
  end if;
end $$;

-- ---------- SIGNOS VITALES ----------
-- `presion_arterial` (texto libre, ej. "120/80") se mantiene tal cual
-- para no romper el historial ya capturado. Los campos nuevos son la
-- vía preferida hacia adelante; sis-mapper usa estos si existen y solo
-- si no, intenta separar el texto libre como hacía antes.
alter table signos_vitales add column if not exists presion_sistolica integer;
alter table signos_vitales add column if not exists presion_diastolica integer;
alter table signos_vitales add column if not exists circunferencia_cintura numeric(5, 2);
alter table signos_vitales add column if not exists frecuencia_respiratoria integer;
alter table signos_vitales add column if not exists saturacion_oxigeno integer;
alter table signos_vitales add column if not exists glucemia integer;
alter table signos_vitales add column if not exists glucemia_en_ayunas boolean;

-- ---------- NOTAS CLÍNICAS: checklist de Salud Bucal ----------
-- Sigue el mismo patrón ya usado para interrogatorio_sistemas y
-- exploracion_fisica: un objeto jsonb estructurado en vez de 25
-- columnas sueltas. Las 25 variables de la sección "SALUD BUCAL"
-- (44-68 de la guía) viven aquí.
alter table notas_clinicas add column if not exists accion_salud_bucal jsonb;
