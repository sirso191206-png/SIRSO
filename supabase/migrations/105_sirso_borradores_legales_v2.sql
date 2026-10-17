-- ============================================================
-- SIRO — Borradores legales, versión 2 (preparación para la revisión de un abogado)
-- Migración 105. NUEVA: no edita ninguna migración anterior; cada documento recibe una versión nueva (las anteriores se conservan inactivas).
-- ------------------------------------------------------------
-- QUÉ CORRIGE (contrastado contra el código real del proyecto y contra las fuentes consultadas; ver docs/MATRIZ_REVISION_JURIDICA.md):
--  · Se retiran afirmaciones que el software no respalda: «integraciones de WhatsApp» (es solo un campo de contacto), recordatorios y encuestas automáticos, y la dirección IP
--    como dato guardado por la aplicación. Se corrige que el panel de sesiones por dispositivo SÍ existe, y se añade el cambio obligatorio de contraseña temporal.
--  · Se completan los elementos que el aviso de privacidad debe contener según las fuentes consultadas de la ley vigente (LFPDPPP, DOF 20-mar-2025): datos tratados con mención de los
--    sensibles, finalidades distinguiendo las que requieren consentimiento, medios para limitar el uso o la divulgación, mecanismo de revocación, procedimiento ARCO y autoridad.
--  · La política de conservación refleja el modelo implementado (migraciones 087, 089 y 104) sin inventar ningún plazo.
--  · Donde falta un dato o una decisión aparece [CONFIRMAR ABOGADO], [DECISIÓN DEL ABOGADO], [DEFINIR] o [TODO LEGAL]; los datos corporativos siguen siendo marcadores {{RESPONSABLE}}, {{RFC}}, etc.
-- ESTADO JURÍDICO: PENDIENTE DE ABOGADO. Ningún texto aprueba ni declara cumplimiento normativo. Publicar una versión nueva puede requerir que las personas vuelvan a aceptar los documentos.
-- Seguro de re-ejecutar (no inserta una versión que ya existe). No hay rollback destructivo: para volver a la versión anterior, activarla desde la administración legal.
-- ============================================================
begin;

do $legal_privacy_simplified$ begin
  if not exists (select 1 from legal_documents where tipo = 'privacy_simplified' and clinica_id is null and version = '0.2-borrador') then
    update legal_documents set activo = false where tipo = 'privacy_simplified' and clinica_id is null and activo = true;
    insert into legal_documents (clinica_id, tipo, version, titulo, contenido, vigente_desde, publicado_en, activo)
    values (null, 'privacy_simplified', '0.2-borrador', 'Aviso de Privacidad Simplificado', $legal$⚠ BORRADOR — pendiente de revisión por un abogado. Este texto no es un documento jurídico aprobado. No debe utilizarse como aviso de privacidad final sin esa revisión.

Responsable: {{RESPONSABLE}}, con domicilio en {{DOMICILIO}}. [CONFIRMAR ABOGADO: si el responsable del tratamiento de los datos de las y los pacientes es la clínica, SIRO o cada uno según el caso concreto.]

Datos personales que se tratan: identificación y contacto; datos relacionados con tu salud y tu atención odontológica (antecedentes, alergias, diagnósticos, tratamientos, odontograma, periodontograma, fotografías, recetas, notas y documentos clínicos), que son datos personales SENSIBLES; y datos administrativos (citas y pagos).

Finalidades: atenderte, integrar y conservar tu expediente clínico, agendar tus citas y registrar tus pagos. [CONFIRMAR ABOGADO: cuáles de estas finalidades requieren tu consentimiento y cuáles no, y la forma del consentimiento para los datos sensibles.]

Medios para limitar el uso o la divulgación de tus datos y para ejercer tus derechos de Acceso, Rectificación, Cancelación y Oposición (ARCO): escribe a {{CORREO_PRIVACIDAD}} o usa el formulario de /legal/arco.

Puedes consultar el Aviso de Privacidad Integral en /legal/privacidad.

Versión {{VERSION}} — Última actualización: {{FECHA_ACTUALIZACION}}.
$legal$, now(), now(), true);
  end if;
