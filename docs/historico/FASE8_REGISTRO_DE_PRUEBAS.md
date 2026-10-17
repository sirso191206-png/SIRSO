# SIRO — Fase 8: registro de pruebas (comandos y resultados REALES, ejecutados localmente)

Entorno: Node 22.22 / npm 10.9, PostgreSQL 16.15 local, Deno 1.46.3 y PostgREST 12.2.3 (binarios locales). **Sin Supabase real, sin Supabase CLI, sin navegador.** Auth y Storage de las pruebas de Deno fueron una pasarela local simulada. Las pruebas de `eliminar-usuario` y `enviar-contacto` son de Node con clientes simulados. Rutas: `frontend/` y `supabase/` del proyecto consolidado. Los guiones `.sh` de `supabase/` suponen una instancia local de PostgreSQL con base desechable `siro_test` y el usuario `postgres` (los scripts verifican que exista y **fallan de forma explícita si no**).

## 1. Línea base (antes de modificar nada; carpeta nueva desde `SIRSO-completo-fase7.zip`)
| Comando | Resultado |
|---|---|
| `cd frontend && npm ci` | 476 paquetes, exit 0 |
| `npx vitest run` | 133 archivos, **1,742 pruebas**, 0 fallos |
| SQL (informe de la fase 7, reproducido en la fase anterior) | 22 baterías / 474 verificaciones |

## 2. Estado final (copia de trabajo de la fase 8)
| Comando | Resultado | Clasificación |
|---|---|---|
| `npx vitest run` | **138 archivos, 1,795 pruebas**, 0 fallos (1,792 antes de añadir los 3 casos de la guarda a `marcadores_de_migraciones_solo_lectura.sql`) | VERIFICADO LOCALMENTE |
| `npx tsc --noEmit` | sin errores | VERIFICADO LOCALMENTE |
| `npm run lint` | 0 errores, 0 avisos | VERIFICADO LOCALMENTE |
| `npm run diagnostico:importaciones` | 0 importaciones huérfanas | VERIFICADO LOCALMENTE |
| `npm run build` | correcto; modelo 3D `28712320f0f0b4b6d13362b4f5b7367a`; `dist/sw.js` presente | VERIFICADO LOCALMENTE |
| `for t in supabase/tests/*_test.sql; do psql -d siro_test -f $t; done` (base reconstruida con 001–099, sin parche manual) | **24 baterías, 493 verificaciones, 0 fallos** | VERIFICADO LOCALMENTE |
| `supabase/tests/auditoria_migraciones.sh <ruta>/supabase` | 0 errores desde cero; re-ejecutar 085–099 dos veces: 0 y 0; esquema idéntico (`790d36b4…`); 45 tablas / 4,510 filas con el mismo contenido; 0 `SECURITY DEFINER` sin `search_path` | VERIFICADO LOCALMENTE |
| `supabase/rollback/verificar_rollbacks.sh <ruta>/supabase` | los 6 rollbacks (094–099) devuelven el esquema exacto anterior y son re-ejecutables | VERIFICADO LOCALMENTE |
| `supabase/tests/concurrencia_finalizar.sh siro_test` | doble clic al finalizar y al completar una consulta pendiente: 1 nota (la 2.ª sesión espera y responde idempotente) | VERIFICADO LOCALMENTE |
| `node supabase/tests/postgrest/verificar_postgrest.mjs` (PostgREST real + PostgreSQL real, tras `semilla.sql`) | **80/80** | VERIFICADO LOCALMENTE |
| `supabase/tests/deno/ejecutar_todo.sh` (Deno real; Auth y Storage simulados) | **75/75** | VERIFICADO LOCALMENTE (simulación) |
| `supabase/decisiones/verificar_decisiones.sh <ruta>/supabase` | sin valores o con valores inválidos/hostiles no escribe nada; con válidos la base los interpreta | VERIFICADO LOCALMENTE |
| `psql -f supabase/verificacion/{estado_produccion,logos,marcadores_de_migraciones}_solo_lectura.sql` | 0 errores; filas antes = después; los marcadores dan `true` en una base completa y `false` desde la 094 en una base construida hasta la 093 | VERIFICADO LOCALMENTE |
| Verificación desde una carpeta limpia (ZIP completo de la fase 7 extraído + este ZIP incremental) | todo lo anterior se repitió y dio el mismo resultado | VERIFICADO LOCALMENTE (ver §5) |

