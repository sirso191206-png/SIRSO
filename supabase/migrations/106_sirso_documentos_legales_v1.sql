-- ============================================================
-- SIRO — Documentos legales, versión 1.0 y registro de aceptaciones
-- Migración 106. NUEVA: no edita ninguna migración anterior. Cada documento recibe una versión nueva (las anteriores se conservan, inactivas).
-- ------------------------------------------------------------
-- QUÉ HACE
--  1) Amplía los tipos de documento con `arco_procedure` y `consents` (la tabla solo admitía siete).
--  2) Publica la versión 1.0 de nueve documentos, redactados con la identidad del titular de SIRO (Eduardo Heriberto Iglesias Arines, persona física) como texto fijo; solo `{{VERSION}}`
--     y `{{FECHA_ACTUALIZACION}}` se resuelven con la propia versión. Citan artículos de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (texto vigente,
--     última reforma DOF 14-11-2025) y de la NOM-004-SSA3-2012 tal como figuran en sus textos oficiales. No se inventó RFC, razón social, certificación ni vínculo con institución alguna.
--  3) Integridad del registro de aceptación: un usuario ya no puede inscribir una versión cualquiera ni una fecha distinta de la real. Un disparador exige un documento VIGENTE de su
--     alcance, toma la versión del propio documento y fija la fecha en el servidor (solo para quien llega con sesión de usuario: el servidor y las restauraciones de respaldos conservan
--     la evidencia tal cual). Las aceptaciones siguen sin poder modificarse ni borrarse.
-- Publicar una versión nueva exige que las personas usuarias la acepten al iniciar sesión (la aplicación lo solicita). Seguro de re-ejecutar. Rollback: supabase/rollback/106_rollback.sql.
-- ============================================================
begin;

do $tipos$ declare v_def text;
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint where conrelid = 'public.legal_documents'::regclass and conname = 'legal_documents_tipo_check';
  if v_def is not null and v_def not like '%arco_procedure%' then
    execute 'alter table public.legal_documents drop constraint legal_documents_tipo_check';
    execute $c$alter table public.legal_documents add constraint legal_documents_tipo_check check (tipo in ('privacy_simplified','privacy_integral','terms','cookies','security','retention','data_processing_agreement','arco_procedure','consents','other'))$c$;
  end if;
end $tipos$;

create or replace function fn_validar_aceptacion_legal() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_doc legal_documents%rowtype;
begin
  -- Solo se protege a quien llega con SESIÓN DE USUARIO. Las inserciones de servidor (service_role, migraciones, restauración de un respaldo) conservan la evidencia TAL CUAL:
  -- si no, restaurar un respaldo reescribiría la fecha de cada aceptación y rechazaría las de versiones que ya no están vigentes.
  if auth.uid() is null then return new; end if;
  select * into v_doc from legal_documents where id = new.documento_id;
  if not found or not v_doc.activo then
    raise exception 'El documento no existe o no está vigente.' using errcode = 'P0001', hint = 'ACEPTACION_DOCUMENTO_NO_VIGENTE';
  end if;
  if v_doc.clinica_id is not null and v_doc.clinica_id is distinct from auth_clinica_id() then
    raise exception 'El documento no corresponde a tu clínica.' using errcode = 'P0001', hint = 'ACEPTACION_DOCUMENTO_AJENO';
  end if;
  new.documento_version := v_doc.version;   -- la versión es la del documento, no la que diga el cliente
  new.aceptado_en := now();                 -- la fecha la fija el servidor
  return new;
end;
$$;
revoke all on function fn_validar_aceptacion_legal() from public, anon, authenticated;
drop trigger if exists trg_validar_aceptacion_legal on public.legal_acceptances;
create trigger trg_validar_aceptacion_legal before insert on public.legal_acceptances for each row execute function fn_validar_aceptacion_legal();

do $legal_privacy_simplified$ begin
  if not exists (select 1 from legal_documents where tipo = 'privacy_simplified' and clinica_id is null and version = '1.0') then
    update legal_documents set activo = false where tipo = 'privacy_simplified' and clinica_id is null and activo = true;
    insert into legal_documents (clinica_id, tipo, version, titulo, contenido, vigente_desde, publicado_en, activo)
    values (null, 'privacy_simplified', '1.0', 'Aviso de Privacidad Simplificado', $legal$Responsable: Eduardo Heriberto Iglesias Arines, persona física, titular y prestador del servicio SIRO (Solución Integral de Registro Odontológico), con domicilio en Calle Laureles número 8, San Francisco Chiautla, San Andrés Chiautla, Estado de México, México.

Datos personales que tratamos como responsable: identificación y contacto de las personas usuarias y de las clínicas (nombre, correo, teléfono, cargo o rol), datos de cuenta y de uso del sistema (fechas de acceso, tipo de navegador o dispositivo y registros de actividad), datos de facturación y de suscripción, y los mensajes que envías por el formulario de contacto. No tratamos datos personales sensibles de las personas usuarias.

Datos de pacientes: los datos de las y los pacientes de una clínica, incluidos datos de salud (que son datos personales sensibles), los captura cada clínica para atenderlos. Cuando la clínica determina las finalidades y los medios de esa atención, la clínica es la responsable de esos datos y SIRO los trata únicamente por cuenta de ella, como persona encargada.

Finalidades que derivan de la relación con SIRO y no requieren un consentimiento adicional: crear y administrar tu cuenta, prestar el servicio, garantizar la seguridad y la auditoría, atender el soporte, facturar y administrar suscripciones, y cumplir obligaciones legales. Finalidades que requieren tu consentimiento: SIRO no realiza actualmente ninguna otra.

Opciones y medios para limitar el uso o la divulgación de tus datos, y para ejercer tus derechos de acceso, rectificación, cancelación y oposición (ARCO): escribe a sirso191206@gmail.com o utiliza el formulario de /legal/arco.

El Aviso de Privacidad Integral está disponible en /legal/privacidad.

Versión {{VERSION}} — Entrada en vigor: {{FECHA_ACTUALIZACION}}.
$legal$, now(), now(), true);
  end if;