end $legal_privacy_simplified$;

do $legal_privacy_integral$ begin
  if not exists (select 1 from legal_documents where tipo = 'privacy_integral' and clinica_id is null and version = '0.2-borrador') then
    update legal_documents set activo = false where tipo = 'privacy_integral' and clinica_id is null and activo = true;
    insert into legal_documents (clinica_id, tipo, version, titulo, contenido, vigente_desde, publicado_en, activo)
    values (null, 'privacy_integral', '0.2-borrador', 'Aviso de Privacidad Integral', $legal$⚠ BORRADOR — pendiente de revisión por un abogado. Este texto no es un documento jurídico aprobado. No debe utilizarse como aviso de privacidad final sin esa revisión.

1. Responsable del tratamiento
{{RESPONSABLE}} (RFC {{RFC}}), con domicilio en {{DOMICILIO}}, teléfono {{TELEFONO}} y correo de privacidad {{CORREO_PRIVACIDAD}}.
[CONFIRMAR ABOGADO: quién es responsable y quién encargado depende del caso. SIRO es la plataforma tecnológica; en muchos escenarios la clínica decide las finalidades y medios del tratamiento de los datos de sus pacientes. No se afirma aquí una calificación única.]

2. Datos personales que se tratan
- Identificación: nombre, apellidos, fecha de nacimiento, sexo, CURP cuando aplica.
- Contacto: teléfono, WhatsApp (solo como dato de contacto), correo electrónico, domicilio.
- Datos de salud (SENSIBLES): antecedentes médicos y familiares, alergias, medicamentos, signos vitales, diagnósticos, tratamientos, expediente clínico, odontograma, periodontograma, fotografías, documentos y estudios, recetas, consentimientos y notas clínicas.
- Datos administrativos: citas y pagos.
- Datos técnicos de las personas usuarias del sistema: fechas de acceso y tipo de navegador o dispositivo (agente de usuario) para el control de sesiones y la auditoría. La aplicación no guarda la dirección IP en su base de datos; los proveedores de infraestructura pueden registrarla en sus propios registros técnicos. [CONFIRMAR con revisión técnica.]
[CONFIRMAR ABOGADO: tratamiento de datos de menores de edad y de personas representadas, si aplica.]

3. Datos personales sensibles y consentimiento
Tus datos de salud son datos personales sensibles. [CONFIRMAR ABOGADO: forma exigible del consentimiento (expreso y, en su caso, por escrito), cómo se obtiene y qué constancia se conserva. El sistema conserva evidencia de aceptaciones legales y registra consentimientos clínicos; la firma remota de consentimientos clínicos aún no existe.]

4. Finalidades
Finalidades necesarias para prestarte el servicio: atención odontológica, integración y conservación del expediente clínico, agenda de citas, recetas y documentos clínicos, y registro de pagos.
Finalidades secundarias: SIRO no realiza hoy envíos automáticos de recordatorios, encuestas ni comunicaciones informativas. [Si la clínica los realiza por sus propios medios, listar aquí esas finalidades y su mecanismo de oposición.]
[CONFIRMAR ABOGADO: cuáles finalidades requieren consentimiento y cuáles no.]

5. Transferencias
[DECISIÓN DEL ABOGADO: la ley vigente ya no exige listar las transferencias en el aviso integral; decidir si se informan de todos modos y cuáles existen.]

6. Encargados y proveedores
Participan proveedores tecnológicos para operar la plataforma (base de datos, autenticación y almacenamiento; hospedaje del sitio; correo del formulario de contacto, que no maneja datos de pacientes). El detalle está en /legal/proveedores.

7. Derechos ARCO
Puedes ejercer tus derechos de Acceso, Rectificación, Cancelación y Oposición escribiendo a {{CORREO_PRIVACIDAD}} o con el formulario de /legal/arco. Tu solicitud debe indicar el derecho concreto que quieres ejercer y acreditar tu identidad o, en su caso, la representación. El sistema exige verificar la identidad antes de atender una solicitud.
[CONFIRMAR ABOGADO: plazos de respuesta y de ejecución (fuentes secundarias consultadas indican 20 y 15 días hábiles; verificar en el texto oficial vigente) y gratuidad.]
Una solicitud de cancelación no autoriza la destrucción de información que la ley obliga a conservar: en ese caso se limita el acceso y se conserva solo durante el plazo exigible (ver sección 9).

8. Revocación del consentimiento y limitación del uso
Puedes revocar tu consentimiento o limitar el uso o divulgación de tus datos escribiendo a {{CORREO_PRIVACIDAD}}. [CONFIRMAR ABOGADO: efectos y excepciones de la revocación respecto de datos que deben conservarse.]

9. Conservación
Los datos se conservan durante los plazos que se describen en /legal/retencion, y se suprimen solo después de cumplido el plazo y de haber sido bloqueados. [CONFIRMAR ABOGADO.]

10. Cambios a este aviso
Los cambios se publican como una versión nueva con su fecha y se notifican por los medios que la ley exija. [CONFIRMAR ABOGADO: procedimiento de notificación.]

11. Autoridad
[CONFIRMAR ABOGADO: autoridad ante la que puede presentarse una inconformidad (según fuentes consultadas, la Secretaría Anticorrupción y Buen Gobierno desde el 21 de marzo de 2025).]

Versión {{VERSION}} — Última actualización: {{FECHA_ACTUALIZACION}}.
$legal$, now(), now(), true);
  end if;
