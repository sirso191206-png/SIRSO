# SIRO V1.0 — Fase 5: auditoría independiente de la fase 4 (versión CANDIDATA, no «lista para producción»)

Nada de esto se ha desplegado, ni ejecutado en Supabase de producción, ni subido a git. No hay cumplimiento legal declarado. Etiquetas: `CORREGIDO`, `VERIFICADO`, `FALLIDO`, `PENDIENTE DE ENTORNO`, `PENDIENTE DE DECISIÓN HUMANA`, `NO REPRODUCIDO`. Migraciones 085–092.

## 1. Material y estado del parche de la fase 4
Carpeta de auditoría construida SOLO con el repositorio original (HEAD `15adb67`, con 21 archivos de trabajo sin confirmar de antes) + `SIRSO-fase2/3/4-correcciones.zip`. La fase 4 estaba aplicada **completa**: 35 de 35 archivos idénticos byte a byte. Dependencias reinstaladas con `npm ci` (476 paquetes). Sin `.env`.

## 2. Declarado (fase 4) vs. reproducido (carpeta independiente)
| Resultado declarado | Reproducido | Etiqueta |
|---|---|---|
| Vitest 131 archivos / 1,690 pruebas | 131 / 1,690, 0 fallos | `VERIFICADO` |
| TypeScript · ESLint · importaciones huérfanas · build | sin errores · 0 avisos · 0 · correcto (modelo 3D `28712320…`) | `VERIFICADO` |
| 427 verificaciones SQL, 17 baterías | 427 / 17 / 0 fallos (migraciones de la carpeta independiente) | `VERIFICADO` |
| Concurrencia (finalizar y completar pendiente) | 2.ª sesión esperó y respondió idempotente; 1 nota | `VERIFICADO` |
| PostgREST 55 comprobaciones | 55, 0 inesperadas | `VERIFICADO` |
| Edge Function en Deno 55 | 55/55 (Deno 1.46.3 real, supabase-js 2.45.0, PostgREST+PostgreSQL reales) | `VERIFICADO` — **Auth y Storage simulados** |
| Auditoría de migraciones | orden, repetibilidad, 45 tablas / 4,033 filas intactas, privilegios | `VERIFICADO` |
| Función contra Supabase real, navegador real | no se pudo | `PENDIENTE DE ENTORNO` |

Que las pruebas pasen no prueba que sean buenas: por eso se atacó el sistema con roles reales (§3).

## 3. Defectos encontrados y corregidos (todos reproducidos ANTES de corregir)
| # | Defecto | Corrección | Etiqueta |
|---|---|---|---|
| 1 | Un dentista podía guardar una nota con el `usuario_id` de **otro usuario** (autoría falsificable) | Migración 092: con sesión de usuario el autor debe ser quien guarda (si falta se rellena) → `NOTA_AUTOR_INCOHERENTE` | `CORREGIDO` |
| 2 | `creado_en` de una nota admitía cualquier fecha, incluso dentro de un año | 092: la fecha futura se acota a «ahora»; la pasada se conserva (captura sin conexión) | `CORREGIDO` |
| 3 | Una cita podía apuntar a un **odontólogo** o **sillón de otra clínica**; el no-traslape es por odontólogo sin distinguir clínica, así que una clínica podía ocupar la agenda de otra y, por el error de traslape, averiguar su disponibilidad (oráculo + denegación de servicio entre tenants) | 092: `CITA_DENTISTA_INCOHERENTE` / `CITA_SILLON_INCOHERENTE`, respuesta idéntica para «no existe» y «es de otra clínica»; solo actúa al insertar o cambiar esos campos (los datos legados siguen gestionables) | `CORREGIDO` |
| 4 | `admin-eliminar-clinica` devolvía el mensaje interno de PostgreSQL con un `clinicaId` no UUID (reflejando la entrada) y esa entrada llegaba a una función destructiva (la frenaba el cast) | Validación previa (después de autenticar y comprobar superadmin): cuerpo objeto, UUID, acción permitida, `confirmarNombre` texto ≤ 200, `confirmarDatosClinicos` booleano estricto; errores propios con clase `ErrorDeSolicitud`; los inesperados → 500 genérico con código `DB_<SQLSTATE>` y registro solo en el servidor | `CORREGIDO` |
| 5 | Una operación offline antigua sin dueño rechazada por la 092 se habría reintentado para siempre | Clasificada como `INTEGRIDAD_DATOS`, definitiva (se conserva como conflicto con el mensaje del servidor) | `CORREGIDO` |
| 6 | Mis propias pruebas: una aserción se evaluaba antes que el `INSERT` que comprobaba (las subconsultas no correlacionadas corren primero); las claims JWT quedaban fijadas tras `como()` y contaminaban las preparaciones «como administrador» | Arnés corregido (preparación separada de la aserción; claims vaciadas antes de actuar como administrador). No se rebajó ninguna aserción de fondo | `CORREGIDO` |

