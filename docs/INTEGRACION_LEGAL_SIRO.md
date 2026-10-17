# SIRO — Integración de los documentos legales (migración 106)

Los documentos legales de SIRO quedan integrados como **versión 1.0 vigente**, sin etiquetas de «borrador» en las páginas públicas, con la identidad del titular del servicio como texto fijo y con registro de aceptación por persona. Este documento es de **control interno**: aquí sí se dice con exactitud qué se verificó y qué no.

## 1. Identidad utilizada (solo la proporcionada)
Titular y prestador: **Eduardo Heriberto Iglesias Arines**, persona física, México (Estado de México, San Andrés Chiautla; localidad San Francisco Chiautla). Domicilio: Calle Laureles número 8, San Francisco Chiautla, San Andrés Chiautla, Estado de México. Teléfono: 5525338668 (solo en el aviso de privacidad integral). Correo legal y de ARCO: sirso191206@gmail.com (el dato recibido venía como un enlace mal formado; se usa el correo en texto plano).
**No se inventó ni se usa:** RFC (no proporcionado; ningún documento lo menciona), razón social ni sociedad mercantil (los textos dicen que SIRO no lo es), ni vínculo alguno con la Universidad Privada del Estado de México u otra institución. El domicilio aparece solo en los avisos de privacidad, los términos (identificación del prestador) y el acuerdo de tratamiento; nunca en seguridad, cookies, conservación, ARCO ni consentimientos.

## 2. Qué se integró
| Documento | Tipo en la base | Página |
|---|---|---|
| Aviso de privacidad simplificado | `privacy_simplified` | se muestra en `/legal/privacidad` junto con el integral, según la página existente |
| Aviso de privacidad integral | `privacy_integral` | `/legal/privacidad` |
| Términos y condiciones | `terms` | `/legal/terminos` |
| Cookies y tecnologías de almacenamiento | `cookies` | `/legal/cookies` |
| Seguridad y protección de datos | `security` | `/legal/seguridad` |
| Conservación, bloqueo y supresión | `retention` | `/legal/retencion` |
| Acuerdo de tratamiento de datos (SIRO–clínica) | `data_processing_agreement` | `/legal/acuerdo-tratamiento-datos` |
| Procedimiento ARCO | **`arco_procedure` (tipo nuevo)** | texto en `/legal/arco`, encima del formulario |
| Consentimientos y autorizaciones | **`consents` (tipo nuevo)** | `/legal/consentimientos` (enlace nuevo en el Centro Legal) |
| Registro de versiones, aceptación y vigencia | `legal_documents` + `legal_acceptances` | ver §4 |

También se **completó el inventario técnico de almacenamiento** que muestran `/legal/cookies` y `/legal/cookies/preferencias` (`lib/inventarioCookies.js`): solo listaba tres claves de `localStorage` y omitía las 10 bases IndexedDB (copia local de datos clínicos para el trabajo sin conexión, cola de cambios, sesión, PIN) y la caché del Service Worker. Una guardia nueva exige que toda base del código figure en el inventario.

## 3. Papeles jurídicos (sin atribuir uno solo)
* SIRO (el titular) es **responsable** de los datos de cuenta, contacto, uso, facturación, soporte y formulario de contacto de personas usuarias y clínicas.
* Respecto de los datos de **pacientes**, cuando la clínica determina las finalidades y los medios, la clínica es la responsable y SIRO es **persona encargada** (art. 2, fr. XII). Si en un caso concreto ambos las determinan, el acuerdo remite a la calificación que corresponda.
* El acuerdo declara que el titular de SIRO, como administrador, puede acceder a la información de una clínica solo para soporte, seguridad y mantenimiento, y que esos accesos quedan registrados (el software lo hace desde la fase anterior).
* Un paciente que ejerce ARCO ante SIRO sobre datos de una clínica es remitido a la clínica (art. 32, segundo párrafo).

## 4. Aceptación, versiones y vigencia (cómo funciona)
* Cada documento tiene `version`, `vigente_desde` y `publicado_en`; solo una versión está activa por tipo; publicar una versión nueva **nunca** pisa la anterior.
* Al iniciar sesión, **cada persona** debe aceptar Términos y Aviso de Privacidad vigentes; el **propietario** acepta además el Acuerdo de Tratamiento de Datos en nombre de la clínica; la superadministración no firma consigo misma (`lib/aceptacionLegal.js`, `components/legal/AceptacionLegalObligatoria.jsx`, integrado en `ProtectedRoute`).
* Se registra en `legal_acceptances`: persona, clínica, documento, versión, fecha y hora, método y agente de usuario (no se guarda la IP). Desde la migración 106 un disparador **toma la versión del propio documento y fija la fecha en el servidor**; solo admite documentos **vigentes** de su alcance; la evidencia no puede modificarse ni borrarse por las personas usuarias y cada quien solo ve la suya (el propietario, la de su clínica).
* Una versión nueva (otro id de documento) vuelve a pedirse; las aceptaciones anteriores se conservan.
* La pantalla **no bloquea el trabajo sin conexión** (se pedirá al reconectar) ni ante un error de consulta; solo bloquea cuando sabe que hay documentos pendientes.
* **Consecuencia al desplegar:** todas las personas usuarias aceptarán los documentos en su siguiente inicio de sesión.
* Historial: `listarHistorialVersiones` y el editor legal existentes; el panel `/admin/legal` muestra el control interno.