end $legal_privacy_simplified$;

do $legal_privacy_integral$ begin
  if not exists (select 1 from legal_documents where tipo = 'privacy_integral' and clinica_id is null and version = '1.0') then
    update legal_documents set activo = false where tipo = 'privacy_integral' and clinica_id is null and activo = true;
    insert into legal_documents (clinica_id, tipo, version, titulo, contenido, vigente_desde, publicado_en, activo)
    values (null, 'privacy_integral', '1.0', 'Aviso de Privacidad Integral', $legal$1. Identidad y domicilio del responsable
Eduardo Heriberto Iglesias Arines, persona física, titular y prestador del servicio SIRO (Solución Integral de Registro Odontológico), con domicilio en Calle Laureles número 8, San Francisco Chiautla, San Andrés Chiautla, Estado de México, México. Correo para asuntos de privacidad y derechos ARCO: sirso191206@gmail.com. Teléfono de contacto: 5525338668. SIRO no es una sociedad mercantil.

2. Qué papel tiene cada parte
a) Personas usuarias y clínicas que contratan SIRO (propietarios, odontólogos, asistentes y personal de recepción): respecto de sus datos de cuenta, contacto, uso, facturación y soporte, el responsable es el titular de SIRO.
b) Pacientes de una clínica: sus datos, incluidos los de salud, los captura y usa la clínica para atenderlos. Cuando la clínica determina las finalidades y los medios de esa atención, la clínica es la responsable y el titular de SIRO actúa como persona encargada, es decir, trata esos datos por cuenta de la clínica (artículo 2, fracción XII, de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares, en adelante «la Ley»). Si eres paciente, el aviso de privacidad aplicable a tus datos clínicos es el de tu clínica y tus solicitudes sobre ellos deben dirigirse a ella.

3. Datos personales que se tratan como responsable
Identificación y contacto: nombre, correo, teléfono, cargo o rol y clínica a la que perteneces. Cuenta y seguridad: credenciales (las contraseñas las gestiona el proveedor de autenticación), sesiones activas (fecha, última actividad y tipo de navegador o dispositivo) y registros de actividad y de auditoría. Facturación y suscripción: datos de la clínica, plan contratado y vigencia. Soporte: nombre, correo y mensaje que envías por el formulario de contacto. Datos personales sensibles: SIRO no solicita ni trata datos sensibles de sus personas usuarias. La aplicación no guarda la dirección IP en su base de datos; los proveedores de infraestructura pueden registrarla en sus propios registros técnicos.

4. Datos de pacientes que SIRO trata como encargado
Identificación y contacto; datos de salud, que son datos personales sensibles (antecedentes, alergias, diagnósticos, tratamientos, odontograma, periodontograma, notas clínicas, recetas, signos vitales, fotografías y documentos clínicos); y datos administrativos (citas y pagos). SIRO no los usa para finalidades propias. El titular de SIRO, como administrador de la plataforma, puede acceder a la información de una clínica solo para soporte, seguridad y mantenimiento, y esos accesos a datos personales de una clínica quedan registrados. El artículo 8 de la Ley exige el consentimiento expreso y por escrito de la persona titular para tratar datos sensibles, mediante firma autógrafa, firma electrónica o cualquier mecanismo de autenticación: obtenerlo y conservar su constancia corresponde a la clínica. SIRO ofrece funciones para registrar consentimientos clínicos (ver /legal/consentimientos).

5. Finalidades
Finalidades que derivan de la relación jurídica con SIRO (artículo 9, fracción IV, de la Ley): crear y administrar la cuenta, prestar el servicio, garantizar la seguridad y la auditoría, atender el soporte, facturar y administrar suscripciones, y cumplir obligaciones legales.
Finalidades que requieren tu consentimiento: SIRO no realiza actualmente publicidad, perfilado, encuestas ni comunicaciones comerciales. Si las incorpora, lo informará en una nueva versión de este aviso y te pedirá tu consentimiento antes de usar tus datos para esa finalidad (artículo 11 de la Ley).