El `solicitanteId` falsificado en el cuerpo (mutación que sobrevivió en la fase 4): `VERIFICADO` — el solicitante sale siempre de `auth.getUser(token)`; ningún dato del cliente lo sustituye (prueba en Deno real + 1 mutación).

## 4. Evaluación de las migraciones 085–092
| Aspecto | Resultado |
|---|---|
| Orden / dependencias | 085–092 se aplican sin error y en orden (la 090–092 son independientes entre sí) |
| Repetibilidad | re-ejecutar 085–092 dos veces: 0 errores; huella del esquema idéntica (funciones, políticas, triggers, privilegios) |
| Datos | sobre una base con datos: 45 tablas, 4,510 filas, hash por tabla idéntico antes y después |
| Destructivo | solo dentro de funciones invocadas explícitamente (guarda estática en la suite) |
| Permisos | nada a `public`/`anon`; `authenticated` solo `fn_finalizar_consulta`, `fn_completar_consulta_pendiente`, `fn_consultas_sin_nota`; funciones destructivas y de trigger solo a `service_role` o a nadie; 0 `SECURITY DEFINER` sin `search_path` |
| 088–089 | idempotencia verificada campo por campo; conservación por categorías sin valores por omisión; eliminación con limpieza reanudable |
| 090 | un usuario final no puede dejar una cita en `completada` (UPDATE ni INSERT); **no hay rutas alternativas**: solo `fn_finalizar_consulta` y `fn_completar_consulta_pendiente` escriben en `citas` desde `SECURITY DEFINER` y no hay vistas sobre `citas` |
| 091–092 | la coherencia vive en la base de datos, no en el frontend; respuestas de error uniformes (sin oráculo) |
| **Migración 007** | `PENDIENTE DE DECISIÓN HUMANA`: en una base NUEVA fallan la **007 y la 038** (dependen de `pacientes.archivado_en`, que crea recién la 040; la CLI de Supabase se detiene en el primer error). Propuesta 003: añadir `archivado_en` y `drop view if exists v_pacientes_seguro` antes de recrearla. Con ella las 92 migraciones se aplican con **0 errores en modo estricto** y el esquema final es **idéntico** al de referencia; nada depende de la vista en ese punto. Solo afecta a bases nuevas |