## 3. Pruebas nuevas y qué demuestran (todas fallan sin la corrección)
| Archivo | Pruebas | Demuestra |
|---|---|---|
| `supabase/tests/integridad_referencias_y_actores_test.sql` | 15 | Sin la 098 fallan D1, D2, C1, T1, T2, A1, A2 (referencias entre clínicas y autoría falsificables); con ella 15/15 y las 23 baterías anteriores siguen en 0 fallos |
| `supabase/tests/contacto_limites_test.sql` | 4 | Con la 099 el anónimo no puede guardar campos fuera de límite; las filas existentes no se tocan. Sin ella, un anónimo guardó un mensaje de 3,000,000 de caracteres (comprobado a mano sobre una base hasta la 098) |
| `frontend/.../offline/procesadorCola.test.js` (+6) | 6 | 5 fallos al revertir `esRechazoDeIntegridad` del procesador (el error crudo se reintentaba para siempre) + 1 control |
| `frontend/.../offline/rechazosDeIntegridadOffline.test.js` | 3 | Reconocimiento del rechazo crudo y tipificado + guardia contra deriva con los hints de las migraciones |
| `frontend/.../edgeEliminarUsuarioComportamiento.test.js` | 9 | 5 fallos con el código anterior (cuenta viva huérfana); 4 de autorización sin cambios |
| `frontend/.../edgeEnviarContactoComportamiento.test.js` | 17 | 6 fallos con el código anterior (envío arbitrario, sin idempotencia, filtrado de Resend) |
| `frontend/.../contactoLimites.test.js` | 5 | Los límites del formulario son EXACTAMENTE los de la migración 099 |
| `frontend/.../offline/limpiezaDeSesionCubreTodosLosAlmacenes.test.js` | 6 | Guardia: todo almacén de IndexedDB se limpia al cerrar sesión y al cambiar de usuario (3 casos negativos) |
| `frontend/.../migracionesYVerificacionSeguras.test.js` (ampliado) | 45 | Guarda estática 085–099 y de los tres archivos de `verificacion/` |

## 4. Fallos y errores propios registrados durante la fase (no se ocultan)
* Una comprobación mía de la fase 7 dio un **falso verde** (comparé dos huellas vacías); ya está corregida con una guarda que exige tablas con datos. En esta fase repetí la comprobación de «instalación existente» con la huella real.
* La batería de la 098: A1 falló por mi propio monto repetido y A5 medía otra regla (un pago ya no se puede editar); ambas corregidas sin tocar el producto.
* La batería de la 099: mi ayudante ejecutaba el `INSERT` con `INTO` y simulé mal la fila antigua (`session_replication_role` no desactiva CHECK).
* La consulta de marcadores y una consulta informativa chocaron con la guarda de solo lectura (palabra `correo`; literal `'TRUNCATE'`); resolví acotando la consulta y haciendo que la guarda ignore literales entre comillas, comprobando que sigue detectando escrituras reales.
* Dos veces (como en fases anteriores) mi propio comando usó `pkill -f psql` o `time`, que no aplican; no afectó a ningún resultado.

## 5. Verificación final desde la carpeta limpia
Carpeta nueva: `SIRSO-completo-fase7.zip` extraído + `SIRSO-fase8-correcciones.zip` apilado; idéntica a la copia de trabajo (`diff -rq` sin líneas); sin `.env` reales; `npm ci` desde cero (476 paquetes). Resultados:
| Comprobación | Resultado |
|---|---|
| `npx vitest run` | **138 archivos, 1,795 pruebas**, 0 fallos |
| `npx tsc --noEmit` · `npm run lint` · `npm run diagnostico:importaciones` · `npm run build` | sin errores · 0 avisos · 0 · correcto (modelo 3D `28712320…`, `sw.js`) |
| 24 baterías SQL (base construida con 001–099, sin parche manual) | **493 verificaciones, 0 fallos** |
| `auditoria_migraciones.sh` (001–099) | 0 errores; repetible (0 y 0); 45 tablas / 4,510 filas con el mismo contenido; 0 `SECURITY DEFINER` sin `search_path` |
| `verificar_rollbacks.sh` | los 6 rollbacks (094–099) verificados |
| `concurrencia_finalizar.sh` | 2 escenarios correctos |
| `verificar_postgrest.mjs` | **80/80** |
| `ejecutar_todo.sh` (Deno real, Auth/Storage simulados) | **75/75** |
| `verificar_decisiones.sh` | verificado |
| 3 consultas de solo lectura | 0 errores; filas antes = después (147); 0 marcadores en `false` en una base completa |

Las cifras pueden variar ligeramente si cambias las dependencias o la versión de PostgreSQL; si algo difiere, anótalo.
