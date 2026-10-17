# SIRO — Pendientes legales y checklist de aprobación

> **ACTUALIZACIÓN (migración 106):** los documentos legales ya se integraron como versión 1.0 vigente con la identidad del titular de SIRO y verificados contra el texto oficial de la ley y de la NOM-004; lo vigente está descrito en `INTEGRACION_LEGAL_SIRO.md`. Este documento conserva el análisis de la versión anterior (borradores 0.2) como historial de decisiones; las fuentes marcadas aquí como «solo secundarias» para la LFPDPPP y la NOM-004 ya fueron leídas en su texto oficial. El Código Fiscal de la Federación y la NOM-024-SSA3-2012 siguen sin verificarse en texto oficial.


**Estado jurídico: PENDIENTE DE ABOGADO.** Ningún documento de SIRO está jurídicamente aprobado. No publiques las versiones v2 como definitivas ni las presentes como cumplimiento normativo hasta tener una validación real y documentada. Contexto y fuentes: `MATRIZ_REVISION_JURIDICA.md`.

## 1. Datos corporativos que faltan (no se inventaron; son marcadores en los textos)
| Marcador | Dato | Quién lo proporciona |
|---|---|---|
| `{{RESPONSABLE}}` | Denominación o razón social de quien figura como responsable del tratamiento (la clínica, SIRO o ambos, según el abogado) | Propietario del producto + abogado |
| `{{RFC}}` | RFC del responsable | Propietario del producto |
| `{{DOMICILIO}}` | Domicilio del responsable y para avisos | Propietario del producto |
| `{{TELEFONO}}` | Teléfono de contacto | Propietario del producto |
| `{{CORREO_PRIVACIDAD}}` | Correo para privacidad y derechos ARCO | Propietario del producto |
| `{{VERSION}}`, `{{FECHA_ACTUALIZACION}}` | Se llenan solas al publicar | Sistema |
Los datos corporativos de cada clínica se capturan en Configuración de la clínica. Además faltan, y **no se deben inventar**: representante legal, fecha de vigencia de cada documento, razón social de SIRO si es distinta, y jurisdicción.

## 2. Decisiones del abogado (lista numerada)
1. **Roles por flujo:** quién es responsable y quién encargado respecto de los datos de pacientes, del personal de la clínica y de los datos de la plataforma; y el tratamiento de la superadministración, que puede ver datos personales de pacientes de cualquier clínica.
2. **Consentimiento de datos sensibles:** forma (expreso, por escrito), medio, constancia y cuándo se pide; diseño de la firma de consentimientos clínicos (hoy no existe la firma remota).
3. **Finalidades:** cuáles son necesarias, cuáles requieren consentimiento y cuáles existen en realidad (hoy SIRO no envía recordatorios, encuestas ni comunicaciones).
4. **Transferencias:** si se informan aunque la ley vigente ya no lo exija en el aviso integral, y cuáles existen.
5. **ARCO:** plazos (20 + 15 días hábiles según fuentes secundarias; verificar el texto oficial), gratuidad, requisitos de la solicitud y alcance de la cancelación frente a lo que debe conservarse.
6. **Revocación y limitación del uso:** efectos, excepciones y procedimiento.
7. **Autoridad** ante la que puede presentarse una inconformidad (Secretaría Anticorrupción y Buen Gobierno según fuentes) y si debe mencionarse.
8. **Reglamento** de la ley vigente: si se publicó y qué cambia.
9. **Conservación:** confirmar los 5 años mínimos desde el último acto médico (NOM-004-SSA3-2012) y otras obligaciones; plazos fiscales (CFF arts. 30 y 67 y otros), de contratos, pagos, facturas, comprobantes, autorizaciones, auditoría y soporte; conservación de consentimientos y versiones legales; respaldos; **qué retención legal aplicar y quién la ordena**. Detalle y mecanismo en `POLITICA_CONSERVACION_DATOS.md`.
10. **NOM-024-SSA3-2012:** vigencia y qué exige a SIRO como sistema de expediente electrónico.
11. **Términos:** SLA, modelo comercial (planes, periodicidad, cancelación, reembolsos), suspensión y terminación, límites de responsabilidad (sin excluir lo que la ley no permite), jurisdicción, soporte.
12. **Acuerdo de tratamiento:** instrucciones documentadas, confidencialidad, subencargados, notificación de incidentes y plazos, auditoría, devolución o supresión al terminar.
13. **Datos de menores y personas representadas.**
14. **Cookies y almacenamiento local:** si procede consentimiento para la copia local de datos clínicos y el desbloqueo sin conexión; que el inventario técnico publicado los incluya.
15. **Incidentes de seguridad:** obligaciones y plazos de notificación al titular y a la autoridad.

## 3. Qué ocurre al publicar las versiones v2
La migración 105 desactiva las versiones activas y activa las v2 (borrador). Si la aplicación pide aceptar documentos legales por versión, **las personas tendrán que volver a aceptar**; decide cuándo hacerlo. Para volver a una versión anterior se reactiva desde la administración legal (nunca se borra nada).

## 4. Checklist de aprobación y firma jurídica
Marca cada fila solo con evidencia (documento firmado, correo del abogado, acta). Estado inicial de todo: ☐.

| ☐ | Paso | Responsable | Evidencia |
|---|---|---|---|
| ☐ | Completar los datos corporativos del §1 | Propietario | Captura de la configuración |
| ☐ | Abogado confirmado y alcance de la revisión | Propietario | Contrato o carta |
| ☐ | Revisión del aviso simplificado e integral contra el texto oficial vigente de la ley | Abogado | Dictamen |
| ☐ | Calificación de roles por flujo (§2.1) | Abogado | Dictamen |
| ☐ | Texto y forma del consentimiento de datos sensibles y de los consentimientos clínicos | Abogado | Plantillas aprobadas |
| ☐ | Revisión de términos y condiciones | Abogado | Dictamen |
| ☐ | Revisión del acuerdo de tratamiento de datos | Abogado | Contrato firmado |
| ☐ | Revisión de cookies, seguridad y proveedores (y del inventario técnico) | Abogado + responsable técnico | Dictamen |
| ☐ | Plazos de conservación por categoría y confirmación de la NOM-004 | Abogado + contador | Acta de aprobación (se registra con `fn_establecer_plazo_conservacion`) |
| ☐ | Procedimiento de retención legal y de supresión autorizada | Abogado + responsable | Procedimiento firmado |
| ☐ | Revisión de ARCO (formulario y plazos) | Abogado | Dictamen |
| ☐ | Publicación de las versiones finales (sin la palabra «borrador») | Propietario | Versión publicada y su fecha |
| ☐ | Registro de la fecha, el nombre del abogado y la versión aprobada | Propietario | Acta |
**Mientras alguna fila esté en ☐, el estado es PENDIENTE DE ABOGADO.**
