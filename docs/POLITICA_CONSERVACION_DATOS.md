# SIRO — Política de conservación, bloqueo y supresión de datos

**Estado:** el mecanismo está implementado y verificado con pruebas LOCALES (migración 104). **La política NO está aprobada jurídicamente** y **no es cumplimiento legal definitivo**: todos los estados nacen en `PENDIENTE_DE_ABOGADO` y ningún plazo se inventó. Fuentes y su estado de verificación: `MATRIZ_REVISION_JURIDICA.md`.

## 1. Principios
Conservación **por categoría y finalidad**, no una regla global. Nada se elimina automáticamente (el esquema lo prohíbe). Una **retención legal** suspende cualquier supresión. El plazo clínico se cuenta desde el **último acto médico registrado**, no desde el alta del paciente ni la baja de la clínica. Una solicitud ARCO de cancelación no autoriza destruir lo que debe conservarse. Mientras falte un plazo, el sistema se queda en lo más seguro: no suprime.

## 2. Matriz por categoría
| Categoría | Datos | Plazo configurado hoy | Evento de inicio | Fuente (por confirmar) | Estado de aprobación |
|---|---|---|---|---|---|
| `expediente_clinico` | notas, diagnósticos, tratamientos, odontograma, periodontograma, consentimientos clínicos, recetas, fotografías, documentos clínicos, signos vitales, referencias | **sin valor** (piso de **5 años**: ningún valor menor se acepta) | último acto médico registrado | NOM-004-SSA3-2012: mínimo 5 años desde el último acto médico | PENDIENTE_DE_ABOGADO |
| `documentacion_fiscal_contable` | contabilidad y documentación fiscal | sin valor | según tipo documental y obligación fiscal | CFF arts. 30 y 67 (5 años desde la presentación de declaraciones, efectos prolongados, 6 y 10 años en ciertos casos). **No se asume un plazo fijo** | PENDIENTE_DE_ABOGADO |
| `contratos` | contratos y anexos | sin valor | terminación o vencimiento | por definir | PENDIENTE_DE_ABOGADO |
| `facturas` | CFDI | sin valor | emisión o efectos fiscales | CFF arts. 30 y 67 | PENDIENTE_DE_ABOGADO |
| `pagos` | registros de pagos | sin valor | fecha del pago | por definir | PENDIENTE_DE_ABOGADO |
| `comprobantes` | soportes de operaciones | sin valor | fecha de la operación | por definir | PENDIENTE_DE_ABOGADO |
| `autorizaciones` | consentimientos administrativos | sin valor | otorgamiento o revocación | por definir | PENDIENTE_DE_ABOGADO |
| `auditoria` | registros de trazabilidad | sin valor | fecha del evento | por definir | PENDIENTE_DE_ABOGADO |
| `documentos_soporte` | soporte técnico | sin valor | cierre del caso | por definir | PENDIENTE_DE_ABOGADO |
Cómo ver el estado actual: `supabase/verificacion/conservacion_estado_solo_lectura.sql` (solo lectura; muestra qué falta por configurar).

## 3. Qué protege el sistema hoy
| Control | Dónde |
|---|---|
| Ningún usuario borra por la API (no hay políticas DELETE permisivas) | RLS (verificado) |
| Un paciente **con registros clínicos o con retención legal** no se borra físicamente, ni por SQL ni con `service_role` (`EXPEDIENTE_SUJETO_A_CONSERVACION` / `RETENCION_LEGAL_ACTIVA`); un paciente recién creado (expediente y 64 piezas en blanco) no cuenta como expediente y sí se puede borrar | disparador `trg_proteger_paciente_conservacion` |
| Una clínica con retención legal activa no se elimina | disparador `trg_proteger_clinica_retencion` |
| La eliminación de una clínica sigue exigiendo suspensión, plazos definidos, ARCO resueltos y confirmación por nombre | `fn_eliminar_clinica` (087/089), que en la 104 autoriza el borrado de sus pacientes solo dentro de ella |
| Los usuarios de clínica no ven ni cambian nada de esto; las funciones de gestión son solo de servidor | permisos (nadie para `anon`/`authenticated`; solo `service_role`) |
| Cada decisión (plazo, retención colocada o liberada, supresión autorizada o rechazada) queda en un historial inmutable con actor, fecha y motivo | `conservacion_historial` |
| El plazo clínico efectivo solo vale si es ≥ 5 años; los valores de las claves anteriores (087/089) por debajo del piso se ignoran | `fn_plazo_expediente_anios` |

