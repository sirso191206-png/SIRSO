# SIRO — Matriz de revisión jurídica (preparada por IA para la revisión de un abogado)

> **ACTUALIZACIÓN (migración 106):** los documentos legales ya se integraron como versión 1.0 vigente con la identidad del titular de SIRO y verificados contra el texto oficial de la ley y de la NOM-004; lo vigente está descrito en `INTEGRACION_LEGAL_SIRO.md`. Este documento conserva el análisis de la versión anterior (borradores 0.2) como historial de decisiones; las fuentes marcadas aquí como «solo secundarias» para la LFPDPPP y la NOM-004 ya fueron leídas en su texto oficial. El Código Fiscal de la Federación y la NOM-024-SSA3-2012 siguen sin verificarse en texto oficial.


**ESTADO JURÍDICO DE TODOS LOS DOCUMENTOS: PENDIENTE DE ABOGADO.** Este trabajo es documental: identifica los documentos, detecta omisiones y contradicciones con el software, y relaciona requisitos con las fuentes consultadas. **No sustituye una revisión jurídica, no declara cumplimiento de la LFPDPPP, de la NOM-004-SSA3-2012, de la NOM-024-SSA3-2012 ni de ninguna otra norma, y no aprueba ningún texto.** Las versiones v2 de los borradores se incorporaron en la migración 105 (las anteriores se conservan inactivas).

## 1. Qué documentos existen
En el proyecto no hay un conjunto definido de «ocho» documentos: en la tabla `legal_documents` hay **7 tipos** (8 versiones iniciales, porque cookies tuvo dos). Se añaden a la matriz, como documentos relacionados, el resto de elementos legales que el sistema implementa.

| # | Documento | Dónde vive | Finalidad | Revisión de la IA |
|---|---|---|---|---|
| 1 | Aviso de privacidad simplificado | `legal_documents` (v0.2) | Informar lo esencial al titular | Revisado y corregido (v2) |
| 2 | Aviso de privacidad integral | `legal_documents` (v0.2) | Informar el tratamiento completo | Revisado y corregido (v2) |
| 3 | Términos y condiciones | `legal_documents` (v0.2) | Regular el uso del servicio | Revisado y corregido (v2) |
| 4 | Cookies y tecnologías de almacenamiento | `legal_documents` (v0.3) | Informar el almacenamiento local | Revisado y corregido (v3) |
| 5 | Seguridad | `legal_documents` (v0.2) | Describir medidas técnicas reales | Revisado y corregido (v2) |
| 6 | Conservación de información | `legal_documents` (v0.2) | Describir plazos y principios | Reescrito conforme al modelo implementado |
| 7 | Acuerdo de tratamiento de datos | `legal_documents` (v0.2) | Relación clínica ↔ proveedor | Revisado y completado como borrador |
| 8 | Aceptaciones legales | tabla `legal_acceptances` | Evidencia de aceptación | **Solo inventariado** (diseño inmutable; sin revisión jurídica) |
| 9 | Consentimientos clínicos | tabla `consentimientos_informados` y su interfaz | Constancia de procedimientos | **Solo inventariado**: el texto de las plantillas NO fue revisado; la firma remota no existe |
| 10 | Solicitudes ARCO | página `/legal/arco` y tabla `arco_solicitudes` | Ejercicio de derechos | **Solo inventariado** (límite anti-abuso y verificación de identidad implementados) |
| 11 | Proveedores | página `/legal/proveedores` | Informar proveedores | **Solo inventariado** (la lista dice Supabase, Vercel y Resend; no contrastada línea a línea) |

## 2. Distinción de roles (sin afirmarla)
Se identifican los flujos; la calificación contractual **queda para el abogado**:
* **SIRO como proveedor tecnológico:** pone la plataforma, opera la infraestructura (con proveedores) y administra la plataforma (superadministración).
* **La clínica:** captura y usa los datos de sus pacientes; en muchos escenarios decide las finalidades y los medios. Puede ser **responsable** respecto de sus pacientes.
* **Proveedores que procesan datos por cuenta de la clínica o de SIRO:** Supabase (base de datos, autenticación, almacenamiento), Vercel (hospedaje del sitio); Resend solo para el correo del formulario de contacto (no maneja datos de pacientes).
* **Personas usuarias autorizadas:** propietario, odontólogo, asistente, recepción, y superadministración de plataforma. Un caso especial a calificar: **la superadministración puede ver datos personales de pacientes de cualquier clínica** (el acceso ahora queda registrado, ver `INFORME_FINAL_AUDITORIA.md`).
* **Decisión del abogado:** quién es responsable y quién encargado en cada flujo, y cómo se refleja en el aviso de privacidad, los términos y el acuerdo de tratamiento.