6. Opciones y medios para limitar el uso o la divulgación
Puedes escribir a sirso191206@gmail.com para pedir que limitemos el uso de tus datos. SIRO no envía publicidad, por lo que no existe una lista de la cual darse de baja.

7. Derechos ARCO y revocación del consentimiento
Puedes ejercer tus derechos de acceso, rectificación, cancelación y oposición, por ti o por medio de representante, con el formulario de /legal/arco o escribiendo a sirso191206@gmail.com. La persona designada para atender las solicitudes (artículo 29 de la Ley) es Eduardo Heriberto Iglesias Arines. El procedimiento, los requisitos y los plazos están en /legal/arco. Puedes revocar tu consentimiento en cualquier momento, sin efectos retroactivos, por los mismos medios (artículo 7 de la Ley); la revocación no procede respecto de datos que deban conservarse por disposición legal.

8. Transferencias y comunicaciones de datos
SIRO no transfiere tus datos personales a terceros para fines propios de estos. Se comunican datos a los proveedores de infraestructura que actúan por cuenta de SIRO como personas encargadas (Supabase, Vercel y Resend; ver /legal/proveedores), cuya infraestructura puede ubicarse fuera de territorio mexicano, y a autoridades cuando una disposición legal o una resolución fundada y motivada lo exija (artículos 9 y 36 de la Ley). No existen transferencias sujetas a tu aceptación.

9. Conservación
Los plazos de conservación, el bloqueo y la supresión se describen en /legal/retencion. Los datos que dejan de ser necesarios se suprimen previo bloqueo y una vez concluido el plazo de conservación (artículo 10 de la Ley).

10. Seguridad, confidencialidad e incidentes
SIRO mantiene medidas de seguridad administrativas, técnicas y físicas descritas en /legal/seguridad (artículo 18 de la Ley) y controles para que quienes intervienen en el tratamiento guarden confidencialidad (artículo 20). Si ocurre una vulneración de seguridad que afecte de forma significativa tus derechos patrimoniales o morales, te lo informaremos de forma inmediata (artículo 19).

11. Almacenamiento en tu dispositivo
SIRO usa almacenamiento del navegador para mantener tu sesión y permitir el trabajo sin conexión; el detalle está en /legal/cookies.

12. Menores de edad
SIRO está dirigido a clínicas y profesionales; no ofrece cuentas a menores de edad. Los datos de pacientes menores los trata su clínica como responsable.

13. Cambios a este aviso
Cada cambio se publica en esta página como una nueva versión, con su fecha de entrada en vigor, y se comunica a las personas usuarias con cuenta al iniciar sesión, donde se solicita aceptar la versión vigente. Las versiones anteriores se conservan como historial.

14. Autoridad
Si consideras que tu solicitud no fue atendida conforme a la Ley, puedes presentar una solicitud de protección de datos ante la Secretaría Anticorrupción y Buen Gobierno, dentro de los quince días siguientes a la fecha en que se te comunique la respuesta o, si no la recibes, a partir de que venza el plazo de respuesta (artículo 40 de la Ley).

Versión {{VERSION}} — Entrada en vigor: {{FECHA_ACTUALIZACION}}.
$legal$, now(), now(), true);
  end if;
end $legal_privacy_integral$;

