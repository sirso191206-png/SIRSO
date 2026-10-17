# SIRO — Resultados de pruebas (ejecutadas realmente, sobre el código de este paquete)

Entorno: Node 22.22 / npm 10.9, PostgreSQL 16.15 local, Deno 1.46.3 y PostgREST 12.2.3 (binarios locales). **Sin Supabase real, sin Supabase CLI y sin navegador.** En las pruebas de Deno, Auth y Storage fueron una pasarela local simulada; las pruebas de comportamiento de las Edge Functions en Node usan clientes simulados con el código y los módulos compartidos REALES. Clasificación: `VERIFICADO LOCALMENTE` · `VERIFICADO LOCALMENTE (simulación)` · `PENDIENTE DE ENTORNO REAL` · `PENDIENTE DE EJECUCIÓN MANUAL`.

## 1. Resultados (medidos en una extracción limpia del paquete, con `npm ci` desde cero)
| # | Comprobación | Resultado | Clasificación |
|---|---|---|---|
| 1 | `npm ci` | 476 paquetes, exit 0 | VERIFICADO LOCALMENTE |
| 2 | `npx vitest run` | **147 archivos, 1,972 pruebas**, 0 fallos | VERIFICADO LOCALMENTE |
| 3 | `tsc --noEmit` · `npm run lint` · `npm run diagnostico:importaciones` | sin errores · 0 avisos · 0 importaciones huérfanas | VERIFICADO LOCALMENTE |
| 4 | `npm run build` | correcto; `sw.js`, `precache-manifest.json` y el modelo 3D presentes | VERIFICADO LOCALMENTE |
| 5 | 30 baterías `supabase/tests/*_test.sql` (107 migraciones, sin parches manuales) | **562 verificaciones, 0 fallos** (incluye `legal_documentos_v1_test.sql`: 19) | VERIFICADO LOCALMENTE |
| 6 | `auditoria_migraciones.sh` (001–106) | 0 errores; repetible (0 y 0); esquema `55908204…`; tablas existentes con contenido idéntico (46 tablas, 4,518 filas); tablas nuevas declaradas; ningún usuario existente marcado; `legal_documents` conserva sus 8 filas originales (salvo `activo`) y pasa a 24 versiones; 0 `SECURITY DEFINER` sin `search_path` | VERIFICADO LOCALMENTE |
| 7 | `verificar_rollbacks.sh` | los **12 rollbacks (094–104 y 106)** devuelven el esquema exacto anterior (el recuento ya no es un texto fijo) | VERIFICADO LOCALMENTE |
| 8 | `concurrencia_finalizar.sh` | 2 escenarios correctos | VERIFICADO LOCALMENTE |
| 9 | `verificar_postgrest.mjs` (PostgREST real) | **108/108** (9 nuevas de documentos y aceptaciones) | VERIFICADO LOCALMENTE |
| 10 | `ejecutar_todo.sh` (Deno real, Auth y Storage simulados) | **75/75** | VERIFICADO LOCALMENTE (simulación) |
| 11 | `verificar_decisiones.sh` · 4 consultas de solo lectura | verificado · 0 errores, filas antes = después (172), 0 marcadores en `false`, 38 funciones nuevas | VERIFICADO LOCALMENTE |
| 12 | `prueba_restauracion_local.sh` | **0 fallos** (107 migraciones; la evidencia de aceptación se conserva tal cual); con una política o un dato alterados a propósito los controles **fallan** | VERIFICADO LOCALMENTE (PostgreSQL local, NO Supabase) |
| 13 | `npm audit --omit=dev` | 0 vulnerabilidades en producción | VERIFICADO LOCALMENTE |
| 14 | Barrido de secretos y archivos prohibidos | 0 coincidencias | VERIFICADO LOCALMENTE |
| 15 | Supabase real (Auth, Storage, Edge Runtime, CLI), restauración real, comportamiento real de `signInWithPassword`/`app_metadata` | no ejecutable aquí | PENDIENTE DE ENTORNO REAL |
| 16 | Navegador (Service Worker, IndexedDB, 3D, sin conexión, CSP, la pantalla de aceptación) | no ejecutable aquí | PENDIENTE DE EJECUCIÓN MANUAL |
| 17 | Validación de un abogado de los documentos legales | no es una prueba técnica | **NO CONSTA** |