## 5. Flujo de consultas, «Mi día» y fila de espera — `VERIFICADO`
Caminos revisados que cambian el estado de una cita: panel de la agenda, Mi día, cola de espera, cola offline, `fn_finalizar_consulta`, `fn_completar_consulta_pendiente`. Solo los dos últimos completan. Acciones administrativas (confirmar, en espera, iniciar, cancelar, no asistió) no crean notas. Doble clic, reintentos y concurrencia: una nota, un seguimiento. Las consultas completadas sin nota por versiones anteriores aparecen en «Consultas por completar»; la recuperación no sobrescribe notas existentes (`CONSULTA_YA_TIENE_NOTA`). **Fila de espera:** el siguiente paciente pasa a consulta al finalizar desde la consulta (administrativo, mejor esfuerzo, no afecta a lo guardado); `PENDIENTE DE DECISIÓN HUMANA` validar que coincide con la operación real de la clínica.
Observaciones (sin cambio): se puede finalizar una cita que no está «en consulta» (p. ej. agendada) por la RPC; recepción puede pasar a «cancelada» una cita ya completada; reabrir una cita completada y finalizarla otra vez crea una segunda nota (anexo). `PENDIENTE DE DECISIÓN HUMANA`.

## 6. Permisos PostgreSQL, RLS y Storage
* RLS: todas las tablas con `clinica_id`/`paciente_id` tienen RLS. `VERIFICADO`.
* Storage (roles reales, 6/6): fotos y documentos aislados por paciente asignado; nadie autenticado puede borrar ni modificar archivos clínicos (no hay política DELETE/UPDATE); un anónimo no ve fotos ni documentos. `VERIFICADO`.
* **Privilegios por defecto** (corrección a mi informe anterior): `anon` y `authenticated` tienen `TRUNCATE` en 38 tablas (y `REFERENCES`/`TRIGGER` en 44 relaciones, 3 de ellas vistas); `anon` conserva además `INSERT/UPDATE/DELETE`, hoy anulados por RLS (no tiene políticas). `TRUNCATE` no está sujeto a RLS; ninguna API del producto lo expone (PostgREST no ofrece `TRUNCATE`). **Propuesta 001** (cambio mínimo: revoca solo `TRUNCATE/REFERENCES/TRIGGER`, no toca DML ni RLS): tras aplicarla quedan 0 relaciones con esos privilegios y pasan las 18 baterías SQL y PostgREST 62/62. `PENDIENTE DE DECISIÓN HUMANA`. Tablas futuras: verificar `pg_default_acl` en desarrollo.
* **Logos** (`PENDIENTE DE ENTORNO` + decisión): se usan solo en flujos autenticados (imprimir receta, configuración), no en el login. La política `storage_logos_select` es solo por bucket: con la clave anon (en el bundle) se pueden **listar las carpetas, es decir los UUID de todas las clínicas clientes**. El bucket no se crea en ninguna migración (se creó a mano): no se puede confirmar desde el repositorio si es público. **Propuesta 002:** SELECT solo de la propia clínica (el logo público por URL no usa la política si el bucket es público; el `upsert` del propietario sí necesita SELECT sobre su carpeta); probada en SQL (2/2). Antes de aplicarla: `select id, public from storage.buckets where id='logos-clinicas'` debe ser `true`; después, abrir un logo por URL, imprimir una receta, subir un logo y listar con la clave anon (debe dar `[]`).

## 7. Conservación legal — `PENDIENTE DE DECISIÓN HUMANA` (sin valores por omisión)
Obligatorias para eliminar: clínica `retencion_expediente_anios` (si hay datos clínicos) y fiscal `retencion_fiscal_anios` (si hay pagos); contractual `retencion_contractual_anios` opcional (sin ella solo avisa). Ausente o inválida ⇒ la eliminación sigue **bloqueada**. No se definió ningún valor. La referencia a la NOM-004-SSA3-2012 (mínimo de cinco años para el expediente clínico) requiere validación legal contextualizada: no es una autorización para eliminar, y los plazos fiscales y contractuales los define el contador o el abogado. Riesgo de borrar: Auth y Storage no comparten transacción con PostgreSQL; la lista de limpieza queda en la auditoría y se puede reanudar. No se declara cumplimiento legal. Decisión adicional: límite de retrofecha de una nota (la captura sin conexión es legítima).