do $legal_terms$ begin
  if not exists (select 1 from legal_documents where tipo = 'terms' and clinica_id is null and version = '1.0') then
    update legal_documents set activo = false where tipo = 'terms' and clinica_id is null and activo = true;
    insert into legal_documents (clinica_id, tipo, version, titulo, contenido, vigente_desde, publicado_en, activo)
    values (null, 'terms', '1.0', 'Términos y Condiciones', $legal$1. Quién presta el servicio
SIRO (Solución Integral de Registro Odontológico) es un servicio de software para la gestión de consultorios y clínicas odontológicas, prestado por Eduardo Heriberto Iglesias Arines, persona física, con domicilio en Calle Laureles número 8, San Francisco Chiautla, San Andrés Chiautla, Estado de México, México. Contacto: sirso191206@gmail.com. SIRO no es una sociedad mercantil.

2. Definiciones
«SIRO» es la plataforma y el servicio. «Clínica» es el consultorio o establecimiento odontológico que contrata el servicio. «Usuario» es la persona que accede con una cuenta de una clínica. «Paciente» es la persona cuyos datos administra la clínica en SIRO.

3. Cuentas y credenciales
La clínica contrata el servicio por medio de su propietario, que crea las cuentas de su personal con un rol (propietario, odontólogo, asistente o recepción). Cada cuenta nueva recibe una contraseña temporal que debe cambiarse antes de usar el sistema. Cada Usuario es responsable de la confidencialidad de sus credenciales y de lo que se haga con su cuenta; no deben compartirse.

4. Uso permitido y prohibido
SIRO debe usarse solo para la gestión clínica y administrativa para la que fue diseñado. Está prohibido acceder a información de pacientes sin relación con su atención, compartir credenciales, intentar acceder a datos de otra clínica, interferir con la seguridad o el funcionamiento del servicio y usarlo para fines ilícitos.

5. Funciones del servicio y planes
SIRO se ofrece por suscripción. El plan contratado determina las funciones y los límites disponibles (por ejemplo, usuarios, sucursales y almacenamiento). Las condiciones económicas del plan (precio y periodicidad) se informan al contratar y constan en el comprobante o acuerdo correspondiente.

6. Disponibilidad y soporte
SIRO se presta tal como está disponible y no garantiza un nivel de disponibilidad específico. Pueden existir interrupciones por mantenimiento, fallas de proveedores o causas ajenas. El soporte se atiende por el correo sirso191206@gmail.com y por el formulario de contacto.

7. Responsabilidad clínica
SIRO es una herramienta de apoyo: no diagnostica, no prescribe, no decide tratamientos ni sustituye el criterio del profesional de la salud. Las decisiones clínicas, el contenido del expediente y su exactitud son responsabilidad de la clínica y del profesional que lo registra. La clínica es responsable de cumplir las obligaciones que la ley le impone respecto de sus pacientes, incluidos el aviso de privacidad, el consentimiento y la conservación del expediente.

8. Datos personales
El tratamiento de datos personales se rige por el Aviso de Privacidad (/legal/privacidad) y, respecto de los datos de pacientes, por el Acuerdo de Tratamiento de Datos entre SIRO y la clínica (/legal/acuerdo-tratamiento-datos). La información clínica y administrativa que la clínica captura es de la clínica.

9. Seguridad
SIRO aplica las medidas descritas en /legal/seguridad. Ningún sistema es invulnerable: SIRO no garantiza la ausencia absoluta de incidentes.

10. Proveedores externos
SIRO usa proveedores de infraestructura (/legal/proveedores) y su disponibilidad puede depender de ellos. SIRO no integra servicios de mensajería automatizada: el número de WhatsApp es solo un dato de contacto. El correo electrónico se usa para el formulario de contacto.

11. Propiedad intelectual
La marca, el código, el diseño y la documentación de SIRO pertenecen a su titular. La clínica recibe una licencia de uso del servicio mientras su suscripción esté vigente, personal, limitada y no transferible. El contenido que la clínica captura le pertenece.

12. Suspensión y terminación
La clínica puede cancelar su suscripción en cualquier momento escribiendo a sirso191206@gmail.com; la cancelación surte efectos al terminar el periodo ya contratado y los reembolsos se rigen por lo acordado al contratar y por la ley aplicable. SIRO puede suspender el acceso por incumplimiento grave de estos Términos o por falta de pago, avisando a la clínica por correo. La cancelación de la suscripción no elimina el expediente clínico: su conservación se rige por /legal/retencion, y la clínica puede solicitar la exportación de su información por las funciones disponibles o por escrito.

13. Limitación de responsabilidad
En la medida permitida por la ley, SIRO no responde por daños indirectos, pérdida de ingresos ni por decisiones clínicas tomadas con base en la información registrada. Nada en estos Términos excluye las responsabilidades que la ley no permite excluir.

14. Aceptación y cambios
Al usar SIRO, el Usuario acepta estos Términos; la aplicación registra qué versión aceptó cada persona, con fecha y hora. Los cambios se publican como una nueva versión con su fecha de entrada en vigor y se solicita aceptarla al iniciar sesión; las versiones anteriores se conservan como historial.

15. Ley aplicable y jurisdicción
Estos Términos se rigen por las leyes federales de los Estados Unidos Mexicanos y, en lo que corresponda, por las del Estado de México. Para su interpretación y cumplimiento serán competentes los tribunales del Estado de México, sin perjuicio de los derechos que la ley reconozca a quien contrata como consumidor.

Versión {{VERSION}} — Entrada en vigor: {{FECHA_ACTUALIZACION}}.
$legal$, now(), now(), true);
  end if;
end $legal_terms$;