## 2. Pruebas de los cuatro pendientes de esta entrega
| Pendiente | Pruebas | Mutaciones |
|---|---|---|
| Contraseña temporal obligatoria (migración 103 y Edge Functions) | `cambio_password_obligatorio_test.sql` (9) · 12 comprobaciones HTTP reales · `edgeCambioPasswordObligatorio.test.js` (30) · `cambioPasswordObligatorio.test.js` (21) | 6 de 6 detectadas; el endurecimiento de la verificación «distinta de la temporal» falla (4 pruebas) contra la lógica anterior |
| Política de conservación (migración 104) | `conservacion_retencion_test.sql` (22, datos sintéticos) · regresión de `eliminar_clinica_test.sql` (32) y de las guardas de «tabla nueva» | 11 de 11 detectadas |
| Documentos legales v2 (migración 105) | `legal_borradores_v2_test.sql` (9) · `borradoresLegalesV2.test.js` (9). **No validan nada jurídicamente**: solo que sigan siendo borradores, no inventen datos ni plazos y no afirmen funciones inexistentes | — |
| Restauración | ensayo local descrito arriba | los controles se demuestran capaces de fallar |
| Defectos propios cazados por las pruebas | rollback de la 103 no devolvía el esquema exacto (texto de las funciones) · el filtro del guion de auditoría estaba mal construido · el código `PACIENTE_INCOHERENTE` faltaba en la lista del frontend | corregidos |

## 2b. Integración legal (migración 106): pruebas y mutaciones
| Qué | Pruebas | Mutaciones |
|---|---|---|
| Contenido de los 9 documentos 1.0 (identidad, datos permitidos por documento, sin marcadores ni advertencias, artículos citados solo si se leyeron en el texto oficial, sin afirmar lo que el software no hace, papeles responsable/encargado, acceso de superadministración) | `documentosLegalesV1.test.js` (13) y `legal_documentos_v1_test.sql` (19) | 11 de 11 detectadas (sin fijar versión o fecha en el servidor, aceptar documentos no vigentes o de otra clínica, disparador invocable por usuarios, RFC y correo inventados, plazo inventado, advertencia de borrador, WhatsApp integrado, borrado de versiones anteriores) |
| Aceptación: lógica y pantalla (quién acepta qué, versión nueva vuelve a pedirse, error de red o falta de conexión no bloquean, un rechazo del servidor deja reintentar) | `aceptacionLegal.test.js` (10) | — |
| Aceptación por HTTP real (lectura pública solo de lo vigente, anon sin escritura, versión y fecha fijadas por el servidor, no vigente/ajeno/otra persona rechazados, evidencia inmutable y aislada) | 9 comprobaciones nuevas en `verificar_postgrest.mjs` | — |
| Inventario público de almacenamiento: toda base IndexedDB y la caché del Service Worker del código figuran en él | guardia nueva en `inventarioCookies.test.js` | detectada al omitir una base |
| Restauración: la evidencia de aceptación se conserva tal cual | control nuevo en el ensayo | detectada la variante que la rompe |
Defectos propios cazados en esta integración: el disparador de aceptación también actuaba sobre inserciones de servidor (habría reescrito la fecha de TODA la evidencia al restaurar un respaldo y rechazado la de versiones no vigentes; lo encontraron dos baterías antiguas y se corrigió, con prueba y control de restauración nuevos) · el rollback de la 103 no devolvía el esquema exacto · el verificador de rollbacks tenía el recuento fijo en el texto · una de mis comprobaciones de versionado no detectaba el borrado de versiones de otro tipo (reforzada) · dos expresiones de mis pruebas eran demasiado amplias.

## 3. Errores propios cazados por las pruebas durante esta entrega (no se ocultan)
Mi definición de «registros clínicos» contaba las 64 piezas en blanco que se crean con cada paciente (un paciente dado de alta por error no habría podido borrarse jamás) · asumí una cascada `clinicas → pacientes` que no existe (rompía `fn_eliminar_clinica`) · el rechazo de una supresión lanzaba una excepción que revertía su propia fila de historial · `cambiar-password` aceptaba la misma contraseña si la verificación fallaba por un límite de peticiones · mi primer guion de restauración «aprobaba» comprobaciones en vacío cuando faltaba el respaldo · la comparación de restricciones confundía paréntesis distintos con definiciones distintas. Ninguna prueba se eliminó ni se relajó para obtener verde; donde una guarda debió ajustarse (auditoría de datos, guardas de tabla nueva) se hizo de forma más precisa, no más permisiva.

## 4. Límites de estas pruebas
Simulación de Auth/Storage en Deno; clientes simulados en las pruebas de funciones en Node (no validan tipos: `deno check` necesita descargar módulos remotos, sin red aquí); el efecto real de `ban_duration`, de `app_metadata` y de `signInWithPassword` en Supabase sin verificar; la restauración local no ejercita Auth real, archivos de Storage, Edge Functions ni secretos; rendimiento con 2,000–5,000 pacientes y accesibilidad no medidos; sin navegador real. Los textos legales no se pueden probar técnicamente: su estado es **PENDIENTE DE ABOGADO**.

## 5. Notas
Simulación de Auth/Storage en Deno; clientes simulados en las pruebas de funciones en Node (no validan tipos de TypeScript: `deno check` necesita descargar módulos remotos, sin red aquí); el efecto real de `ban_duration` en Supabase sin verificar; rendimiento con 2,000–5,000 pacientes y accesibilidad no medidos; sin pruebas en navegador real.
