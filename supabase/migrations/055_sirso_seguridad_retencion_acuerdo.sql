-- ============================================================
-- SIRO — Módulo legal, Fase 6: Seguridad, Retención, Acuerdo de
-- Tratamiento de Datos (borradores)
-- Migración 055
-- ------------------------------------------------------------
-- Mismo criterio que 051/052: inserción directa (RLS no deja que un
-- owner publique documento de plataforma), marcados como borrador,
-- {{VARIABLES}} en vez de datos inventados, [TODO LEGAL] donde
-- corresponde. Los 3 tipos (security, retention,
-- data_processing_agreement) ya estaban permitidos desde la migración
-- 049 — no se altera el CHECK constraint.
-- ============================================================

insert into legal_documents (clinica_id, tipo, version, titulo, contenido, vigente_desde, publicado_en, activo)
values
(
  null, 'security', '0.1-borrador', 'Seguridad',
'⚠ BORRADOR — pendiente de revisión legal profesional. Este documento describe medidas TÉCNICAS reales de SIRO — no es una certificación ni una garantía de que sea invulnerable.

Autenticación y autorización: cada usuario inicia sesión con credenciales propias (Supabase Auth); el acceso a cada función depende de su rol (owner, dentista, asistente, recepción) y de a qué paciente/sucursal esté asignado.

Aislamiento entre clínicas: cada consulta a la base de datos se filtra automáticamente por clínica a nivel de la propia base de datos (Row Level Security), no solo en la aplicación — aunque alguien manipulara una petición directamente, la base de datos rechaza el acceso a información de otra clínica.

Auditoría: los cambios sobre información clínica (crear, editar, eliminar) quedan registrados automáticamente, con quién los hizo y cuándo.

Cifrado en tránsito: toda comunicación entre tu navegador y los servidores viaja cifrada (HTTPS/TLS), provisto por la infraestructura de hospedaje.

Almacenamiento: la información se aloja en la infraestructura de Supabase — ver /legal/proveedores para el detalle.

Control de sesiones: [TODO LEGAL/TÉCNICO: SIRO aún no ofrece un panel donde el usuario vea y cierre sus sesiones activas por dispositivo — está pendiente de construir.]

Respaldos y monitoreo de infraestructura: son responsabilidad del proveedor de hospedaje (Supabase) conforme a sus propias políticas — SIRO no gestiona respaldos por separado hoy.

Versión {{VERSION}} — Última actualización: {{FECHA_ACTUALIZACION}}.',
  now(), now(), true
),
(
  null, 'retention', '0.1-borrador', 'Política de Conservación de Información',
'⚠ BORRADOR — pendiente de revisión legal profesional. Los plazos marcados como "Definir con asesoría jurídica" son intencionalmente así — no se inventó ningún plazo legal.

Datos de cuenta (usuarios del sistema): mientras la cuenta esté activa, más el periodo que determine la clínica tras su baja.
Datos administrativos (citas, pagos, facturación): Definir con asesoría jurídica.
Datos clínicos (expediente, notas, odontograma, periodontograma, recetas, consentimientos): Definir con asesoría jurídica — sujeto a la normativa de expediente clínico aplicable (NOM-004-SSA3-2012 y disposiciones relacionadas).
Auditoría: Definir con asesoría jurídica.
Consentimientos (legales y clínicos): se conservan indefinidamente como evidencia histórica — nunca se sobrescriben ni se eliminan, incluso si se revocan o cancelan (quedan marcados, no borrados).
Documentos legales (versiones anteriores de avisos/términos): se conservan indefinidamente como evidencia histórica.

Versión {{VERSION}} — Última actualización: {{FECHA_ACTUALIZACION}}.',
  now(), now(), true
),
(
  null, 'data_processing_agreement', '0.1-borrador', 'Acuerdo de Tratamiento de Datos',
'⚠ BORRADOR — pendiente de revisión legal profesional. Este documento describe conceptualmente la relación entre {{RESPONSABLE}} y la clínica que usa SIRO — la calificación jurídica exacta (quién es responsable y quién encargado) depende del caso concreto y no se afirma aquí de forma absoluta.

1. Partes
{{RESPONSABLE}} pone a disposición de la Clínica la plataforma SIRO para la gestión de su expediente clínico y operación administrativa.

2. Objeto
El tratamiento de datos personales, incluidos datos de salud, que la Clínica captura y administra a través de SIRO.

3. Categorías de datos
Identificación, contacto, datos clínicos (sensibles), datos administrativos y datos técnicos — ver el detalle completo en el Aviso de Privacidad Integral.

4. Categorías de titulares
Pacientes de la Clínica, y el personal de la Clínica que usa SIRO.

5. Instrucciones
La Clínica determina las finalidades y medios del tratamiento de los datos de sus pacientes; {{RESPONSABLE}} trata esos datos únicamente conforme a las instrucciones de la Clínica y para prestar el servicio.

6. Confidencialidad y seguridad
Ver /legal/seguridad para el detalle de las medidas técnicas implementadas.

7. Subencargados / proveedores
Ver /legal/proveedores para el listado real de proveedores que participan en el tratamiento.

8. Incidentes
[TODO LEGAL: definir el procedimiento y plazos de notificación de incidentes de seguridad entre {{RESPONSABLE}} y la Clínica.]

9. Conservación y eliminación
Ver /legal/retencion.

10. Terminación
[TODO LEGAL: definir qué ocurre con la información de la Clínica si termina su relación con SIRO — plazo de exportación, plazo de eliminación.]

Versión {{VERSION}} — Última actualización: {{FECHA_ACTUALIZACION}}.',
  now(), now(), true
);
