-- ============================================================
-- SIRO — ¿Qué migraciones 085–106 ya están aplicadas en ESTA base? (SOLO LECTURA)
-- Se ejecuta en el SQL Editor de Supabase o con psql. Va envuelta en BEGIN READ ONLY (PostgreSQL rechaza cualquier escritura) y solo comprueba la existencia de
-- objetos que crea cada migración: no devuelve datos de pacientes ni de clínicas.
-- Lectura: cada fila es un marcador. En una base al día TODAS dan `true`. Si una da `false`, esa migración (y las siguientes) NO está aplicada: aplica solo las
-- que faltan, en orden. Una base que se quedó a medias de una migración (todas son transaccionales) no puede ocurrir: o está o no está.
-- ============================================================
begin read only;
select marcador, aplicada from (values
  ('085/088 fn_finalizar_consulta con verificación de reintentos (088)', exists (select 1 from pg_proc where proname = 'fn_finalizar_consulta' and prosrc like '%NOTA_CONFLICTO%')),
  ('086/089 fn_eliminar_clinica', exists (select 1 from pg_proc where proname = 'fn_eliminar_clinica')),
  ('089 conservación por categorías (fn_politica_anios)', exists (select 1 from pg_proc where proname = 'fn_politica_anios')),
  ('090 una cita solo se completa por la consulta (trigger)', exists (select 1 from pg_trigger where tgname = 'trg_bloquear_completar_cita_directo' and not tgisinternal)),
  ('090 completar una consulta pendiente', exists (select 1 from pg_proc where proname = 'fn_completar_consulta_pendiente')),
  ('091 nota ↔ cita del mismo paciente (trigger)', exists (select 1 from pg_trigger where tgname = 'trg_validar_nota_cita' and not tgisinternal)),
  ('092 autoría de la nota (trigger)', exists (select 1 from pg_trigger where tgname = 'trg_validar_autoria_nota' and not tgisinternal)),
  ('092 referencias de la cita (trigger)', exists (select 1 from pg_trigger where tgname = 'trg_validar_referencias_cita' and not tgisinternal)),
  ('093 límite de retrofecha configurable', exists (select 1 from pg_proc where proname = 'fn_config_horas_positivas')),
  ('094 corrección de citas completadas', exists (select 1 from pg_proc where proname = 'fn_corregir_estado_cita')),
  ('095 sin TRUNCATE/REFERENCES/TRIGGER para anon y authenticated', not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER'))),
  ('096 lectura de logos limitada a la propia clínica', exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'storage_logos_select' and roles::text like '%authenticated%' and roles::text not like '%public%')),
  ('097 fecha de recepción de las notas', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'notas_clinicas' and column_name = 'recibida_en')),
  ('098 integridad de referencias y autoría (triggers)', exists (select 1 from pg_trigger where tgname = 'trg_actor_registro' and not tgisinternal)),
  ('099 límites de tamaño del formulario de contacto', exists (select 1 from pg_constraint where conname = 'mensajes_contacto_mensaje_longitud')),
  ('100 auditoría no falsificable (solo 3 acciones desde el cliente)', exists (select 1 from pg_policies where tablename = 'auditoria' and policyname = 'auditoria_insert_eventos' and with_check like '%DATA_EXPORTED%')),
  ('101 firmante de documentos clínicos (trigger)', exists (select 1 from pg_trigger where tgname = 'trg_firmante' and not tgisinternal)),
  ('102 límite de frecuencia del formulario de contacto (trigger)', exists (select 1 from pg_trigger where tgname = 'trg_limitar_frecuencia_contacto' and not tgisinternal)),
  ('103 cambio obligatorio de la contraseña temporal (columna y trigger)', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'usuarios' and column_name = 'debe_cambiar_password') and exists (select 1 from pg_trigger where tgname = 'trg_proteger_debe_cambiar_password' and not tgisinternal)),
  ('104 política de conservación, retención legal y supresión autorizada', exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'politicas_conservacion') and exists (select 1 from pg_trigger where tgname = 'trg_proteger_paciente_conservacion' and not tgisinternal)),
  ('105 borradores legales v2 (versión 0.2 conservada como historial)', exists (select 1 from legal_documents where tipo = 'privacy_integral' and version = '0.2-borrador')),
  ('106 documentos legales v1.0 (procedimiento ARCO vigente y disparador de aceptación)', exists (select 1 from legal_documents where tipo = 'arco_procedure' and version = '1.0' and activo) and exists (select 1 from pg_trigger where tgname = 'trg_validar_aceptacion_legal' and not tgisinternal))
) as t(marcador, aplicada) order by marcador;
rollback;
