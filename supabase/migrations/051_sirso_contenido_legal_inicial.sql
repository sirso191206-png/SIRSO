-- ============================================================
-- SIRO — Módulo legal, Fase 2: contenido inicial (borrador)
-- Migración 051
-- ------------------------------------------------------------
-- Se inserta vía SQL directo (no vía la app) porque la política
-- legal_documents_insert (049) correctamente exige clinica_id =
-- auth_clinica_id() — ningún owner puede publicar el documento de
-- PLATAFORMA (clinica_id NULL), y así debe seguir siendo. Solo una
-- migración (equivalente a actuar como super_admin) puede sembrarlo.
--
-- IMPORTANTE — esto es un BORRADOR, no un documento legal terminado:
-- el propio texto de cada documento lo dice en su primera línea, y
-- permanece así hasta que alguien lo revise profesionalmente y
-- publique una versión sin ese aviso. No se afirma en ningún lado que
-- SIRO "cumple" con NOM-004 ni con ninguna ley de forma absoluta —
-- exactamente como pidió el documento original de este módulo.
-- ============================================================

insert into legal_documents (clinica_id, tipo, version, titulo, contenido, vigente_desde, publicado_en, activo)
values
(
  null, 'privacy_simplified', '0.1-borrador', 'Aviso de Privacidad Simplificado',
'⚠ BORRADOR — pendiente de revisión legal profesional. Este documento se publica de forma preliminar y no debe considerarse definitivo ni utilizarse como aviso de privacidad final sin haber sido revisado por un asesor jurídico.

{{RESPONSABLE}}, con domicilio en {{DOMICILIO}}, es responsable del tratamiento de tus datos personales, incluidos datos relacionados con tu salud, que recabamos para brindarte atención odontológica y los servicios administrativos relacionados (agenda, pagos, comunicación).

Puedes conocer el detalle completo de qué datos tratamos, con qué finalidades, a quién los transferimos y cómo ejercer tus derechos de Acceso, Rectificación, Cancelación y Oposición (derechos ARCO) en nuestro Aviso de Privacidad Integral.

Para cualquier duda sobre tus datos personales, escríbenos a {{CORREO_PRIVACIDAD}}.

Versión {{VERSION}} — Última actualización: {{FECHA_ACTUALIZACION}}.',
  now(), now(), true
),
(
  null, 'privacy_integral', '0.1-borrador', 'Aviso de Privacidad Integral',
'⚠ BORRADOR — pendiente de revisión legal profesional. Este documento se publica de forma preliminar y no debe considerarse definitivo.

1. Responsable del tratamiento
{{RESPONSABLE}} (RFC {{RFC}}), con domicilio en {{DOMICILIO}}, teléfono {{TELEFONO}} y correo de privacidad {{CORREO_PRIVACIDAD}}, es responsable del tratamiento de tus datos personales conforme a este aviso.

2. Datos personales que se recaban
- Identificación: nombre, apellidos, fecha de nacimiento, sexo, CURP cuando aplica.
- Contacto: teléfono, correo electrónico, domicilio.
- Datos clínicos (datos sensibles): antecedentes médicos y familiares, alergias, medicamentos, signos vitales, diagnósticos, tratamientos, expediente clínico, odontograma, periodontograma, fotografías, radiografías, estudios, recetas y notas clínicas.
- Datos administrativos: pagos, facturación, historial de citas.
- Datos técnicos: dirección IP, navegador, fecha y hora de acceso, cuando corresponda, con fines de seguridad y auditoría.

3. Datos personales sensibles
Tus datos clínicos son datos personales sensibles conforme a la legislación aplicable en materia de protección de datos personales. Su tratamiento requiere tu consentimiento expreso y, cuando la ley lo exija, por escrito, salvo las excepciones legales aplicables.

4. Finalidades del tratamiento
Finalidades primarias (necesarias para el servicio): brindarte atención odontológica, integrar y conservar tu expediente clínico, agendar y confirmar tus citas, generar recetas y documentos clínicos, y procesar pagos relacionados con tu atención.
Finalidades secundarias (no necesarias, puedes oponerte): envío de recordatorios adicionales, encuestas de satisfacción, comunicación informativa sobre la clínica.

5. Transferencias de datos
[TODO LEGAL: precisar aquí, caso por caso, si existen transferencias a terceros distintas de los encargados/proveedores listados en la sección 6, y su fundamento legal específico.]

6. Encargados y proveedores
SIRO es la plataforma tecnológica que {{RESPONSABLE}} utiliza para operar el expediente clínico electrónico y la agenda. El detalle de proveedores que participan en el tratamiento (almacenamiento, correo, mensajería) está disponible en /legal/proveedores.

7. Derechos ARCO
Tienes derecho a Acceder, Rectificar, Cancelar u Oponerte al tratamiento de tus datos personales (derechos ARCO). Puedes ejercerlos escribiendo a {{CORREO_PRIVACIDAD}} o a través del formulario disponible en /legal/arco.

8. Cambios a este aviso
Cualquier cambio a este aviso se comunicará actualizando la fecha y versión abajo, y notificándolo cuando la ley lo requiera.

Versión {{VERSION}} — Última actualización: {{FECHA_ACTUALIZACION}}.',
  now(), now(), true
),
(
  null, 'terms', '0.1-borrador', 'Términos y Condiciones',
'⚠ BORRADOR — pendiente de revisión legal profesional. Este documento se publica de forma preliminar y no debe considerarse definitivo ni vinculante sin revisión jurídica.

1. Objeto
Estos Términos y Condiciones regulan el uso de SIRO, una plataforma SaaS de gestión odontológica ofrecida por {{RESPONSABLE}}.

2. Definiciones
"SIRO" se refiere a la plataforma. "Clínica" se refiere al establecimiento odontológico que contrata el servicio. "Usuario" se refiere a cualquier persona que accede a SIRO con una cuenta. "Paciente" se refiere a la persona cuyos datos clínicos administra la Clínica dentro de SIRO.

3-4. Cuenta de usuario y responsabilidad de credenciales
Cada Usuario es responsable de mantener la confidencialidad de sus credenciales de acceso y de toda actividad realizada bajo su cuenta.

5-6. Uso permitido y uso prohibido
SIRO debe usarse únicamente para los fines de gestión clínica y administrativa para los que fue diseñado. Queda prohibido: acceder a información de pacientes sin relación con su atención, compartir credenciales, o utilizar la plataforma para fines distintos a la prestación de servicios odontológicos.

7-10. Servicio SaaS, disponibilidad, mantenimiento, actualizaciones
SIRO se ofrece bajo un modelo de software como servicio. [TODO LEGAL: definir aquí compromisos de disponibilidad (SLA) si se van a ofrecer formalmente, o aclarar expresamente que no se garantiza un SLA específico.]

11. Seguridad
SIRO implementa controles técnicos de seguridad (autenticación, control de acceso por roles, aislamiento de datos entre clínicas) descritos con más detalle en /legal/seguridad.

12-13. Datos personales y datos clínicos
El tratamiento de datos personales se rige por el Aviso de Privacidad. La Clínica es responsable de la exactitud de los datos clínicos que captura en SIRO.

14-16. Responsabilidad de la Clínica, del odontólogo y de SIRO
La Clínica y el profesional de la salud responsable son quienes toman las decisiones clínicas. SIRO es una herramienta tecnológica de apoyo — no diagnostica, no prescribe, no decide tratamientos ni sustituye el criterio clínico del profesional. [TODO LEGAL: revisar el alcance exacto de exclusión de responsabilidad para que no pretenda excluir responsabilidades que legalmente no puedan excluirse.]

17-20. Proveedores externos, integraciones, WhatsApp, correo electrónico
SIRO puede integrar servicios de terceros (mensajería, correo) listados en /legal/proveedores. Su disponibilidad puede depender de dichos terceros.

21. Almacenamiento
La información se almacena en la infraestructura descrita en /legal/proveedores y /legal/seguridad.

22-25. Pagos, suscripciones, cancelaciones, reembolsos
[TODO LEGAL: definir el modelo comercial específico — planes, periodicidad, política de cancelación y reembolsos — antes de publicar una versión final.]

26-28. Propiedad intelectual, licencia de uso, contenido del cliente
La marca, el código fuente, el diseño y la documentación de SIRO son propiedad de {{RESPONSABLE}}. La información clínica y administrativa que la Clínica captura en SIRO ("contenido del cliente") es propiedad de la Clínica.

29-30. Suspensión y terminación
SIRO puede suspender el acceso en caso de incumplimiento grave de estos Términos. [TODO LEGAL: definir el procedimiento y plazos de notificación previa.]

31-32. Conservación de información y exportación
La información clínica se conserva conforme a la Política de Conservación (/legal/retencion) y a la normativa aplicable en materia de expediente clínico. La Clínica puede solicitar la exportación de su información.

33. Seguridad
Ver sección 11 y /legal/seguridad.

34. Limitaciones
[TODO LEGAL: definir límites de responsabilidad conforme a la legislación aplicable.]

35. Soporte
El soporte se ofrece a través de los medios de contacto indicados en /legal/contacto.

36. Cambios en los términos
Cualquier cambio a estos Términos se publicará como una nueva versión, notificándose a los Usuarios conforme corresponda.

37. Jurisdicción
[TODO LEGAL: definir jurisdicción y legislación aplicable.]

38. Contacto
{{CORREO_PRIVACIDAD}}

Versión {{VERSION}} — Última actualización: {{FECHA_ACTUALIZACION}}.',
  now(), now(), true
);