## 5. Fuentes (consulta del 12 de octubre de 2026)
| Disposición | Fuente leída | Estado |
|---|---|---|
| **Ley Federal de Protección de Datos Personales en Posesión de los Particulares** (nueva, DOF 20-mar-2025; texto vigente, última reforma DOF 14-nov-2025) | `diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf`, **leída completa** | **VERIFICADA en texto oficial.** Artículos citados: 2 (fr. III bloqueo, VIII días hábiles, IX disociación, XII persona encargada, XV Secretaría), 7, 8, 9, 10, 11, 18 a 20, 21 a 26, 27 a 34, 35, 36 y 40 |
| **NOM-004-SSA3-2012** (DOF 15-oct-2012) | reproducción oficial en `gob.mx` (`…/file/512094/NOM-004-SSA3-2012.pdf`), **leída completa** | **VERIFICADA.** Numeral 5.4 (conservación mínima de 5 años desde el último acto médico), 5.5 (autorización escrita para publicar fotografías o datos que identifiquen) y 10.1 (consentimiento informado). Aplica a los consultorios (numeral 2) y remite al expediente odontológico (5.15) |
| Código Fiscal de la Federación | solo fuentes secundarias | **NO verificada en texto oficial**: los documentos **no citan plazos fiscales**; dicen «los que el Código Fiscal de la Federación establece para cada tipo de documento» |
| NOM-024-SSA3-2012 y Reglamento de la Ley | no leídos | **No se citan** (el transitorio duodécimo de la nueva ley ordena adecuar los reglamentos; su estado no se verificó) |
Hallazgos del texto oficial que corrigen lo dicho antes con fuentes secundarias: el consentimiento para datos sensibles es **expreso y por escrito** (art. 8, firma autógrafa, electrónica o mecanismo de autenticación); los avisos ya no incluyen el listado de transferencias, pero el art. 35 exige una cláusula sobre su aceptación cuando existan transferencias (los textos declaran que no existen transferencias sujetas a aceptación); los plazos ARCO son 20 días (hábiles, art. 2 fr. VIII) + 15, ampliables una vez (art. 31); la solicitud de protección se presenta ante la Secretaría Anticorrupción y Buen Gobierno en 15 días (art. 40).

## 6. Lo que NO afirman los textos (porque no existe)
Integraciones de WhatsApp, recordatorios o encuestas automáticos, IP guardada por la aplicación, firma remota de consentimientos, **estado técnico de bloqueo** ni anonimización automática (la política dice que el bloqueo es una restricción administrativa), certificaciones, SLA, aprobaciones de abogado o autoridad.

## 7. Instalación de estos cambios
1. Respalda tu base (ver `RESPALDO_Y_RECUPERACION.md`).
2. Aplica **solo** `supabase/migrations/106_sirso_documentos_legales_v1.sql` (y antes la 105 y la 104 si aún no están). **No** ejecutes migraciones en producción sin tu autorización; pruébala primero en desarrollo.
3. Despliega el frontend nuevo (`npm ci && npm run build`).
4. Comprueba con `supabase/verificacion/marcadores_de_migraciones_solo_lectura.sql` (todo en `true`) y con las filas 21 a 25 de `VERIFICACION_SUPABASE.md`.
5. Reversión: `supabase/rollback/106_rollback.sql` (no borra nada: las versiones 1.0 quedan inactivas y se reactivan las 0.x).

## 8. Decisiones que requieren datos o criterio reales de SIRO (no se sustituyeron por datos inventados)
1. **No consta la validación de un abogado** de ningún documento. Publicarlos como vigentes es decisión del titular; el sistema no afirma ninguna aprobación.
2. **RFC:** no se proporcionó; si SIRO factura, debe constar en los comprobantes (no está en los documentos).
3. **Modelo comercial:** los términos describen planes por suscripción sin fijar precios ni periodicidad («constan en el comprobante o acuerdo») ni una política de reembolsos («lo acordado y la ley aplicable»). Defínelos cuando existan.
4. **Jurisdicción:** los términos fijan los tribunales del Estado de México (domicilio del titular); confírmalo.
5. **Disponibilidad:** dicen que no se garantiza un SLA; si ofreces uno, actualiza los términos.
6. **Correo de contacto:** todos los trámites dependen de sirso191206@gmail.com (cuenta de Gmail): cuida su acceso y su recuperación.
7. **Conservación:** solo el piso de 5 años del expediente tiene número; los plazos fiscales, de contratos y de auditoría están por referencia. Las decisiones técnicas pendientes siguen en `POLITICA_CONSERVACION_DATOS.md` (bloqueo como estado técnico, limpieza de archivos por paciente).
8. **Avisos de los pacientes:** cada clínica es responsable de **su propio** aviso de privacidad y de recabar el consentimiento expreso y por escrito. SIRO no ofrece todavía una plantilla de aviso para pacientes. Aviso: si una clínica publica su propia versión de un tipo con el editor legal, **esa versión sustituye a la de SIRO en la vista de sus usuarios** (la aceptación obligatoria siempre usa los documentos de plataforma).
9. **Proveedores:** `/legal/proveedores` lista Supabase, Vercel y Resend; confirma que el contrato con cada uno y la ubicación de su infraestructura son compatibles con lo que declaras.
10. **Datos de menores y consentimiento de pacientes menores:** los textos dicen que los trata la clínica; define si SIRO ofrecerá algo específico.