end $legal_privacy_integral$;

do $legal_terms$ begin
  if not exists (select 1 from legal_documents where tipo = 'terms' and clinica_id is null and version = '0.2-borrador') then
    update legal_documents set activo = false where tipo = 'terms' and clinica_id is null and activo = true;
    insert into legal_documents (clinica_id, tipo, version, titulo, contenido, vigente_desde, publicado_en, activo)
    values (null, 'terms', '0.2-borrador', 'Términos y Condiciones', $legal$⚠ BORRADOR — pendiente de revisión por un abogado. No es un documento jurídico aprobado ni vinculante sin esa revisión.

1. Objeto
Estos Términos regulan el uso de SIRO, una plataforma de software para la gestión odontológica ofrecida por {{RESPONSABLE}}.

2. Definiciones
«SIRO»: la plataforma. «Clínica»: el establecimiento que contrata el servicio. «Usuario»: toda persona que accede con una cuenta. «Paciente»: la persona cuyos datos clínicos administra la Clínica en SIRO.

3-4. Cuenta y credenciales
Cada Usuario es responsable de la confidencialidad de sus credenciales y de lo que se haga con su cuenta. Las cuentas nuevas reciben una contraseña temporal que debe cambiarse antes de usar el sistema.

5-6. Uso permitido y prohibido
SIRO debe usarse solo para la gestión clínica y administrativa para la que fue diseñado. Queda prohibido acceder a información de pacientes sin relación con su atención, compartir credenciales o usar la plataforma para fines distintos.

7-10. Servicio, disponibilidad y mantenimiento
SIRO se ofrece como software como servicio. [TODO LEGAL: definir compromisos de disponibilidad (SLA) o aclarar que no se garantiza un SLA específico.]

11. Seguridad
SIRO aplica controles técnicos descritos en /legal/seguridad.

12-13. Datos personales y clínicos
El tratamiento de datos personales se rige por el Aviso de Privacidad. La Clínica es responsable de la exactitud de los datos clínicos que captura. [CONFIRMAR ABOGADO: el reparto de responsabilidades entre Clínica y SIRO respecto de los datos de los pacientes.]

14-16. Responsabilidades
La Clínica y el profesional de la salud responsable toman las decisiones clínicas. SIRO es una herramienta de apoyo: no diagnostica, no prescribe ni sustituye el criterio clínico. [TODO LEGAL: revisar el alcance de cualquier exclusión de responsabilidad para que no pretenda excluir lo que la ley no permite excluir.]

17-20. Proveedores externos
SIRO usa proveedores tecnológicos listados en /legal/proveedores y su disponibilidad puede depender de ellos. SIRO no integra hoy servicios de mensajería automatizada: el número de WhatsApp es solo un dato de contacto. El correo electrónico se usa para el formulario de contacto.

21. Almacenamiento
La información se almacena en la infraestructura descrita en /legal/proveedores y /legal/seguridad.

22-25. Pagos, suscripciones, cancelaciones y reembolsos
[TODO LEGAL: definir el modelo comercial (planes, periodicidad, cancelación y reembolsos) antes de publicar una versión final.]

26-28. Propiedad intelectual y contenido del cliente
La marca, el código, el diseño y la documentación de SIRO son de {{RESPONSABLE}}. La información clínica y administrativa que la Clínica captura es de la Clínica.

29-30. Suspensión y terminación
SIRO puede suspender el acceso por incumplimiento grave. [TODO LEGAL: definir procedimiento y plazos de notificación previa.]

31-32. Conservación y exportación
La información se conserva conforme a /legal/retencion y a la normativa aplicable. La Clínica puede solicitar la exportación de su información. [CONFIRMAR ABOGADO: alcance y plazos.]

33. Seguridad
Ver sección 11.

34. Limitaciones
[TODO LEGAL: definir límites de responsabilidad conforme a la ley aplicable.]

35. Soporte
Mediante los medios de contacto de /legal/contacto. [CONFIRMAR: que esa página exista y qué compromisos de soporte se ofrecen.]

36. Cambios
Los cambios se publican como una versión nueva y se notifican a los Usuarios según corresponda.

37. Jurisdicción
[TODO LEGAL: definir jurisdicción y legislación aplicable.]

38. Contacto
{{CORREO_PRIVACIDAD}}

Versión {{VERSION}} — Última actualización: {{FECHA_ACTUALIZACION}}.
$legal$, now(), now(), true);
  end if;