## 3. Fuentes consultadas (consulta: 12 de octubre de 2026)
| Disposición | Lo que se pudo verificar | Fuentes | Estado |
|---|---|---|---|
| **LFPDPPP** (nueva, DOF 20-mar-2025, vigente 21-mar-2025; abroga la de 2010) | Autoridad: Secretaría Anticorrupción y Buen Gobierno (desaparece el INAI). Contenido del aviso (art. 15 según un análisis): identidad y domicilio del responsable; datos tratados con mención de los sensibles; finalidades distinguiendo las que requieren consentimiento; medios para limitar el uso o la divulgación; mecanismos ARCO; procedimiento para notificar cambios; mecanismo de revocación. La ley ya no exige informar transferencias en el aviso. Consentimiento libre, específico e informado; datos sensibles con consentimiento expreso (varias fuentes dicen «y por escrito»). Concepto de «plazo de conservación»: bloqueo previo a la supresión. ARCO: 20 días hábiles para responder y 15 para ejecutar (según una fuente); resolución de la autoridad en 50 días (según otra) | gtlaw.com (alerta, 2025); ey.com/es_mx (boletín); creel.mx; hlc.com; sae-cia.com; smpslegal.com; aeabogados.com; recordinglaw.com; kyc-systems.com | **Solo fuentes secundarias.** El texto oficial (DOF / Cámara de Diputados) NO se consultó: **PENDIENTE DE INVESTIGACIÓN** (números de artículo, plazos exactos, forma del consentimiento) |
| **Reglamento** de la nueva LFPDPPP | Una fuente indica que el Ejecutivo tenía 90 días naturales para adecuarlo | gtlaw.com | **PENDIENTE DE INVESTIGACIÓN**: no se verificó si se publicó ni su contenido |
| **NOM-004-SSA3-2012** (DOF 15-oct-2012) | El expediente clínico se conserva **mínimo 5 años desde la fecha del último acto médico**; permite medios electrónicos | Revista CONAMED (biblat.unam.mx) reproduce el numeral; documento institucional inprf.gob.mx; agendapro.com (fecha de publicación) | Plazo verificado en una publicación que reproduce la norma; **texto oficial del DOF no consultado**; aplicación al caso odontológico y otras obligaciones: PENDIENTE DE ABOGADO |
| **NOM-024-SSA3-2012** | Una fuente indica que los sistemas electrónicos que gestionan el expediente deben cumplirla | agendapro.com | **PENDIENTE DE INVESTIGACIÓN**: vigencia, versión actual y alcance para SIRO sin verificar |
| **Código Fiscal de la Federación, arts. 30 y 67** | Art. 30: contabilidad y documentación se conservan **5 años** desde la presentación (o fecha en que debió presentarse) de las declaraciones; efectos prolongados: se cuenta desde el último ejercicio; algunas informaciones **6 años** (arts. 32-B); documentos de conservación mientras subsista la sociedad. Art. 67: las facultades de comprobación pueden extenderse a **10 años** en ciertos supuestos | mley.mx (art. 30); contadormx.com; elconta.mx; contadoresmexico.org.mx | Solo fuentes secundarias; aplicabilidad a una clínica y a SIRO, y obligaciones por tipo documental: PENDIENTE DE CONTADOR Y ABOGADO. **Por eso no se fija un plazo fiscal único** |

## 4. Riesgos detectados y qué se hizo
| Documento | Riesgo o contradicción detectada | Acción tomada en v2 | Decide el abogado |
|---|---|---|---|
| Aviso integral | Listaba la **IP** como dato guardado; la aplicación no la guarda (sí el agente de usuario de las sesiones) | Corregido, con nota de que los proveedores pueden registrarla | Redacción final de datos técnicos |
| Aviso integral | Finalidades secundarias (recordatorios, encuestas, comunicación) **inexistentes en el software** | Retiradas; se indica que SIRO no las hace y que la clínica puede añadir las suyas | Qué finalidades existen realmente y cuáles requieren consentimiento |
| Aviso integral / simplificado | Faltaban elementos que las fuentes atribuyen al aviso (medios para limitar el uso, revocación, datos con mención de los sensibles, finalidades que requieren consentimiento, autoridad) | Añadidos como borrador con marcadores | Contenido exacto según el texto oficial vigente |
| Aviso integral | Aseguraba consentimiento «expreso» sin definir cómo se obtiene ni qué constancia queda | Marcado: la firma remota de consentimientos clínicos no existe | Forma y constancia del consentimiento de datos sensibles |
| Aviso integral | Calificación de quién es responsable no definida | Se deja explícitamente para el abogado | Calificación por flujo |
| Términos | Mencionaba **integraciones de WhatsApp**; es solo un campo de contacto | Corregido | Cláusulas comerciales, SLA, límites de responsabilidad, jurisdicción, suspensión (siguen como [TODO LEGAL]) |
| Términos | Una exclusión de responsabilidad que podría contradecir obligaciones legales | Se mantiene el marcador para revisión; no se amplió ninguna exención | Alcance permitido de las exclusiones |
| Seguridad | Decía que el **panel de sesiones no existe**; sí existe | Corregido; se añade el cambio obligatorio de contraseña temporal | Qué medidas pueden describirse públicamente |
| Seguridad | No mencionaba datos clínicos **guardados en el dispositivo** para trabajo sin conexión | Añadido | Redacción y advertencia al usuario |
| Cookies | Omitía IndexedDB, caché de la aplicación y el desbloqueo sin conexión | Añadido; se pide revisar que el inventario técnico publicado (`/legal/cookies`) los incluya | Si procede consentimiento adicional |
| Conservación | No reflejaba el modelo implementado; afirmaba conservación **indefinida** de consentimientos sin base | Reescrito por categoría, sin inventar plazos; la conservación de consentimientos queda marcada | Plazos por categoría; compatibilidad con supresión |
| Acuerdo de tratamiento | Faltaban instrucciones documentadas, subencargados, apoyo en ARCO, auditoría | Añadidos como decisiones del abogado; notificación de incidentes y terminación siguen en [TODO LEGAL] | Todo su contenido contractual |
| Todos | No hay datos corporativos | **No se inventó ninguno**: siguen los marcadores `{{RESPONSABLE}}`, `{{RFC}}`, etc. | Completarlos |

## 5. Decisiones que debe tomar el abogado
Ver la lista numerada y el checklist de aprobación en `PENDIENTES_LEGALES.md`.