do $legal_cookies$ begin
  if not exists (select 1 from legal_documents where tipo = 'cookies' and clinica_id is null and version = '1.0') then
    update legal_documents set activo = false where tipo = 'cookies' and clinica_id is null and activo = true;
    insert into legal_documents (clinica_id, tipo, version, titulo, contenido, vigente_desde, publicado_en, activo)
    values (null, 'cookies', '1.0', 'Cookies y Tecnologías de Almacenamiento', $legal$SIRO no utiliza cookies HTTP tradicionales ni tecnologías de rastreo, analítica o publicidad. Utiliza almacenamiento del navegador (localStorage, IndexedDB y la caché de archivos de la aplicación), que guarda información en tu dispositivo. Se usa únicamente para lo siguiente:

1. Mantener tu sesión iniciada (necesario para que SIRO funcione; no se puede desactivar).
2. Recordar tu preferencia de vista del odontograma (2D o 3D), si la configuras.
3. Recordar tu correo si activas «recordarme» al iniciar sesión.
4. Recordar tus preferencias sobre este aviso y si ocultaste el aviso de bienvenida.
5. Permitir el trabajo sin conexión: una copia local de datos de la clínica, incluidos datos clínicos, y de los cambios pendientes de sincronizar, además de los archivos de la aplicación para que cargue sin internet. Al cerrar sesión se limpia la copia local, salvo los cambios pendientes de sincronizar, que se conservan para no perder información.
6. Si activas el desbloqueo sin conexión: los datos necesarios para ese desbloqueo (PIN).

Ninguno de estos elementos se comparte con terceros ni se usa con fines publicitarios. Usa SIRO en dispositivos propios y con bloqueo de pantalla, sobre todo si trabajas sin conexión. Puedes revisar el inventario técnico y tus preferencias en /legal/cookies/preferencias y borrar los datos del sitio desde la configuración de tu navegador. Si SIRO incorpora analítica, publicidad o cookies HTTP, esta política se actualizará antes de que entren en uso y se pedirá tu consentimiento cuando corresponda.

Versión {{VERSION}} — Entrada en vigor: {{FECHA_ACTUALIZACION}}.
$legal$, now(), now(), true);
  end if;
end $legal_cookies$;

do $legal_security$ begin
  if not exists (select 1 from legal_documents where tipo = 'security' and clinica_id is null and version = '1.0') then
    update legal_documents set activo = false where tipo = 'security' and clinica_id is null and activo = true;
    insert into legal_documents (clinica_id, tipo, version, titulo, contenido, vigente_desde, publicado_en, activo)
    values (null, 'security', '1.0', 'Seguridad y Protección de Datos', $legal$Este documento describe medidas técnicas y organizativas reales de SIRO; no es una certificación ni una garantía de que el sistema sea invulnerable (artículo 18 de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares).

Autenticación y roles. Cada persona inicia sesión con credenciales propias gestionadas por el proveedor de autenticación. El acceso depende de su rol (propietario, odontólogo, asistente o recepción) y de los pacientes y sucursales que tenga asignados. Las cuentas nuevas reciben una contraseña temporal y, mientras no la cambien, el servidor les niega el acceso a los datos.

Aislamiento entre clínicas. Se aplica en la propia base de datos (Row Level Security) y en las funciones del servidor, no solo en la interfaz: aunque se manipulara una petición, la base de datos rechaza el acceso a información de otra clínica.

Auditoría. Los cambios sobre información clínica y las acciones administrativas se registran con quién los hizo y cuándo. Las personas usuarias no pueden fabricar eventos administrativos. Cada documento legal conserva su historial de versiones y el registro de quién aceptó cada una.

Control de sesiones. Cada persona puede ver sus sesiones activas por dispositivo y cerrarlas desde Configuración → Seguridad.

Confidencialidad. Quienes tienen acceso a datos de pacientes están sujetos al secreto profesional y a las obligaciones de confidencialidad del Acuerdo de Tratamiento de Datos; la ley exige que subsistan aun después de terminar la relación (artículo 20).

Cifrado en tránsito. La comunicación entre tu navegador y los servidores viaja cifrada (HTTPS/TLS), provisto por la infraestructura de hospedaje.

Datos en el dispositivo. Para trabajar sin conexión, el navegador puede guardar una copia local de datos clínicos. Al cerrar sesión se limpia, salvo los cambios pendientes de sincronizar, que se conservan para no perderlos. Usa dispositivos propios y con bloqueo de pantalla.

Almacenamiento y respaldos. La información se aloja en la infraestructura de proveedores (ver /legal/proveedores). Los respaldos dependen de las capacidades del proveedor y del procedimiento de respaldo de SIRO; SIRO no garantiza la recuperación de toda la información en cualquier circunstancia.

Incidentes. SIRO cuenta con un registro de incidentes de seguridad. Si una vulneración afecta de forma significativa los derechos patrimoniales o morales de las personas titulares, se les informa de forma inmediata (artículo 19 de la Ley) y, tratándose de datos de pacientes, a la clínica responsable.

Versión {{VERSION}} — Entrada en vigor: {{FECHA_ACTUALIZACION}}.
$legal$, now(), now(), true);
  end if;
end $legal_security$;

