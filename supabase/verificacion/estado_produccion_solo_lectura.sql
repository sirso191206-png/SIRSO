-- ============================================================
-- SIRO — Verificación del ESTADO de una base ANTES de aplicar las migraciones 085–106. SOLO LECTURA.
-- Se ejecuta en el SQL Editor de Supabase. Va envuelta en BEGIN READ ONLY: PostgreSQL rechaza cualquier escritura, aunque alguien
-- edite este archivo por error. No devuelve datos clínicos ni de pacientes: solo conteos, nombres de objetos y valores de configuración.
-- Cada bloque indica el RESULTADO ESPERADO. Si algo no coincide, no apliques nada hasta entenderlo.
-- ============================================================
begin read only;

-- 1) Dependencias: lo que las migraciones nuevas necesitan (esperado: 078 = 4, 081 = 3, 084 = 1)
select '078 sesiones' as migracion, count(*) as objetos from pg_proc where proname in ('fn_sesion_activa','fn_estado_sesion','fn_sesion_jwt','fn_proteger_tablas_con_sesion')
union all select '081 auditoría', count(*) from pg_proc where proname in ('fn_clinica_de_auditoria','fn_rellenar_clinica_auditoria','fn_auditoria_asignar_clinica')
union all select '084 owner-dentista', count(*) from information_schema.columns where table_schema = 'public' and table_name = 'usuarios' and column_name = 'ejerce_como_dentista';

-- 2) ¿Ya está algo de 085–106 aplicado? (esperado ANTES de aplicar: todo 0; DESPUÉS: 38 funciones y 16 triggers (nombres distintos))
select count(*) as funciones_nuevas_presentes from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in
  ('fn_finalizar_consulta','fn_eliminar_clinica','fn_clinica_resumen_eliminacion','fn_limpieza_pendiente_clinica','fn_registrar_limpieza_clinica',
   'fn_registrar_intento_eliminacion','fn_politica_anios','fn_completar_consulta_pendiente','fn_consultas_sin_nota','fn_bloquear_completar_cita_directo','fn_validar_nota_cita',
   'fn_validar_autoria_nota','fn_validar_referencias_cita','fn_config_horas_positivas','fn_corregir_estado_cita','fn_proteger_cita_completada','fn_validar_dentista_misma_clinica','fn_validar_tratamiento_mismo_paciente','fn_validar_actor','fn_validar_firmante','fn_config_limite','fn_limitar_frecuencia_contacto','fn_proteger_debe_cambiar_password','fn_historial_conservacion_inmutable','fn_historial_politica_conservacion','fn_validar_aceptacion_legal', 'fn_ultimo_acto_medico','fn_paciente_tiene_registros_clinicos','fn_retencion_legal_activa','fn_retencion_legal_clinica','fn_plazo_expediente_anios','fn_conservacion_paciente','fn_proteger_paciente_conservacion','fn_proteger_clinica_retencion','fn_establecer_plazo_conservacion','fn_colocar_retencion_legal','fn_liberar_retencion_legal','fn_suprimir_paciente_autorizado');
select distinct tgname as trigger_presente from pg_trigger where tgname in ('trg_bloquear_completar_cita_directo','trg_validar_nota_cita','trg_validar_autoria_nota','trg_validar_referencias_cita','trg_proteger_cita_completada','trg_ref_dentista','trg_ref_tratamiento','trg_actor_registro','trg_firmante','trg_limitar_frecuencia_contacto','trg_proteger_debe_cambiar_password','trg_historial_conservacion_inmutable','trg_historial_politica_conservacion','trg_validar_aceptacion_legal', 'trg_proteger_paciente_conservacion','trg_proteger_clinica_retencion') and not tgisinternal order by 1;

-- 3) Privilegios sobre notas (esperado: authenticated SIN UPDATE ni DELETE — las notas son inmutables)
select privilege_type as privilegio_authenticated_notas from information_schema.role_table_grants where table_name = 'notas_clinicas' and grantee = 'authenticated' order by 1;
select count(*) as politicas_notas_clinicas from pg_policies where tablename = 'notas_clinicas';      -- esperado 4
select count(*) as politicas_citas from pg_policies where tablename = 'citas';                         -- esperado 5

