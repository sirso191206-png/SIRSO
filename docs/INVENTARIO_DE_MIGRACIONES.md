# Inventario de migraciones

Generado a partir de los archivos EXACTOS de `supabase/migrations/` de este paquete (SHA-256 truncado a 16 caracteres; el completo se obtiene con `sha256sum`). Total: **107 archivos** (001–106).

## Reglas de aplicación
* Se aplican **en orden de nombre de archivo**. El prefijo `064` aparece dos veces desde el origen: se aplican ambos, en orden alfabético.
* **Instalación NUEVA:** aplica TODAS, de la 001 a la 106. Verificado localmente (PostgreSQL 16, modo estricto, sin parches manuales).
* **Instalación EXISTENTE:** aplica solo las que faltan (consulta `supabase/verificacion/marcadores_de_migraciones_solo_lectura.sql`, que cubre 085–106, y el historial `supabase_migrations.schema_migrations` si usas la CLI). **Nunca vuelvas a lanzar el rango completo**: las anteriores a la 085 no están diseñadas para re-ejecutarse (la 007, en particular).
* Las migraciones **085–106** están escritas para re-ejecutarse sin error y sin cambiar el esquema (verificado: dos re-ejecuciones consecutivas). Cada una es transaccional (`begin … commit`).
* **Rollback** disponible y verificado (esquema EXACTO anterior) para 094–104 y 106 en `supabase/rollback/`. Retrocede en orden inverso. La **105** (borradores legales v2) solo añade versiones y no tiene script: nunca borra nada; para volver al texto anterior se reactiva su versión desde la administración legal. La **106** (documentos 1.0 y registro de aceptaciones) tiene rollback que NO borra nada: deja las versiones 1.0 inactivas, reactiva las 0.x y devuelve a `other` los dos tipos nuevos. No hay rollback para 001–093: restaura el respaldo. Los rollbacks de la 103 y la 104 **pierden** el indicador de contraseña y el historial/retenciones de conservación: respáldalos antes.
* **Nota sobre la migración 007:** se modificó en una fase anterior para no depender de la 040; solo afecta a instalaciones nuevas. Si tu herramienta guardó un checksum del original verás una diferencia sin efecto de ejecución en una base ya migrada; no la re-ejecutes.

## Inventario