do $legal_retention$ begin
  if not exists (select 1 from legal_documents where tipo = 'retention' and clinica_id is null and version = '1.0') then
    update legal_documents set activo = false where tipo = 'retention' and clinica_id is null and activo = true;
    insert into legal_documents (clinica_id, tipo, version, titulo, contenido, vigente_desde, publicado_en, activo)
    values (null, 'retention', '1.0', 'Conservación, Bloqueo y Supresión de Información', $legal$Principios. La información se conserva por categoría y finalidad, no con una regla única. Nada se elimina de forma automática. Una retención legal (por ejemplo, un litigio, una auditoría o una investigación) suspende cualquier supresión mientras esté activa. Los datos que dejan de ser necesarios se suprimen previo bloqueo y una vez concluido el plazo de conservación (artículo 10 de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares); el bloqueo consiste en conservarlos solo para determinar responsabilidades, sin darles otro tratamiento, hasta el plazo de prescripción legal o contractual (artículo 2, fracción III). Actualmente el bloqueo se aplica mediante la restricción administrativa del acceso; SIRO no tiene un estado técnico automático de bloqueo ni ofrece anonimización automática de expedientes.

Expediente clínico (notas, diagnósticos, tratamientos, odontograma, periodontograma, recetas, consentimientos clínicos, fotografías y documentos clínicos). Se conserva como mínimo 5 años contados a partir de la fecha del último acto médico registrado del paciente (NOM-004-SSA3-2012, numeral 5.4). La conservación es obligación de la clínica; SIRO la conserva por cuenta de ella. No se elimina físicamente dentro de ese plazo ni mientras exista una retención legal; la supresión, vencido el plazo, solo procede por un procedimiento autorizado que queda registrado. Cancelar una suscripción no elimina el expediente clínico.

Documentación fiscal y contable, facturas, pagos y comprobantes. Se conservan durante los plazos que el Código Fiscal de la Federación establece para cada tipo de documento y obligación.

Contratos y documentación administrativa. Durante la relación y hasta el plazo de prescripción de las acciones derivadas de ella.

Datos de cuenta de las personas usuarias. Mientras la cuenta esté activa y, después, solo el tiempo necesario para determinar responsabilidades.

Registros de auditoría y seguridad. Mientras sean necesarios para la seguridad del servicio y para determinar responsabilidades.

Mensajes del formulario de contacto. El tiempo necesario para atender la solicitud.

Datos sobre incumplimiento de obligaciones contractuales. Se eliminan transcurridos setenta y dos meses contados desde la fecha del incumplimiento (artículo 10 de la Ley).

Consentimientos, aceptaciones y versiones de documentos legales. Se conservan como evidencia y no se modifican ni se borran, durante la relación y el plazo de prescripción de las acciones derivadas de ella.

Respaldos, archivos adjuntos y copias en el dispositivo. Los archivos adjuntos (fotografías, documentos y logos) se conservan con el expediente al que pertenecen. Los respaldos conservan lo que contenían hasta que su propio ciclo de retención los reemplaza. La copia local del navegador se limpia al cerrar sesión, salvo los cambios pendientes de sincronizar.

Solicitudes de cancelación (ARCO). Una solicitud de cancelación no autoriza destruir información que la ley obliga a conservar (artículo 25 de la Ley): en ese caso se limita su uso y se conserva solo durante el plazo exigible.

Terminación de la relación. Al terminar la relación con una clínica, SIRO conserva su información clínica conforme a esta política, la bloquea cuando corresponda y la suprime o devuelve cuando concluya el plazo y no exista retención legal. La información comercial y operativa se trata conforme a las categorías anteriores.

Versión {{VERSION}} — Entrada en vigor: {{FECHA_ACTUALIZACION}}.
$legal$, now(), now(), true);
  end if;
end $legal_retention$;

