# SIRO V1.0 — Fase 4: cierre de pendientes y validación (versión CANDIDATA, no «lista para producción»)

Nada de esto se ha desplegado, ni ejecutado en Supabase de producción, ni subido a git. Cada hallazgo está clasificado: **CORREGIDO**, **VERIFICADO**, **PENDIENTE DE ENTORNO** o **PENDIENTE DE DECISIÓN HUMANA**. Migraciones 085–091 (se aplican en ese orden; son transaccionales y re-ejecutables).

## 1. Resultados reales (comandos y niveles)
| Nivel | Comando / script | Resultado |
|---|---|---|
| Unitarias y de componentes (Vitest, mocks) | `npm test -- --run` (`npx vitest run`) | **131 archivos, 1,690 pruebas, 0 fallos** |
| TypeScript / ESLint / build | `npx tsc --noEmit` · `npm run lint` · `npm run build` | sin errores · 0 errores y 0 avisos · correcto (modelo 3D intacto) |
| SQL local (PostgreSQL, migraciones 001–091) | 17 baterías en `supabase/tests/*_test.sql` | **427 verificaciones, 0 fallos** |
| Concurrencia real (2 sesiones) | `supabase/tests/concurrencia_finalizar.sh` | doble clic al finalizar **y** al completar una consulta pendiente: la 2.ª sesión esperó ~1.4 s y respondió idempotente; 1 nota |
| PostgREST real 12.2.3 | `supabase/tests/postgrest/verificar_postgrest.mjs` (una vez, base nueva) | **55 comprobaciones**, 0 inesperadas |
| **Edge Function en Deno real** | `supabase/tests/deno/ejecutar_todo.sh` | **55/55** (Deno 1.46.3 + supabase-js 2.45.0 + PostgREST + PostgreSQL reales; **Auth y Storage simulados**) |
| Auditoría de migraciones | `supabase/tests/auditoria_migraciones.sh` | orden, repetibilidad, datos intactos, privilegios: ver §4 |
| Navegador real · Supabase real (Auth/Storage/red) · producción | — | **PENDIENTE DE ENTORNO** |

## 2. «Mi día» y el flujo clínico — CORREGIDO, VERIFICADO
**Diagnóstico.** El botón «Finalizar consulta» de Mi día y el «Completar» del panel de la agenda hacían `UPDATE citas SET estado='completada'` directo; la base lo aceptaba: cita completada sin nota, sin verificación ni seguimiento. Un reintento posterior de «Guardar y finalizar» daba `FINALIZACION_INCOMPLETA` y no había forma de arreglarlo.

**Regla (en la base de datos, no solo en la interfaz):** una cita pasa a `completada` **solo** por `fn_finalizar_consulta`. Estados administrativos (confirmar, pendiente, en espera, iniciar consulta, no asistió, cancelar, reprogramar, reabrir) siguen libres y **no generan notas**.

| Pieza | Qué hace |
|---|---|
| Migración 090 · trigger `trg_bloquear_completar_cita_directo` | un usuario final (`authenticated`/`anon`) no puede dejar una cita en `completada` ni insertarla así (`COMPLETAR_SOLO_VIA_CONSULTA`); las funciones `SECURITY DEFINER`, `service_role` y la operación administrativa sí pueden. No cambia datos existentes |
| `fn_completar_consulta_pendiente` | recuperación **explícita** para una cita ya completada sin nota (y/o sin seguimiento): crea la nota inmutable con id del cliente, verifica campo a campo, **no modifica la cita**, idempotente, **no crea una segunda nota** (`CONSULTA_YA_TIENE_NOTA`), mismos controles de autorización que finalizar |
| `fn_consultas_sin_nota` | lista (≤100, últimos N días, por omisión 30, tope 365) lo pendiente; vacía para otros roles o si el plan no incluye notas |
| Frontend | Mi día y el panel solo **abren la consulta**; sección «Consultas por completar»; aviso en el panel de la cita; modo recuperación en la pantalla de consulta (requiere conexión); botón «No asistió» (administrativo); una operación offline antigua que intente completar se conserva como **conflicto con instrucciones** (no se reintenta para siempre); guardia de arquitectura que falla si el frontend vuelve a completar una cita directamente |

**Qué es obligatorio y qué opcional** (según el modelo actual, sin inventar requisitos clínicos universales): para finalizar se exige la cita, el rol (owner/dentista), el acceso (clínica, sucursal, paciente asignado) y el plan; la **nota** es obligatoria solo si el plan incluye notas clínicas y expediente; signos vitales, odontograma, tratamiento y receta **se guardan en su propia sección** y no bloquean la finalización; el seguimiento y el pago son opcionales.

**Cambio de comportamiento a validar (PENDIENTE DE DECISIÓN HUMANA):** el avance automático «el siguiente en espera pasa a consulta» ocurrió antes al pulsar el botón de Mi día; ahora ocurre **al finalizar desde la consulta** (administrativo, de mejor esfuerzo, no afecta a lo ya guardado).