| Archivo | SHA-256 (16) | Qué hace (primera línea de su cabecera) | Rollback | ¿Re-ejecutable? |
|---|---|---|---|---|
| `001_fase1_schema.sql` | `e56cb3fee72d814a` | FASE 1 — Sistema de Gestión Odontológica | — | NO se debe re-ejecutar |
| `002_fase2_odontograma.sql` | `5fd9294bfbdefaac` | FASE 2 — Módulo 1: Odontograma interactivo | — | NO se debe re-ejecutar |
| `003_fase2_odontograma_caras.sql` | `bf9da9ff1f9bea7a` | FASE 2 — Odontograma: caras individuales por pieza | — | NO se debe re-ejecutar |
| `004_sirso_fase1_agenda.sql` | `ced2532b37c16b83` | SIRSO — FASE 1: Agenda semanal profesional | — | NO se debe re-ejecutar |
| `005_sirso_fase3_odontograma.sql` | `626be4a38da2f023` | SIRSO — FASE 3: Mejoras del odontograma | — | NO se debe re-ejecutar |
| `006_sirso_fase4_expediente.sql` | `dd02d6247e23a9b7` | SIRSO — FASE 4: Expediente clínico completo | — | NO se debe re-ejecutar |
| `007_sirso_fase5_folio.sql` | `fe8cfb0eb58d645a` | SIRSO — FASE 5: Pacientes — folio automático de expediente | — | NO se debe re-ejecutar |
| `008_sirso_fase6_tratamientos.sql` | `a607815b8d0b60b3` | SIRSO — FASE 6: Tratamientos — catálogo, categorías, sesiones | — | NO se debe re-ejecutar |
| `009_sirso_reorg_archivos.sql` | `284303294e33b0bb` | SIRSO — Reorganización, Fase 4: perfil del paciente (Archivos) | — | NO se debe re-ejecutar |
| `010_sirso_reorg_consulta.sql` | `4589293949a2c05d` | SIRSO — Reorganización, Fase 6: Consulta unificada | — | NO se debe re-ejecutar |
| `011_sirso_fix_auditoria_usuarios.sql` | `3425c80687dca3b5` | SIRSO — Fix de seguridad: auditoría en `usuarios` | — | NO se debe re-ejecutar |
| `012_sirso_fix_auditoria_usuarios_edge.sql` | `2c4c6e3b9c747f18` | SIRSO — Fix: auditoría correcta para usuarios creados/eliminados | — | NO se debe re-ejecutar |
| `013_sirso_contacto.sql` | `6a2fcaece15e0dee` | Formulario de contacto público | — | NO se debe re-ejecutar |
| `014_sirso_fix_grant_contacto.sql` | `ce536c9d4786f6e6` | Fix: falta el permiso base (GRANT) para insertar en | — | NO se debe re-ejecutar |
| `015_sirso_urgencias_turnos.sql` | `b81d9f7efd7e123f` | Urgencias, turnos y cola de espera | — | NO se debe re-ejecutar |
| `016_sirso_curp.sql` | `6c231b56b511c14b` | CURP inteligente al registrar paciente | — | NO se debe re-ejecutar |
| `017_sirso_fase7_pagos.sql` | `8f2a0d57bf41565b` | Fase 7: Pagos — folio de recibo | — | NO se debe re-ejecutar |
| `018_sirso_periodontograma.sql` | `57b1d00e8edc5da9` | Periodontograma | — | NO se debe re-ejecutar |
| `019_sirso_periodontograma_historial.sql` | `e4e8ae73af86be0d` | Historial del periodontograma | — | NO se debe re-ejecutar |
| `020_sirso_recetas.sql` | `8dd67b2e86a164dd` | Recetas médicas | — | NO se debe re-ejecutar |
| `021_sirso_establecimiento.sql` | `2f0907ae5a0eaa89` | Datos de identificación del establecimiento (NOM-004) | — | NO se debe re-ejecutar |
| `022_sirso_heredofamiliares.sql` | `46225d907ddff1a5` | Antecedentes heredofamiliares estructurados | — | NO se debe re-ejecutar |
| `023_sirso_cie10.sql` | `754d4178825b7aa3` | Diagnóstico con CIE-10 | — | NO se debe re-ejecutar |
| `024_sirso_consentimientos.sql` | `26b671b48dec83f8` | Consentimientos informados estructurados | — | NO se debe re-ejecutar |
| `025_sirso_interrogatorio_sistemas.sql` | `46d9ee499610a677` | Interrogatorio por aparatos y sistemas | — | NO se debe re-ejecutar |
| `026_sirso_exploracion_fisica.sql` | `c0125d9be65c42ef` | Exploración física | — | NO se debe re-ejecutar |
| `027_sirso_referencias.sql` | `54e356088741ee52` | Referencias a otros médicos | — | NO se debe re-ejecutar |
| `028_sirso_fase1_indices.sql` | `c78adda4f4082700` | FASE 1 (Seguridad y estabilidad) | — | NO se debe re-ejecutar |
| `029_sirso_planes_clinica.sql` | `6d0566ca7664259f` | Permisos / plan por clínica (base para SaaS) | — | NO se debe re-ejecutar |
| `030_sirso_suspension_y_limite_pacientes.sql` | `b477eabdb7cd2a91` | Refuerzo de seguridad: suspensión real + límite de pacientes | — | NO se debe re-ejecutar |
| `031_sirso_captura_sis.sql` | `5335cc065c4d8260` | Interoperabilidad SIS: captura de datos faltantes | — | NO se debe re-ejecutar |
| `032_sirso_catalogo_establecimientos.sql` | `b26965f914b9de5b` | Interoperabilidad SIS: catálogo de Establecimientos (CLUES) | — | NO se debe re-ejecutar |
| `033_sirso_nota_clinica_cita_id.sql` | `0355b95e60ed4f04` | Interoperabilidad SIS: enlace nota_clinica → cita | — | NO se debe re-ejecutar |
| `034_sirso_datos_paciente_privado.sql` | `2ff2435368e46791` | Fase A: datos completos del paciente (enfoque privado) | — | NO se debe re-ejecutar |
| `035_sirso_consentimiento_completo.sql` | `3c9cfbb36235e272` | Fase C: consentimiento informado completo | — | NO se debe re-ejecutar |
| `036_sirso_tutor_clinico_revocacion.sql` | `bd192ec453a67e31` | Huecos legales y clínicos: tutor, datos clínicos | — | NO se debe re-ejecutar |
| `037_sirso_datos_profesionales_receta.sql` | `549d74fb02e64cd0` | Datos profesionales permanentes del odontólogo + snapshot | — | NO se debe re-ejecutar |
| `038_sirso_permisos_por_asignacion.sql` | `ce4cedfb83953a0b` | Permisos por asignación de paciente | — | NO se debe re-ejecutar |
| `039_sirso_correccion_auditoria_permisos.sql` | `5c278b96d6e5099f` | Corrección post-auditoría: pacientes_update/expedientes_insert | — | NO se debe re-ejecutar |
| `040_sirso_auditoria_final_seguridad.sql` | `98bdc5fbcf4f59df` | Auditoría final de seguridad (ronda posterior a 038/039) | — | NO se debe re-ejecutar |
| `041_sirso_auditoria_fotos_storage_citas.sql` | `f80e49959ca142b8` | Auditoría de seguridad, ronda 3: fotografías, storage, citas | — | NO se debe re-ejecutar |
| `042_sirso_logo_clinica.sql` | `23f6e7c98253900e` | Fase 3: logo de la clínica | — | NO se debe re-ejecutar |
| `043_sirso_auditoria_signos_vitales.sql` | `9111bf301fca43e3` | Auditoría de seguridad, ronda 4: signos_vitales | — | NO se debe re-ejecutar |
| `044_sirso_cierre_permisos_pacientes.sql` | `aaf9feefc5b358aa` | Cierre de las 2 decisiones pendientes de la auditoría RLS | — | NO se debe re-ejecutar |
| `045_sirso_cierre_sis_supabase.sql` | `32f79040c0f6f48d` | Cierre V1: eliminación de SIS en Supabase | — | NO se debe re-ejecutar |
| `046_siro_Correccion_RLS.sql` | `2e8105c577ff3ae3` | Corrección RLS y permisos de clínicas | — | NO se debe re-ejecutar |
| `047_sirso_multisucursal_fundacion.sql` | `8a22aa9d540ebabb` | Fase 1: fundación de Multi-Sucursal | — | NO se debe re-ejecutar |
| `048_sirso_correcciones_produccion.sql` | `1860dbf820ca4498` | Correcciones post-producción: 2 bugs reales reportados | — | NO se debe re-ejecutar |
| `049_sirso_modulo_legal_fase1.sql` | `08d5145359924aac` | Módulo legal, Fase 1: cimiento técnico | — | NO se debe re-ejecutar |
| `050_sirso_datos_legales_clinica.sql` | `73658348e9e52680` | Módulo legal, Fase 2: datos legales mínimos por clínica | — | NO se debe re-ejecutar |
| `051_sirso_contenido_legal_inicial.sql` | `fbe3e6bf6238f83c` | Módulo legal, Fase 2: contenido inicial (borrador) | — | NO se debe re-ejecutar |
| `052_sirso_politica_cookies_inicial.sql` | `051feea07e3d4060` | Módulo legal, Fase 3: Política de Cookies (borrador) | — | NO se debe re-ejecutar |
| `053_sirso_arco.sql` | `ea60d1878f38b797` | Módulo legal, Fase 4: Derechos ARCO | — | NO se debe re-ejecutar |
| `054_sirso_consentimientos_estado.sql` | `53852bc872e7cd53` | Módulo legal, Fase 5: consentimientos — campos y estado | — | NO se debe re-ejecutar |
| `055_sirso_seguridad_retencion_acuerdo.sql` | `99aa41d8cda78c49` | Módulo legal, Fase 6: Seguridad, Retención, Acuerdo de | — | NO se debe re-ejecutar |
| `056_sirso_correccion_cookies_localstorage.sql` | `66a3573465c1d401` | Corrección de precisión: Cookies vs localStorage | — | NO se debe re-ejecutar |
| `057_sirso_sesiones_usuario.sql` | `3743d5ca2f57d51c` | Módulo legal, Fase 7: control de sesiones | — | NO se debe re-ejecutar |
| `058_sirso_incidentes_seguridad.sql` | `3bc7eda67659cd58` | Módulo legal, Fase 7: registro de incidentes de seguridad | — | NO se debe re-ejecutar |
| `059_sirso_arco_antispam_verificacion.sql` | `1b09fe46bc87ba6c` | Módulo legal: protecciones reales para ARCO | — | NO se debe re-ejecutar |
| `060_sirso_incidentes_superadmin_y_realtime_sesiones.sql` | `637d2c9baa1996e3` | Correcciones reportadas: incidentes visibles para | — | NO se debe re-ejecutar |
| `061_sirso_superadmin_administra_incidentes.sql` | `e9e97a8813f71661` | super_admin: control completo sobre incidentes de | — | NO se debe re-ejecutar |
| `062_sirso_cancelar_tratamiento_anular_pago.sql` | `d706f403159b76fc` | Cancelar tratamiento / anular pago (sin borrado destructivo) | — | NO se debe re-ejecutar |
| `063_sirso_firma_recetas.sql` | `4db2c2b382f3b2db` | Firma en recetas: dentista (guardada) + paciente (por receta) | — | NO se debe re-ejecutar |
| `064_sirso_limite_sesiones_por_plan.sql` | `329b8902125a4bff` | Límite de sesiones simultáneas por plan | — | NO se debe re-ejecutar |
| `064_sirso_planes_catalogo_limite_sesiones.sql` | `a6565655e5df839a` | Tabla central de planes + límite de sesiones simultáneas | — | NO se debe re-ejecutar |
| `065_sirso_indices_rendimiento.sql` | `e30d2f6e37bd2638` | Índices reales, verificados contra patrones de consulta | — | NO se debe re-ejecutar |
| `066_sirso_agregacion_tratamientos_top.sql` | `def28edd3212bbeb` | Agregación en SQL para "tratamientos más realizados" | — | NO se debe re-ejecutar |
| `067_sirso_fix_recursion_sucursales.sql` | `19bada237f2db720` | Captura como migración real un fix que solo vivía en | — | NO se debe re-ejecutar |
| `068_sirso_detalle_piezas_odontograma.sql` | `a46102e7821da7e3` | Detalle clínico adicional por pieza: material de corona, | — | NO se debe re-ejecutar |
| `069_sirso_concurrencia_pacientes.sql` | `e2566f1159b582a0` | Concurrencia (versión ligera): detectar ediciones | — | NO se debe re-ejecutar |
| `070_sirso_actualizado_en_vista_pacientes.sql` | `c319a3c41a233aa3` | Expone actualizado_en (069) en v_pacientes_seguro | — | NO se debe re-ejecutar |
| `071_sirso_concurrencia_expedientes.sql` | `955d6a63c32d5004` | Concurrencia (versión ligera) para expedientes | — | NO se debe re-ejecutar |
| `072_sirso_concurrencia_odontograma_periodontograma.sql` | `7b8b665a969129ff` | Concurrencia real para odontograma y periodontograma | — | NO se debe re-ejecutar |
| `073_sirso_concurrencia_citas.sql` | `aa2796caa5d85ada` | Concurrencia real para citas | — | NO se debe re-ejecutar |
| `074_sirso_hotfix_rls_planes_catalogo.sql` | `e5f4f7528027c70d` | Hotfix de seguridad: RLS en planes_catalogo | — | NO se debe re-ejecutar |
| `075_sirso_planes_suscripciones.sql` | `45e656690f32d732` | Planes comerciales administrables + suscripciones con snapshot | — | NO se debe re-ejecutar |
| `076_sirso_clinica_siempre_con_suscripcion.sql` | `7dcff89807a85a65` | Una clínica NUNCA existe sin suscripción | — | NO se debe re-ejecutar |
| `077_sirso_hotfix_proteger_es_super_admin.sql` | `bdc454bb33a71298` | Hotfix de seguridad: nadie se hace superadmin por la API | — | NO se debe re-ejecutar |
| `078_sirso_sesiones_reales.sql` | `8afae4d01b272286` | Sesiones por dispositivo: control REAL, del lado del servidor | — | NO se debe re-ejecutar |
| `079_sirso_sucursales_requieren_multisucursal.sql` | `351a4fe93d09bc37` | Crear sucursales requiere la funcionalidad "multisucursal" | — | NO se debe re-ejecutar |
| `080_sirso_profesional_incluye_sucursal.sql` | `f122689013140636` | El plan Profesional incluye 1 sucursal | — | NO se debe re-ejecutar |
| `081_sirso_hotfix_aislamiento_auditoria.sql` | `31b48ca6a982f77b` | HOTFIX DE SEGURIDAD: la auditoría de una clínica era legible por TODAS las clínicas | — | NO se debe re-ejecutar |
| `082_sirso_vencimiento_almacenamiento_catalogo.sql` | `97ffb320a6e692de` | Vencimiento de suscripción, almacenamiento real y catálogo honesto | — | NO se debe re-ejecutar |
| `083_sirso_ranking_tratamientos_filtros.sql` | `cb71fa17c8c54170` | Ranking de tratamientos con período, estado y odontólogo | — | NO se debe re-ejecutar |
| `084_sirso_owner_como_dentista.sql` | `5f747eba920bb0cd` | El propietario también puede ejercer como dentista | — | NO se debe re-ejecutar |
| `085_sirso_finalizar_consulta_atomica.sql` | `1b652ba8612170c2` | Finalizar una consulta clínica de forma atómica y autorizada | — | sí (verificado) |
| `086_sirso_eliminar_clinica_controlada.sql` | `d6e83cd68da9ce55` | Eliminación DEFINITIVA de una clínica: controlada, autorizada y atómica | — | sí (verificado) |
| `087_sirso_conservacion_antes_de_eliminar_clinica.sql` | `4254f41c401c36a5` | Conservación de información clínica antes de eliminar una clínica | — | sí (verificado) |
| `088_sirso_finalizar_consulta_verificada.sql` | `776ee43890517df2` | fn_finalizar_consulta v2: los reintentos se VERIFICAN, no se suponen | — | sí (verificado) |
| `089_sirso_conservacion_por_categorias_y_limpieza.sql` | `03de3133dc8af934` | Conservación por categorías y trazabilidad de la limpieza (Auth/Storage) | — | sí (verificado) |
| `090_sirso_completar_cita_solo_por_consulta.sql` | `c646f11516a0befb` | Una cita solo se completa FINALIZANDO LA CONSULTA (y recuperación de las ya completadas sin nota) | — | sí (verificado) |
| `091_sirso_integridad_nota_cita.sql` | `7efb177d0f29e1cb` | Una nota solo puede ligarse a una cita DEL MISMO PACIENTE de su expediente | — | sí (verificado) |
| `092_sirso_integridad_autoria_y_referencias.sql` | `6efe2d78b9e07c82` | Integridad de autoría de las notas y de las referencias entre clínicas en las citas | — | sí (verificado) |
| `093_sirso_nota_retrofecha_configurable.sql` | `642080442112691b` | Límite de RETROFECHA de las notas clínicas: configuración EXPLÍCITA, sin valor por omisión | — | sí (verificado) |
| `094_sirso_correccion_citas_completadas.sql` | `dc68ddffa8b0faf4` | Corrección de citas COMPLETADAS: con motivo, por rol y con auditoría completa | sí | sí (verificado) |
| `095_sirso_privilegios_minimos.sql` | `dbd7a9b854ebffdd` | Privilegios mínimos: quitar TRUNCATE, REFERENCES y TRIGGER a anon y authenticated | sí | sí (verificado) |
| `096_sirso_logos_listado_propia_clinica.sql` | `42b429e11015d827` | Logos: la lectura por la API de Storage queda limitada a la PROPIA clínica | sí | sí (verificado) |
| `097_sirso_nota_fecha_recepcion.sql` | `17b1f0a13b20f36f` | Notas: separar la FECHA DEL EVENTO, lo que DIJO el dispositivo y la fecha de RECEPCIÓN en el servidor | sí | sí (verificado) |
| `098_sirso_integridad_referencias_y_actores.sql` | `a41f9cd9a2094ba7` | Integridad de referencias entre clínicas y de AUTORÍA en el resto de tablas clínicas | sí | sí (verificado) |
| `099_sirso_contacto_limites_de_tamano.sql` | `6bf44aaf01fbfefa` | Formulario de contacto: límites de tamaño en la tabla pública `mensajes_contacto` | sí | sí (verificado) |
| `100_sirso_auditoria_no_falsificable.sql` | `e2660a419948bd03` | La auditoría deja de ser falsificable por los usuarios | sí | sí (verificado) |
| `101_sirso_firmante_de_documentos_clinicos.sql` | `fda7065ee94882b3` | El FIRMANTE de una receta, un consentimiento o una referencia médica es quien está autenticado | sí | sí (verificado) |
| `102_sirso_contacto_limite_de_frecuencia.sql` | `a018ae30cab1c451` | Formulario de contacto público: límite de FRECUENCIA aplicado en el servidor | sí | sí (verificado) |
| `103_sirso_cambio_password_obligatorio.sql` | `415a4ad4d85f8b5f` | Cambio OBLIGATORIO de la contraseña temporal (validado en el servidor) | sí | sí (verificado) |
| `104_sirso_politica_conservacion_y_retencion_legal.sql` | `10a16d8247110ce8` | Política de conservación por categoría, retención legal y supresión autorizada | sí | sí (verificado) |
| `105_sirso_borradores_legales_v2.sql` | `9d58cc61e8511112` | Borradores legales, versión 2 (preparación para la revisión de un abogado) | — (solo añade versiones) | sí (verificado) |
| `106_sirso_documentos_legales_v1.sql` | `1d2d4f23e3da03ec` | Documentos legales, versión 1.0 y registro de aceptaciones | sí | sí (verificado) |