end $legal_terms$;

do $legal_cookies$ begin
  if not exists (select 1 from legal_documents where tipo = 'cookies' and clinica_id is null and version = '0.3-borrador') then
    update legal_documents set activo = false where tipo = 'cookies' and clinica_id is null and activo = true;
    insert into legal_documents (clinica_id, tipo, version, titulo, contenido, vigente_desde, publicado_en, activo)
    values (null, 'cookies', '0.3-borrador', 'Cookies y Tecnologías de Almacenamiento', $legal$⚠ BORRADOR — pendiente de revisión por un abogado. Este texto no es un documento jurídico aprobado.

SIRO no utiliza cookies HTTP tradicionales ni tecnologías de rastreo, analítica o publicidad. Utiliza almacenamiento del navegador (localStorage, IndexedDB y la caché de archivos de la aplicación), que guarda información en tu dispositivo. Se usa únicamente para:

1. Mantener tu sesión iniciada (necesario; no se puede desactivar).
2. Recordar tu preferencia de vista del odontograma (2D o 3D), si la configuras.
3. Recordar tu correo si activas «recordarme» al iniciar sesión.
4. Recordar tus preferencias sobre este aviso y si ocultaste el aviso de bienvenida.
5. Permitir el trabajo sin conexión: copia local de datos de la clínica, incluidos datos clínicos, y de los cambios pendientes de sincronizar; y archivos de la aplicación para que cargue sin internet. Al cerrar sesión se limpia la copia local, salvo los cambios pendientes de sincronizar.
6. Si activas el desbloqueo sin conexión: los datos necesarios para ese desbloqueo (PIN).

Ninguno de estos elementos se comparte con terceros ni se usa con fines publicitarios. Puedes revisar el inventario técnico y tus preferencias en /legal/cookies y /legal/cookies/preferencias. [CONFIRMAR con revisión técnica: que el inventario técnico publicado incluya los puntos 5 y 6.]
Si SIRO incorpora analítica, marketing o cookies HTTP, esta política se actualizará antes y se pedirá tu consentimiento cuando corresponda.

Versión {{VERSION}} — Última actualización: {{FECHA_ACTUALIZACION}}.
$legal$, now(), now(), true);
  end if;
end $legal_cookies$;

