# SIRO — Revisión de privacidad (técnica, NO jurídica)

> **Esto es una revisión técnica de lo que el sistema hace, no una opinión legal. No afirma ni garantiza cumplimiento de la ley mexicana de protección de datos
> personales, de normas oficiales de expediente clínico ni de ningún otro marco.** Los textos legales deben ser validados por un asesor jurídico antes de
> comercializar SIRO.

## Hallazgo principal
Los **8 documentos legales que se muestran en la aplicación están en versión borrador** (`v0.1-borrador` / `v0.2-borrador`): aviso de privacidad integral y simplificado,
términos y condiciones, cookies, política de retención, medidas de seguridad y acuerdo de tratamiento de datos. **Hoy el producto muestra borradores.** Hay que
revisarlos con un abogado, ajustarlos a la práctica real (la de abajo) y publicarlos como versión definitiva.

## Qué hace el sistema hoy (hechos verificables)

| Tema | Lo que existe | Lo que falta o hay que validar |
|---|---|---|
| **Aislamiento y acceso** | Cada clínica solo ve sus datos (RLS), por rol; pruebas automáticas (36 verificaciones A→B, archivos incluidos). Ver `ROLES_Y_PERMISOS.md` | Probarlo en Supabase real |
| **Bitácora de acceso y cambios** | Auditoría de altas, cambios y bajas de pacientes, expedientes, notas, recetas, consentimientos, pagos, usuarios, citas y tratamientos. Pantalla para el owner. Inmutable por la aplicación. Una fuga entre clínicas (migración 081) ya está corregida | Las **lecturas** de expedientes no se registran, salvo la exportación de datos de un paciente |
| **Derechos ARCO** | Página pública para solicitar (`/legal/arco`) y pantalla del owner para atenderlas (`/administracion/arco`) | Definir y documentar el proceso humano y los plazos de respuesta |
| **Exportación de datos de un paciente** | Existe (JSON) y deja registro en la auditoría (`DATA_EXPORTED`) | Falta una forma sencilla de entregarla al titular con identificación verificada |
| **Eliminación** | **No existe borrado de pacientes en la aplicación**: se **archivan** (siguen en la base). Los archivos de Storage no se pueden borrar desde la aplicación | Decidir qué significa "cancelar" un dato y cómo se ejecuta (hoy solo con intervención técnica). La política de retención del borrador debe coincidir con esto |
| **Retención** | No hay purga automática de ningún dato. La auditoría tampoco se purga. Vencer una suscripción **no** borra información | Definir plazos con el asesor (p. ej. conservación del expediente) y, si se promete, implementarlos |
| **Consentimiento informado clínico** | Módulo de consentimientos con firma en pantalla ligado al paciente | Validar que el contenido de las plantillas sea el que exige tu práctica |
| **Aceptación de términos/privacidad** | Existen las tablas de documentos legales versionados y de aceptaciones | No se auditó en qué momento se solicita aceptar ni cómo se registra; revisar |
| **Incidentes de seguridad** | Pantalla del owner (`/administracion/incidentes`) | Definir el procedimiento de notificación |
| **Seguridad técnica** | Archivos privados con enlaces firmados de 10 min; contraseñas y sesiones por Supabase Auth; control de sesiones por dispositivo; sin la llave `service_role` en el navegador | Cifrado en reposo y región de los datos dependen de Supabase: **verificar** y reflejarlo en el aviso |
| **Terceros que tratan datos** | Supabase (base, autenticación y archivos); el correo transaccional si se configura | Mantener la lista de proveedores (`/legal/proveedores`) igual a la real y firmar los acuerdos que correspondan |
| **Cookies** | Banner y preferencias | Validar categorías contra lo que realmente se usa |

## Qué NO se puede afirmar todavía
- Que SIRO "cumple" con una ley o norma específica.
- Que los textos legales publicados son definitivos.
- Dónde (región) están físicamente los datos, ni el cifrado en reposo, sin comprobarlos en el proyecto de Supabase.
- Que los datos se eliminan a petición de forma automática (no existe).

## Antes de comercializar
1. Revisión jurídica de los 8 documentos y publicación de versión definitiva.
2. Definir y escribir los procesos humanos: atención de ARCO, notificación de incidentes, plazos de conservación y cancelación.
3. Decidir si se implementa borrado/anonimización de pacientes y de archivos, y con qué controles.
4. Verificar en Supabase: región, cifrado, respaldos (ver `BACKUPS_Y_RECUPERACION.md`).
5. Auditar el momento y el registro de aceptación de términos y aviso de privacidad.