## 4. Conservar, bloquear, anonimizar o suprimir (estado real)
| Acción | Estado |
|---|---|
| **Conservar** | Implementado: dentro del plazo o con retención legal no se suprime nada |
| **Bloquear** (acceso restringido al vencer el plazo o tras una cancelación ARCO) | **NO implementado como estado técnico.** Hoy solo existe `pacientes.archivado_en` y la restricción por rol, que no equivalen a un bloqueo jurídico. **PENDIENTE DE DESARROLLO y de definición del abogado** |
| **Anonimizar** | **No implementado** |
| **Suprimir un paciente** | Implementado en la base: `fn_suprimir_paciente_autorizado` (solo servidor; exige plazo definido y vencido, sin retención legal, motivo de 20+ caracteres) |
| Limpieza de **archivos en Storage** del paciente suprimido | **NO implementada** (sí existe para la eliminación de una clínica completa). Antes de suprimir, anota las rutas (`fotografias.url_storage`, `documentos_clinicos.url_storage`) y bórralas por el procedimiento del proveedor |
| **Registros de auditoría** y **copias de respaldo** | No se tocan: conservan lo que contengan hasta que su propio plazo (por definir) lo permita |
| Supresión **automática** | **Prohibida** por el esquema; nunca se ejecutó sobre datos reales en las pruebas (solo sobre datos sintéticos dentro de transacciones) |

## 5. Procedimiento de operación (todo con `psql` y credenciales de servidor, en una ventana controlada)
1. **Revisión periódica** (recomendado cada trimestre): ejecuta `conservacion_estado_solo_lectura.sql`; revisa categorías sin plazo y retenciones activas.
2. **Definir o cambiar un plazo** (solo con aprobación documentada):
   `select fn_establecer_plazo_conservacion('expediente_clinico', 6, 'APROBADA_POR_ABOGADO', 'Acta del 2026-xx-xx, dictamen n.º …', null);` Los valores menores al piso se rechazan; el cambio y su motivo quedan en el historial.
3. **Colocar una retención legal** (litigio, auditoría, investigación): `select fn_colocar_retencion_legal('<clinica>', null, 'expediente_clinico', 'Oficio …', 'EXP-…', null);` (paciente concreto en el 2.º argumento). **Liberarla**: `select fn_liberar_retencion_legal('<id>', 'Motivo …', null);`.
4. **Candidatos a supresión** (solo conteos): `select count(*) filter (where (fn_conservacion_paciente(id) ->> 'puede_suprimirse')::boolean) from pacientes;`.
5. **Supresión autorizada**, paciente por paciente y solo con respaldo previo verificado: guarda las rutas de Storage; `select fn_suprimir_paciente_autorizado('<paciente>', 'Motivo de al menos 20 caracteres …', null);`; si devuelve `ok: false`, lee `motivo_bloqueo` (no se borró nada y queda el intento en el historial); bórra los archivos de Storage; registra la evidencia.
6. **Solicitudes ARCO de cancelación:** no equivalen a una orden de supresión: se evalúa la categoría; lo que deba conservarse se conserva (y se debería bloquear: ver §4).
Reglas: nunca ejecutes la supresión sobre datos reales sin respaldo verificado y sin aprobación; las pruebas usan solo datos sintéticos.

## 6. Decisiones que requieren aprobación jurídica
Confirmar los 5 años y su fuente; plazos de todas las demás categorías; definición de «bloqueo» y su implementación; cuándo anonimizar en lugar de suprimir; tratamiento de la auditoría y de los respaldos; conservación de consentimientos; quién ordena una retención legal; y la supresión de archivos por paciente. Lista completa en `PENDIENTES_LEGALES.md`.

## 7. Pruebas
`conservacion_retencion_test.sql` (22 verificaciones, con datos sintéticos): estructura y permisos, último acto médico (incluida una cita completada reciente frente a un tratamiento antiguo), piso de 5 años, sin plazo nada es suprimible, retención por paciente y por clínica, supresión autorizada y rechazada, historial inmutable, eliminación automática prohibida, andamiaje en blanco. Mutaciones sobre la 104: 11 de 11 detectadas. La regresión de la eliminación de clínicas (86) y las guardas de «tabla nueva» pasan.

Desde la 108 las tres baterías (`conservacion_retencion_test.sql` 22, `conservacion_categorias_test.sql` 35, `eliminar_clinica_test.sql` 33) prueban la regla vigente: solo una política válida y **aprobada** fija plazo (el valor legado de `plataforma_config` ya no autoriza nada), y sin las decisiones de plataforma (quién aprueba, qué es fiscal, si lo contractual bloquea) se bloquea con un código propio. Mientras el abogado y el contador no definan las políticas, ninguna clínica con datos clínicos o pagos se puede eliminar.