do $legal_security$ begin
  if not exists (select 1 from legal_documents where tipo = 'security' and clinica_id is null and version = '0.2-borrador') then
    update legal_documents set activo = false where tipo = 'security' and clinica_id is null and activo = true;
    insert into legal_documents (clinica_id, tipo, version, titulo, contenido, vigente_desde, publicado_en, activo)
    values (null, 'security', '0.2-borrador', 'Seguridad', $legal$⚠ BORRADOR — pendiente de revisión por un abogado. Este texto no es un documento jurídico aprobado. Este documento describe medidas TÉCNICAS reales de SIRO; no es una certificación ni una garantía de que sea invulnerable.

Autenticación y autorización: cada persona usuaria inicia sesión con credenciales propias; el acceso depende de su rol (propietario, odontólogo, asistente, recepción) y de los pacientes y sucursales que tenga asignados. Las cuentas creadas con una contraseña temporal deben cambiarla antes de usar el sistema: mientras no la cambien, el servidor les niega el acceso a los datos.

Aislamiento entre clínicas: se aplica en la propia base de datos (Row Level Security) y en las funciones del servidor, no solo en la interfaz.

Auditoría: los cambios sobre información clínica y las acciones administrativas quedan registrados con quién los hizo y cuándo; las personas usuarias no pueden fabricar eventos administrativos.

Control de sesiones: cada persona puede ver sus sesiones activas por dispositivo y cerrarlas (Configuración → Seguridad).

Cifrado en tránsito: la comunicación viaja cifrada (HTTPS/TLS) por la infraestructura de hospedaje.

Datos en el dispositivo: para poder trabajar sin conexión, el navegador puede guardar una copia local de datos clínicos. Al cerrar sesión se limpia, salvo los cambios pendientes de sincronizar, que se conservan para no perderlos. Usa dispositivos propios y con bloqueo de pantalla. [CONFIRMAR ABOGADO y revisión técnica: alcance de esta descripción.]

Almacenamiento: la información se aloja en la infraestructura de proveedores (ver /legal/proveedores).

Respaldos: dependen del procedimiento de respaldo del responsable y de las capacidades del proveedor. [CONFIRMAR: frecuencia, retención y prueba de restauración real, que aún está pendiente.]

Incidentes: se llevan en un registro estructurado visible para propietarios y administración. [CONFIRMAR ABOGADO: obligaciones y plazos de notificación.]

Versión {{VERSION}} — Última actualización: {{FECHA_ACTUALIZACION}}.
$legal$, now(), now(), true);
  end if;
end $legal_security$;

do $legal_retention$ begin
  if not exists (select 1 from legal_documents where tipo = 'retention' and clinica_id is null and version = '0.2-borrador') then
    update legal_documents set activo = false where tipo = 'retention' and clinica_id is null and activo = true;
    insert into legal_documents (clinica_id, tipo, version, titulo, contenido, vigente_desde, publicado_en, activo)
    values (null, 'retention', '0.2-borrador', 'Política de Conservación de Información', $legal$⚠ BORRADOR — pendiente de revisión por un abogado. Este texto no es un documento jurídico aprobado. Ningún plazo legal fue inventado: donde falta una definición aparece [DEFINIR].

Principios: la información se conserva por categoría y finalidad, no con una regla única; nada se elimina automáticamente; una retención legal (litigio, auditoría o investigación) suspende cualquier supresión; y antes de suprimir, la información se bloquea.

Expediente clínico (notas, diagnósticos, tratamientos, odontograma, periodontograma, recetas, consentimientos clínicos, fotografías y documentos clínicos): se conserva como mínimo 5 años contados desde la fecha del último acto médico registrado del paciente. [CONFIRMAR ABOGADO: fuente NOM-004-SSA3-2012, aplicación concreta y otras obligaciones vigentes.] No se elimina físicamente dentro de ese plazo ni mientras exista una retención legal. La supresión, vencido el plazo, solo procede por un procedimiento autorizado y queda registrada.

Documentación fiscal y contable, facturas, pagos y comprobantes: el plazo depende del tipo de documento y de la obligación fiscal (Código Fiscal de la Federación, arts. 30 y 67, que contemplan casos de efectos prolongados y plazos mayores). [DEFINIR con contador y abogado.]
Contratos y su documentación: [DEFINIR con asesoría jurídica.]
Autorizaciones, auditoría y documentos de soporte: [DEFINIR.]
Datos de cuenta de las personas usuarias: mientras la cuenta esté activa, más el plazo que se defina tras su baja. [DEFINIR.]
Consentimientos y versiones anteriores de documentos legales: se conservan como evidencia; no se sobrescriben. [CONFIRMAR ABOGADO: plazo y compatibilidad con la supresión de datos personales.]
Copias de respaldo y archivos almacenados: se rigen por el procedimiento de respaldo del responsable y por los plazos anteriores. [DEFINIR frecuencia y retención.]

Solicitudes ARCO: una solicitud de cancelación no autoriza destruir lo que debe conservarse; se bloquea el acceso y se conserva solo durante el plazo exigible.

Versión {{VERSION}} — Última actualización: {{FECHA_ACTUALIZACION}}.
$legal$, now(), now(), true);
  end if;