-- 4) SECURITY DEFINER sin search_path fijo (esperado DESPUÉS de la 085: 0). Antes pueden salir fn_auditoria y fn_marcar_nota_editada.
select p.proname as secdef_sin_search_path from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosecdef and not exists (select 1 from pg_options_to_table(p.proconfig) where option_name = 'search_path') order by 1;

-- 5) Aislamiento: tablas con clinica_id o paciente_id SIN row level security (esperado: ninguna)
select c.relname as tabla_sin_rls from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity
   and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname in ('clinica_id','paciente_id') and not a.attisdropped);
select rolname, rolbypassrls from pg_roles where rolname in ('service_role','authenticated','anon');  -- esperado: service_role = true; authenticated y anon = false

-- 6) Políticas de conservación vigentes (esperado: 0 filas = NINGUNA definida; SIRO no define ninguna por ti. Mientras no existan, no se podrá
--    eliminar una clínica con información clínica o pagos. Las define el propietario del producto con asesoría legal/contable.)
select clave, valor from plataforma_config where clave like 'retencion_%' order by clave;

-- 7) Qué datos existentes podrían interactuar con las migraciones nuevas (solo conteos)
select count(*) as notas_ligadas_a_cita_de_otro_paciente                        -- esperado 0. Si > 0, la 091 NO las modifica: revísalas aparte
  from notas_clinicas n join expedientes e on e.id = n.expediente_id join citas c on c.id = n.cita_id where c.paciente_id <> e.paciente_id;
select count(*) as citas_con_odontologo_de_otra_clinica          -- esperado 0. Si > 0 son datos LEGADOS: la 092 no los modifica ni impide gestionarlos; revísalos aparte
  from citas c join pacientes p on p.id = c.paciente_id join usuarios u on u.id = c.dentista_id where c.dentista_id is not null and u.clinica_id is distinct from p.clinica_id;
select count(*) as citas_con_sillon_de_otra_clinica                -- esperado 0 (mismo criterio)
  from citas c join pacientes p on p.id = c.paciente_id join sillones s on s.id = c.sillon_id join consultorios co on co.id = s.consultorio_id join sucursales su on su.id = co.sucursal_id where su.clinica_id is distinct from p.clinica_id;
select count(*) as notas_firmadas_por_usuario_de_otra_clinica      -- esperado 0. Si > 0, revisa la autoría de esas notas (la 092 no las modifica)
  from notas_clinicas n join expedientes e on e.id = n.expediente_id join pacientes p on p.id = e.paciente_id join usuarios u on u.id = n.usuario_id where u.clinica_id is distinct from p.clinica_id;
select count(*) as notas_con_fecha_futura from notas_clinicas where creado_en > now();
select count(*) filter (where char_length(mensaje) > 5000) as mensajes_de_contacto_demasiado_largos, count(*) as mensajes_de_contacto   -- informativo: la 099 no toca las filas existentes
  from mensajes_contacto;   -- esperado 0 (la 092 acota las nuevas; las existentes no se tocan)
select count(*) as citas_completadas_sin_nota                                    -- las que Mi día completó sin consulta; aparecerán en «Consultas por completar»
  from citas c where c.estado = 'completada' and not exists (select 1 from notas_clinicas n where n.cita_id = c.id);
select count(*) filter (where estado = 'suspendida') as clinicas_suspendidas, count(*) as clinicas_total from clinicas;
select count(*) as arco_pendientes from arco_solicitudes where estado in ('recibida','en_revision','requiere_informacion','aprobada');
select count(*) as incidentes_abiertos from incidentes_seguridad where estado in ('detectado','en_investigacion','contenido');

-- 8) Eliminaciones anteriores con limpieza pendiente (solo existe después de aplicar la 089; esperado: 0 filas o 'completa')
select entidad_id as clinica_eliminada, creado_en, detalle -> 'limpieza' ->> 'estado' as estado_inicial from auditoria where accion = 'eliminar_clinica' order by creado_en desc limit 20;

-- 9) Buckets y políticas de Storage (esperado: 3 buckets; fotos/documentos por paciente asignado; logos por propietario de la clínica)
select id as bucket, public from storage.buckets order by 1;
select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' order by 1;

rollback;
