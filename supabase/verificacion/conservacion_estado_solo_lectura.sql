-- ============================================================
-- SIRO — ¿Qué falta por configurar en la política de conservación? (SOLO LECTURA)
-- Para el administrador responsable. Va envuelta en BEGIN READ ONLY, no ejecuta funciones y solo devuelve conteos y configuración (nunca datos de pacientes).
-- Léelo así: una categoría con «SIN PLAZO DEFINIDO» o en PENDIENTE_DE_ABOGADO sigue pendiente; mientras el plazo clínico no esté definido, NINGÚN expediente puede suprimirse.
-- ============================================================
begin read only;
select categoria, estado_aprobacion, coalesce(plazo_anios::text, 'SIN PLAZO DEFINIDO') as plazo_anios, coalesce(plazo_minimo_anios::text, '-') as piso_anios, evento_inicio, eliminacion_automatica
  from politicas_conservacion order by categoria;
select coalesce((select valor from plataforma_config where clave = 'retencion_expediente_anios'), 'sin valor') as plazo_clinico_clave_anterior_087,
       coalesce((select valor from plataforma_config where clave = 'retencion_fiscal_anios'), 'sin valor') as plazo_fiscal_clave_anterior_089,
       coalesce((select valor from plataforma_config where clave = 'retencion_contractual_anios'), 'sin valor') as plazo_contractual_clave_anterior_089;
select count(*) filter (where liberada_en is null) as retenciones_legales_activas, count(*) filter (where liberada_en is not null) as retenciones_liberadas from retenciones_legales;
select accion, count(*) as veces, max(creado_en) as ultima from conservacion_historial group by accion order by accion;
select count(*) as pacientes_archivados, (select count(*) from pacientes) as pacientes_total from pacientes where archivado_en is not null;
rollback;