## 8. Pruebas ejecutadas (comandos) — estado final de la copia de desarrollo
| Comando | Resultado |
|---|---|
| `npx vitest run` | **131 archivos, 1,694 pruebas**, 0 fallos |
| `npx tsc --noEmit` · `npm run lint` · `npm run diagnostico:importaciones` · `npm run build` | sin errores · 0 avisos · 0 · correcto |
| 18 baterías `supabase/tests/*_test.sql` (`psql -f`) | **437 verificaciones**, 0 fallos (con y sin la propuesta 001) |
| `supabase/tests/concurrencia_finalizar.sh` | 2 escenarios correctos |
| `supabase/tests/postgrest/verificar_postgrest.mjs` | **62/62** (con y sin la propuesta 001) |
| `supabase/tests/deno/ejecutar_todo.sh` | **74/74** (Deno real; Auth/Storage simulados) |
| `supabase/tests/auditoria_migraciones.sh` | superada (excepto la 007 preexistente) |
| `supabase/verificacion/estado_produccion_solo_lectura.sql` | ejecutada: 0 errores; rechaza escrituras (`BEGIN READ ONLY`) |
Mutación: SQL de la 092 10/10 detectadas; Edge Function 10 mutaciones, todas detectadas tras cerrar dos lagunas de mis pruebas; las demás mutaciones de fases anteriores se conservan.

## 9. No reproducido / pendiente de entorno
Supabase real (Auth, Storage real, versión de Deno del Edge Runtime, límites de red); navegador real; que el bucket `logos-clinicas` sea público; despliegue del frontend. Todo se probó con clínicas ficticias en una base desechable.

## 10. Integración del parche
Aplica `SIRSO-fase5-correcciones.zip` sobre el árbol con las fases 2–4 ya aplicadas (copiar sobre las mismas rutas; son solo archivos nuevos o modificados). Archivos de `supabase/propuestas/` NO son migraciones y no se ejecutan solos.

## 11. Plan de pruebas en Supabase de desarrollo
1. Proyecto NUEVO de pruebas (nunca producción). Para montar una base nueva necesitas la propuesta 003 (si no, la CLI se detiene en la 007).
2. Aplicar migraciones 001–092 en orden; ejecutar `supabase/verificacion/estado_produccion_solo_lectura.sql`.
3. Desplegar `admin-eliminar-clinica` y repetir el recorrido de `supabase/tests/deno/edge_deno_integration.mjs` con clínicas desechables (superadmin real, Storage y Auth reales): bloqueos, eliminación completa, fallo parcial y reanudación, concurrencia.
4. Comprobar `select id, public from storage.buckets`; probar las propuestas 001 y 002 y repetir las 18 baterías.
5. Probar el frontend contra ese proyecto: finalizar una consulta, recuperar una pendiente, fila de espera, offline.

## 12. Plan de despliegue futuro (SOLO con autorización explícita)
1) Respaldo verificable. 2) Consulta de solo lectura. 3) Migraciones 085–092 en orden (si ya están 085–087, bastan 088–092). 4) Repetir la consulta (esperado: 13 funciones nuevas y 4 triggers). 5) Desplegar `admin-eliminar-clinica`. 6) Frontend y Service Worker. 7) Definir las políticas de conservación. 8) Decidir las propuestas 001, 002 y 003. Nunca el frontend antes que las migraciones.

## 13. Respaldo y recuperación
Antes de cualquier migración: respaldo completo de la base y de los buckets (`fotos-clinicas`, `documentos-clinicos`, `logos-clinicas`) y prueba de restauración en un proyecto aparte. Las migraciones son transaccionales y re-ejecutables; si falla una, se deshace por completo. Las funciones y triggers de 090–092 se retiran con `drop trigger` / `drop function` sin tocar datos (primero revertir la Edge Function y el frontend). Ante daño de datos: restaurar el respaldo. Tras una eliminación de clínica con limpieza pendiente: `accion: reintentar_limpieza` (no vuelve a eliminar la base) y `limpieza_pendiente` para consultar qué falta.
