# SIRO — Resultado de la prueba de restauración

## Estado
* **Ensayo de restauración de PostgreSQL en una instancia LOCAL desechable: EJECUTADO, 0 fallos** (12 de octubre de 2026, con el código final del paquete).
* **Restauración en Supabase real (Auth, Storage, Edge Functions, secretos): PROCEDIMIENTO PREPARADO; RESTAURACIÓN REAL PENDIENTE** (`PLAN_PRUEBA_RESTAURACION.md`).
**Por eso NO se marca «VERIFICADA EN ENTORNO DE PRUEBAS» de Supabase.** Lo ejecutado es una restauración de PostgreSQL 16 con datos sintéticos; no demuestra que un proyecto de Supabase pueda recuperarse.

## Qué se ejecutó (`supabase/restauracion/prueba_restauracion_local.sh`)
Base origen con las **107 migraciones** y datos sintéticos de dos clínicas (usuarios, pacientes, una cita, metadatos de archivos, política de conservación con plazo 6, una retención legal activa y un usuario con cambio de contraseña pendiente) → `pg_dump` formato custom → SHA-256 → restauración en una base **nueva y distinta** → comparación y controles. Entorno: PostgreSQL 16 local (los roles `anon`, `authenticated`, `service_role` y los esquemas `auth` y `storage` son los de un stub local, no los de Supabase).

## Resultados medidos
| Medida | Valor |
|---|---|
| Migraciones aplicadas en el origen | 107, sin error |
| Objetos comparados | 49 tablas, 352 funciones, 159 políticas, 77 disparadores |
| Tamaño del respaldo | 654,306 bytes |
| Tiempo del respaldo / de la restauración | 0.1 s / 0.6 s (**datos sintéticos mínimos: no es un RTO**) |
| Errores de `pg_restore` | 0 |

| Control | Resultado |
|---|---|
| SHA-256 del respaldo | registrado y verificado |
| Respaldo alterado (4 bytes) | **no pasa** la verificación de SHA-256. `pg_restore` por sí solo sí aceptó el respaldo alterado: **la protección es el checksum**, no `pg_restore` |
| Funciones, políticas RLS, disparadores, restricciones (incluidas las `NOT VALID`), privilegios, RLS por tabla, columnas, índices, vistas, recuentos | idénticos al origen |
| Datos | idénticos fila por fila en todas las tablas de `public`, `auth` y `storage` (huella por tabla) |
| Aislamiento entre clínicas | cada propietario ve sus pacientes y 0 de la otra clínica |
| Usuario con cambio de contraseña pendiente | sigue restringido tras restaurar (0 pacientes; indicador conservado) |
| Consulta clínica sintética | se finaliza en la base restaurada y deja una sola nota; repetirla es idempotente |
| Conservación | plazo 6 restaurado, retención legal activa conservada, ninguna eliminación automática |
| Referencias a archivos | 0 fotografías y 0 documentos apuntan a un objeto inexistente (**solo metadatos; no hay archivos**) |
| Usuarios ↔ Auth ↔ clínica | los 5 usuarios tienen cuenta de Auth (**stub**) y clínica |
| Un propietario lee el historial de conservación | denegado (`42501`) |
| **Evidencia de aceptación legal** (una aceptación sintética de una versión ya no vigente, con su fecha original) | se conserva **tal cual** al restaurar (el disparador de la 106 solo actúa con sesión de usuario; probado también con una variante que sí lo rompe) |
| Marcadores de migraciones 085–106 | todos aplicados |
| Secretos en el respaldo (13,000+ líneas de SQL leídas) | ninguno reconocible |
| **Los controles pueden fallar** | con una política RLS eliminada tras restaurar se detectan 2 diferencias; con un dato alterado, 1 (evidencia en `docs/evidencias_restauracion/`) |

## Errores encontrados durante el ensayo
* La comparación de restricciones mostraba una diferencia que **no era de la restauración**: PostgreSQL imprime con otros paréntesis el mismo `CHECK` al recargarlo. Se corrigió la comparación (nombre, tipo y validez exactos; definición sin paréntesis).
* Mi primer control de la consulta clínica usaba una cita equivocada (fallaba igual en el origen): se corrigió.
* Mi primer guion «aprobó» comprobaciones en vacío cuando no existía el respaldo: ahora aborta y exige el resultado concreto esperado.

## Qué NO se pudo restaurar ni verificar
Auth real (cuentas y contraseñas de Supabase) · archivos de Storage (su contenido y que las URL resuelvan) · Edge Functions y secretos · configuración del proyecto de Supabase · copias automáticas del proveedor · tiempo real de recuperación (RTO) y pérdida tolerada (RPO), **pendientes de aprobación**.

## Evidencias (sin datos sensibles: solo conteos y huellas)
`docs/evidencias_restauracion/`: `resultado.txt`, `huella_origen.txt`, `huella_destino.txt`, `controles_funcionales.txt`, `respaldo.dump.sha256` y los resultados de los dos fallos simulados. Reproducible con `supabase/restauracion/prueba_restauracion_local.sh <ruta>/supabase` (solo toca bases `siro_rest_*`).