do $legal_data_processing_agreement$ begin
  if not exists (select 1 from legal_documents where tipo = 'data_processing_agreement' and clinica_id is null and version = '1.0') then
    update legal_documents set activo = false where tipo = 'data_processing_agreement' and clinica_id is null and activo = true;
    insert into legal_documents (clinica_id, tipo, version, titulo, contenido, vigente_desde, publicado_en, activo)
    values (null, 'data_processing_agreement', '1.0', 'Acuerdo de Tratamiento de Datos entre SIRO y la Clínica', $legal$1. Partes
Eduardo Heriberto Iglesias Arines, persona física, titular y prestador del servicio SIRO, con domicilio en Calle Laureles número 8, San Francisco Chiautla, San Andrés Chiautla, Estado de México, México y correo sirso191206@gmail.com («SIRO»); y la clínica o consultorio que contrata el servicio, representada por su propietario al aceptar este acuerdo («la Clínica»).

2. Papeles de cada parte
Respecto de los datos de las y los pacientes que la Clínica captura en SIRO, la Clínica determina las finalidades y los medios del tratamiento y es la responsable; SIRO es persona encargada y los trata por cuenta de la Clínica (artículo 2, fracción XII, de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares, «la Ley»). Respecto de los datos de la Clínica y de su personal (cuenta, contacto, facturación, soporte y uso), SIRO es responsable según su Aviso de Privacidad. Si en un caso concreto la Clínica y SIRO determinan conjuntamente las finalidades o los medios, se aplicará la calificación que corresponda a ese tratamiento.

3. Objeto y datos
Alojar, procesar y mostrar a la Clínica la información de sus pacientes y de su operación para prestar el servicio SIRO: identificación y contacto, datos de salud (datos personales sensibles), datos administrativos y datos técnicos. Titulares: pacientes de la Clínica y personal que usa SIRO.

4. Instrucciones
SIRO trata esos datos solo para prestar el servicio y conforme a las instrucciones de la Clínica, que se dan por medio de las funciones del sistema, de este acuerdo y de los Términos. SIRO no los usa para finalidades propias ni los comunica a terceros salvo los proveedores descritos en la cláusula 7 o por mandato de autoridad competente.

5. Obligaciones de la Clínica
Informar a sus pacientes mediante su propio aviso de privacidad; obtener el consentimiento expreso y por escrito para los datos sensibles (artículo 8 de la Ley) y las demás autorizaciones aplicables; mantener la exactitud del expediente; conservar el expediente conforme a la ley sanitaria; y decidir quién de su personal accede y con qué rol.

6. Confidencialidad y seguridad
SIRO mantiene las medidas descritas en /legal/seguridad (artículo 18 de la Ley) y guarda confidencialidad sobre los datos de pacientes, obligación que subsiste después de terminar la relación (artículo 20). El personal de la Clínica con acceso está sujeto al secreto profesional. El titular de SIRO, como administrador de la plataforma, puede acceder a la información de la Clínica solo para soporte, seguridad y mantenimiento, y esos accesos a datos personales de la Clínica quedan registrados.

7. Proveedores
Para operar el servicio, SIRO usa proveedores de infraestructura que tratan datos por cuenta de SIRO (Supabase, Vercel y Resend; ver /legal/proveedores). Al aceptar este acuerdo, la Clínica autoriza su uso. SIRO publicará en /legal/proveedores cualquier cambio de proveedores que involucre datos de pacientes, y exige a sus proveedores condiciones de seguridad y confidencialidad acordes.

8. Derechos de las personas titulares
Cuando un paciente ejerza derechos ARCO ante SIRO sobre datos de la Clínica, SIRO se lo indicará y remitirá la solicitud a la Clínica (artículo 32, segundo párrafo, de la Ley). SIRO apoya a la Clínica con las funciones del sistema para atender solicitudes de acceso, rectificación, cancelación u oposición.

9. Incidentes de seguridad
Si SIRO tiene conocimiento de una vulneración que afecte datos de pacientes de la Clínica, la informará de forma inmediata al correo registrado de la Clínica, con la información disponible para que pueda actuar conforme al artículo 19 de la Ley.

10. Conservación, devolución y supresión
Se rige por /legal/retencion. La cancelación de la suscripción no elimina el expediente clínico. Antes y después de la terminación la Clínica puede exportar su información por las funciones del sistema o solicitarla por escrito. La supresión solo procede cuando concluya el plazo de conservación y no exista retención legal.

11. Verificación
A solicitud de la Clínica, SIRO le proporcionará la información razonable sobre las medidas y los proveedores que intervienen en el tratamiento de sus datos.

12. Vigencia
Este acuerdo rige mientras SIRO trate datos de la Clínica y se acepta electrónicamente por el propietario de la Clínica; la aplicación registra la versión aceptada, la fecha y la persona.

Versión {{VERSION}} — Entrada en vigor: {{FECHA_ACTUALIZACION}}.
$legal$, now(), now(), true);
  end if;
end $legal_data_processing_agreement$;

do $legal_arco_procedure$ begin
  if not exists (select 1 from legal_documents where tipo = 'arco_procedure' and clinica_id is null and version = '1.0') then
    update legal_documents set activo = false where tipo = 'arco_procedure' and clinica_id is null and activo = true;
    insert into legal_documents (clinica_id, tipo, version, titulo, contenido, vigente_desde, publicado_en, activo)
    values (null, 'arco_procedure', '1.0', 'Procedimiento para Solicitudes de Derechos ARCO', $legal$Quién puede solicitarlo. La persona titular de los datos o su representante legal (artículos 21 y 27 de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares, «la Ley»). El ejercicio de un derecho no es requisito previo ni impide el ejercicio de otro.

Derechos. Acceso (conocer tus datos y las condiciones de su tratamiento), Rectificación (corregir datos inexactos, incompletos o desactualizados), Cancelación (que dejen de estar en posesión del responsable, previo bloqueo) y Oposición (que cese el tratamiento por causa legítima) (artículos 22 a 26).

Si tus datos son de paciente. Los datos clínicos de un paciente los controla su clínica, que es la responsable. Dirige tu solicitud a tu clínica; si la envías a SIRO, se te indicará que SIRO no es el responsable y se remitirá a la clínica (artículo 32, segundo párrafo).

Dónde presentarla. Con el formulario de esta página o por correo a sirso191206@gmail.com. La persona designada para atender las solicitudes (artículo 29) es Eduardo Heriberto Iglesias Arines.

Qué debe contener. (1) Tu nombre y un domicilio o medio para recibir notificaciones; (2) documentos que acrediten tu identidad o, en su caso, la identidad y personalidad de tu representante; (3) la descripción clara y precisa de los datos sobre los que quieres ejercer el derecho (salvo en el acceso); (4) el derecho que quieres ejercer o lo que solicitas; y (5) cualquier elemento que facilite localizar tus datos. Para rectificar, indica las modificaciones y aporta la documentación que las sustente (artículos 28 y 30).

Plazos. SIRO te comunicará su determinación en un máximo de veinte días hábiles contados desde que reciba la solicitud y, si procede, la hará efectiva dentro de los quince días hábiles siguientes. Ambos plazos pueden ampliarse una sola vez por un periodo igual si las circunstancias lo justifican (artículo 31 y artículo 2, fracción VIII).

Costo. El ejercicio de los derechos ARCO es gratuito; solo pueden cobrarse los costos de reproducción, copias o envío. Si reiteras la solicitud en menos de doce meses, el costo no será mayor a tres veces la Unidad de Medida y Actualización vigente, salvo cambios sustanciales al aviso de privacidad (artículo 34).

Cancelación y bloqueo. La cancelación da lugar a un periodo de bloqueo tras el cual se suprime el dato (artículo 24). No se cancelarán los datos cuando sean necesarios para el cumplimiento de un contrato, deban tratarse por disposición legal o sean objeto de tratamiento para el diagnóstico médico o la gestión de servicios de salud por un profesional sujeto al secreto profesional, entre otros supuestos del artículo 25. Por eso la cancelación de un expediente clínico no procede mientras corra su plazo de conservación (ver /legal/retencion).

Cuándo puede negarse. Cuando no se acredite la identidad o la representación, los datos no estén en posesión del responsable, se lesionen derechos de un tercero, exista un impedimento legal o resolución de autoridad, o el derecho ya se haya ejercido (artículo 33). La negativa se motiva y puede ser parcial.

Si no estás conforme. Puedes presentar una solicitud de protección de datos ante la Secretaría Anticorrupción y Buen Gobierno dentro de los quince días siguientes a la respuesta o, si no la recibes, desde que venza el plazo de respuesta (artículo 40).

Versión {{VERSION}} — Entrada en vigor: {{FECHA_ACTUALIZACION}}.
$legal$, now(), now(), true);
  end if;