end $legal_retention$;

do $legal_data_processing_agreement$ begin
  if not exists (select 1 from legal_documents where tipo = 'data_processing_agreement' and clinica_id is null and version = '0.2-borrador') then
    update legal_documents set activo = false where tipo = 'data_processing_agreement' and clinica_id is null and activo = true;
    insert into legal_documents (clinica_id, tipo, version, titulo, contenido, vigente_desde, publicado_en, activo)
    values (null, 'data_processing_agreement', '0.2-borrador', 'Acuerdo de Tratamiento de Datos', $legal$⚠ BORRADOR — pendiente de revisión por un abogado. Este texto no es un documento jurídico aprobado. Describe conceptualmente la relación entre {{RESPONSABLE}} y la clínica que usa SIRO. La calificación jurídica exacta (quién es responsable y quién encargado) depende del caso y no se afirma aquí de forma absoluta.

1. Partes
{{RESPONSABLE}} pone a disposición de la clínica la plataforma SIRO para su expediente clínico y operación administrativa.
2. Objeto
El tratamiento de datos personales, incluidos datos de salud, que la clínica captura y administra en SIRO.
3. Categorías de datos y de titulares
Identificación, contacto, datos clínicos (sensibles), administrativos y técnicos (ver el Aviso de Privacidad Integral). Titulares: pacientes y personal de la clínica.
4. Instrucciones documentadas
La clínica determina las finalidades y medios del tratamiento de los datos de sus pacientes; {{RESPONSABLE}} los trata solo conforme a sus instrucciones y para prestar el servicio. [DECISIÓN DEL ABOGADO: forma de documentar las instrucciones.]
5. Confidencialidad y seguridad
Ver /legal/seguridad. [DECISIÓN DEL ABOGADO: compromisos de confidencialidad del personal con acceso.]
6. Subencargados y proveedores
Ver /legal/proveedores. [DECISIÓN DEL ABOGADO: autorización previa y notificación de cambios de proveedores.]
7. Derechos de los titulares
{{RESPONSABLE}} apoyará a la clínica con la atención de solicitudes ARCO mediante las funciones del sistema. [DECISIÓN DEL ABOGADO: plazos y alcance del apoyo.]
8. Incidentes
[TODO LEGAL: definir el procedimiento y los plazos de notificación de incidentes de seguridad entre {{RESPONSABLE}} y la clínica.]
9. Conservación y eliminación
Ver /legal/retencion. La eliminación de una clínica está sujeta a la política de conservación y a las retenciones legales vigentes.
10. Auditoría
[DECISIÓN DEL ABOGADO: derecho de la clínica a verificar el cumplimiento.]
11. Terminación
[TODO LEGAL: definir qué ocurre con la información si termina la relación: plazo de exportación y de eliminación.]

Versión {{VERSION}} — Última actualización: {{FECHA_ACTUALIZACION}}.
$legal$, now(), now(), true);
  end if;
end $legal_data_processing_agreement$;

commit;