## 3. `admin-eliminar-clinica`
**VERIFICADO (Deno real, 55 comprobaciones):** autenticación con JWT (ausente, basura, expirado, otra clave, anon, usuario sin perfil); autorización exclusiva del superadmin (propietario, dentista y propietario de otra clínica reciben «No autorizado» y **no se llama a ninguna función de la base**); clínica suspendida; nombre exacto; confirmación de datos clínicos; bloqueos por ARCO pendiente, datos recientes (clínico y fiscal por separado) y política indefinida; un `solicitanteId` falsificado en el cuerpo se ignora; eliminación completa **sin huérfanos** (todas las tablas, notas, Storage y cuentas de Auth en cero) con otra clínica intacta; auditoría de la eliminación con las listas de limpieza y de los intentos rechazados; fallo parcial de Storage y de Auth con estado `eliminada_con_limpieza_pendiente` y **reanudación segura** (solo lo pendiente, idempotente, sin re-eliminar la clínica); tres eliminaciones simultáneas (una sola tiene éxito y se audita una vez); reanudaciones simultáneas; sin tokens ni trazas en las respuestas. Mutación: 5 sobre la función; una sobrevivió (`solicitanteId` del cuerpo), se cerró.

**PENDIENTE DE ENTORNO:** Auth y Storage fueron una **pasarela local simulada** (`edge_deno_integration.mjs` borra `auth.users` y `storage.objects` y permite inyectar fallos). Falta un proyecto de Supabase **de pruebas**, con la versión de Deno de su Edge Runtime, sus límites de red y su API real de Storage/Auth. Usa solo clínicas desechables con datos ficticios.

## 4. Auditoría de las migraciones 085–091
| Comprobación | Resultado |
|---|---|
| Orden y dependencias | 085–091 se aplican sin error y en orden; la 085 requiere la 078; la 086–087 requieren 001; la 088 reemplaza la función de la 085; la 089 reemplaza la vista previa de la 087 y la función de la 086; la 090 y la 091 son independientes entre sí |
| Repetibilidad | re-ejecutar 085–091 **dos veces** → 0 errores y la **huella del esquema es idéntica** (funciones, políticas, triggers, privilegios) |
| Datos | aplicarlas sobre una base con datos: **45 tablas, 4,033 filas, hash por tabla idéntico**: no borran ni cambian nada |
| Destructivo | prueba estática (`migracionesYVerificacionSeguras.test.js`): aplicar una migración **no ejecuta** `DELETE/TRUNCATE/UPDATE/DROP/INSERT`; lo destructivo vive solo en funciones que se invocan explícitamente |
| Permisos | nada se concede a `public`/`anon`; `authenticated` solo `fn_finalizar_consulta`, `fn_completar_consulta_pendiente`, `fn_consultas_sin_nota`; las funciones destructivas, de limpieza y de trigger solo a `service_role` o a nadie |
| `SECURITY DEFINER` | 0 sin `search_path` fijo en todo `public` (la 085 fijó `fn_auditoria` y `fn_marcar_nota_editada`) |
| Hallazgo corregido | la función de trigger de la 090 era ejecutable por `public/anon/authenticated` (no explotable); revocada |

## 5. Seguridad multi-tenant
* **CORREGIDO (migración 091) — defecto nuevo:** un dentista podía guardar una nota de **su** paciente ligada a la cita de **otro paciente** o de **otra clínica**, y con una cita inexistente la FK daba un error distinto (**oráculo de existencia** de ids de cita ajenos). Ahora un trigger exige que la cita sea del mismo paciente del expediente y devuelve **la misma respuesta** para «no existe», «otro paciente» y «otra clínica» (verificado también por PostgREST).
* **VERIFICADO:** todas las tablas con `clinica_id`/`paciente_id` tienen RLS; Storage con roles reales: un propietario no ve, sube, modifica ni borra archivos de otra clínica; un dentista solo ve los de sus pacientes; no existe política `DELETE` para fotos/documentos (solo el servicio los borra); un anónimo no ve fotos ni documentos (`storage_aislamiento_test.sql`, 6/6); las funciones nuevas validan en backend (no solo en la interfaz); las notas siguen inmutables.
* **PENDIENTE DE DECISIÓN HUMANA:** (a) los **logos** son legibles por cualquier anónimo (`storage_logos_select` solo por bucket; la ruta lleva el UUID de la clínica) — parece de diseño; (b) `authenticated` conserva `TRUNCATE`, `REFERENCES` y `TRIGGER` sobre `notas_clinicas` por los privilegios por defecto (la fase 1 solo revocó `UPDATE/DELETE`); ninguna superficie del producto lo expone (PostgREST no ofrece `TRUNCATE`), por eso no se revocó; la sentencia concreta sería `revoke truncate, references, trigger on notas_clinicas from authenticated;`.