end $legal_arco_procedure$;

do $legal_consents$ begin
  if not exists (select 1 from legal_documents where tipo = 'consents' and clinica_id is null and version = '1.0') then
    update legal_documents set activo = false where tipo = 'consents' and clinica_id is null and activo = true;
    insert into legal_documents (clinica_id, tipo, version, titulo, contenido, vigente_desde, publicado_en, activo)
    values (null, 'consents', '1.0', 'Consentimientos y Autorizaciones', $legal$Este documento explica qué consentimientos y autorizaciones intervienen en SIRO, quién los obtiene y cómo se registran.

1. Aceptación de los documentos de SIRO. Al iniciar sesión, cada persona usuaria debe aceptar los Términos y Condiciones y el Aviso de Privacidad vigentes; el propietario de la clínica acepta además el Acuerdo de Tratamiento de Datos en nombre de la clínica. SIRO registra la versión aceptada, la fecha y hora (que fija el servidor) y la persona. Cuando se publica una versión nueva se solicita aceptarla de nuevo; las aceptaciones anteriores se conservan como evidencia y no se modifican.

2. Consentimiento de los pacientes sobre sus datos de salud. Los datos de salud son datos personales sensibles. La ley exige el consentimiento expreso y por escrito del paciente (firma autógrafa, firma electrónica o cualquier mecanismo de autenticación) (artículo 8 de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares). Lo obtiene la clínica, que es la responsable de esos datos, junto con su aviso de privacidad. SIRO no sustituye ni presume ese consentimiento: la aceptación de los Términos por la clínica no autoriza por sí sola ningún tratamiento de datos de pacientes.

3. Consentimiento informado para actos clínicos. Los consentimientos clínicos (por ejemplo, para un procedimiento) los recaba el profesional de la clínica conforme a la NOM-004-SSA3-2012 (numeral 10.1, que fija su contenido mínimo y los eventos que lo requieren). SIRO ofrece funciones para registrarlos, revocarlos o cancelarlos y conservarlos en el expediente. Actualmente SIRO no ofrece firma remota: la firma se recaba por los medios que determine la clínica y se registra en el sistema.

4. Fotografías y divulgación. La publicación o divulgación de datos personales del expediente con fines de literatura médica, docencia, investigación o fotografías que permitan identificar al paciente requiere su autorización escrita (NOM-004-SSA3-2012, numeral 5.5). SIRO no publica fotografías ni datos de pacientes.

5. Revocación. El consentimiento puede revocarse en cualquier momento sin efectos retroactivos (artículo 7 de la Ley). La revocación no procede respecto de información que deba conservarse por disposición legal, como el expediente clínico durante su plazo de conservación (ver /legal/retencion). Las solicitudes se atienden con el procedimiento de /legal/arco.

6. Transferencias. Si una clínica comunica datos de sus pacientes a un tercero distinto de su persona encargada, debe comunicarle el aviso de privacidad y las finalidades, y su aviso debe indicar si el paciente acepta o no la transferencia, salvo los supuestos del artículo 36 de la Ley. SIRO no transfiere datos de pacientes a terceros.

Versión {{VERSION}} — Entrada en vigor: {{FECHA_ACTUALIZACION}}.
$legal$, now(), now(), true);
  end if;
end $legal_consents$;

commit;