## 6. Conservación y eliminación — PENDIENTE DE DECISIÓN HUMANA (sin valores por omisión)
Tres categorías con política propia: clínica `retencion_expediente_anios`, fiscal `retencion_fiscal_anios` (si hay pagos), contractual `retencion_contractual_anios` (opcional: sin ella solo avisa). Ausente/inválida ⇒ la eliminación **sigue bloqueada** (clínica y fiscal). **No se definió ningún valor.** Requieren decisión del propietario del producto con asesoría legal/contable: los años de cada categoría y si la contractual debe ser obligatoria. Mi referencia, sin valor de asesoría legal: entiendo que la NOM-004-SSA3-2012 pide un mínimo de 5 años para el expediente clínico; los plazos fiscales y contractuales los define tu contador/abogado. La auditoría guarda las listas de limpieza pendiente y se puede reanudar (`reintentar_limpieza`).

## 7. Mutación (cada protección se quita y alguna prueba debe fallar)
SQL 090/091: 28 mutaciones, **26 detectadas** tras reforzar mis pruebas (7 lagunas reales: cada control de autorización se probaba tapado por otro, el autor de la nota, el `inicio` del seguimiento, un seguimiento con el id de la propia cita y mismo horario, el filtro «solo las suyas»). **2 equivalentes** por defensa en profundidad (control de rol y filtro de clínica del listado: ya los cubre `auth_paciente_asignado`). Frontend: **18/18**. Deno/Edge: 5 (4 + 1 cerrada). Quitar un `REVOKE` en una migración posterior a la que creó la función es siempre equivalente (`CREATE OR REPLACE` conserva los privilegios).

## 8. Riesgos abiertos y decisiones
* **PENDIENTE DE DECISIÓN HUMANA:** la **migración 007 no se aplica desde cero** (su vista usa `pacientes.archivado_en`, que crea recién la 040; dependencia hacia adelante preexistente; en producción ya está resuelta). Arreglarlo exige editar una migración histórica: no se tocó. Para reconstruir una base de pruebas se usa el parche previo de `archivado_en`.
* **PENDIENTE DE DECISIÓN HUMANA:** valores de políticas (§6); logos públicos y privilegios `TRUNCATE` (§5); avance de la fila (§2).
* **PENDIENTE DE ENTORNO:** Supabase real (Auth/Storage/Deno Edge Runtime), navegador real, producción.
* La limpieza de Auth/Storage **no es atómica** con la base: queda registrada y es reanudable.
* «Guardar borrador» sigue creando una nota por pulsación (diseño previo).
* Las citas que Mi día completó **antes** de esta fase quedan completadas sin nota: aparecen en «Consultas por completar» (no se tocan ni se «reparan» solas).

## 9. Probar en un entorno aislado
1. Base **desechable** (nunca producción) con las migraciones: `./supabase/tests/auditoria_migraciones.sh <ruta/supabase>` (la reconstruye y audita) o aplica 001–091 a mano en orden.
2. SQL: ejecuta cada `supabase/tests/*_test.sql` con `psql -d <base> -f` y busca la línea `RESULTADO`.
3. PostgREST: arranca PostgREST contra esa base y ejecuta `postgrest/verificar_postgrest.mjs` **una sola vez** tras `postgrest/semilla.sql`.
4. Concurrencia: `./supabase/tests/concurrencia_finalizar.sh <base>` (escribe datos: base desechable).
5. Edge Function en Deno: instala Deno, define `DENO`, `RESET_DB`, `PGRST` y `ESBUILD` y ejecuta `supabase/tests/deno/ejecutar_todo.sh`. **Con clínicas ficticias**; nunca una clínica real.
6. Frontend: `cd frontend && npm ci && npx vitest run && npx tsc --noEmit && npm run lint && npm run build`.
7. Para Supabase real: proyecto de pruebas, aplica las migraciones, despliega la Edge Function ahí y repite §3 con clínicas desechables.

## 10. Orden recomendado para desplegar (SOLO tras tu autorización explícita)
1. **Respaldo** y comprobar que se puede restaurar. 2. Ejecutar `supabase/verificacion/estado_produccion_solo_lectura.sql` (solo lectura) y confirmar lo esperado. 3. Migraciones **085, 086, 087, 088, 089, 090, 091** en orden (si ya se aplicaron 085–087, bastan 088–091). 4. Repetir la consulta de verificación (esperado: 11 funciones nuevas, 2 triggers) y comprobar privilegios. 5. `supabase functions deploy admin-eliminar-clinica`. 6. Frontend (`npm ci`, `npm run build`) y actualizar el Service Worker. 7. Definir las políticas de conservación (decisión legal). 8. Probar con una clínica desechable (`docs/CORRECCION_FINALIZAR_CONSULTA_Y_ELIMINAR_CLINICA.md` §7).
**Nunca el frontend antes que las migraciones.** Recuperación: cada migración es transaccional y re-ejecutable; las funciones nuevas se pueden retirar sin tocar datos (primero revierte la Edge Function y el frontend); ante un daño de datos, restaurar el respaldo del paso 1.
