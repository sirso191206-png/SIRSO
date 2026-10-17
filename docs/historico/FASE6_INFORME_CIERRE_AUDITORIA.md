# SIRO V1.0 — Fase 6: cierre de la auditoría de la fase 5 (versión CANDIDATA, no «lista para producción»)

Nada de esto se ha desplegado, ni ejecutado en Supabase de producción, ni subido a git. No se declara cumplimiento legal. Etiquetas: `CORREGIDO`, `VERIFICADO`, `FALLIDO`, `PENDIENTE DE ENTORNO`, `PENDIENTE DE DECISIÓN HUMANA`, `NO REPRODUCIDO`. Migraciones 001–093 (94 archivos: el prefijo 064 está duplicado desde antes).

## 1. Resultados reproducidos desde una carpeta limpia
Carpeta construida SOLO con el repositorio original (HEAD `15adb67`) + `SIRSO-fase2/3/4/5-correcciones.zip` + el candidato de la fase 6. Sin `.env`. Dependencias con `npm ci`. La base de pruebas se construyó **sin ningún parche manual**.
| Verificación | Comando / script | Resultado |
|---|---|---|
| Vitest | `npx vitest run` | **131 archivos, 1,709 pruebas**, 0 fallos — `VERIFICADO` |
| Vitest con el reloj desplazado | `faketime -f "-45d" / "+45d" / "+400d"` | 1,709 pasan en los tres — `VERIFICADO` |
| TypeScript · ESLint · importaciones huérfanas · build | `npx tsc --noEmit` · `npm run lint` · `npm run diagnostico:importaciones` · `npm run build` | sin errores · 0 avisos · 0 · correcto (modelo 3D `28712320…`, `sw.js` presente) — `VERIFICADO` |
| SQL (migraciones 001–093 desde cero) | 19 baterías `supabase/tests/*_test.sql` | **446 verificaciones, 0 fallos** — `VERIFICADO` |
| Concurrencia (2 sesiones reales) | `supabase/tests/concurrencia_finalizar.sh` | finalizar y completar pendiente: la 2.ª sesión espera y responde idempotente; 1 nota — `VERIFICADO` |
| PostgREST real 12.2.3 | `supabase/tests/postgrest/verificar_postgrest.mjs` | **62/62** — `VERIFICADO` |
| Edge Function en Deno real | `supabase/tests/deno/ejecutar_todo.sh` | **75/75** (Deno 1.46.3, supabase-js 2.45.0, PostgREST y PostgreSQL reales; **Auth y Storage simulados**) — `VERIFICADO` |
| Auditoría de migraciones 001–093 | `supabase/tests/auditoria_migraciones.sh` | 0 errores desde cero; repetible (0 y 0); esquema idéntico antes/después; 45 tablas / 4,510 filas intactas; 0 `SECURITY DEFINER` sin `search_path` — `VERIFICADO` |
| Consultas de solo lectura | `verificacion/estado_produccion_solo_lectura.sql` y `logos_solo_lectura.sql` | 0 errores; filas antes = después (610); un `INSERT` añadido se rechaza (`read-only transaction`) — `VERIFICADO` |
| Instalación existente simulada | 001–084 originales (007 original) + datos + 085–093 | datos idénticos y **mismo esquema** que la instalación nueva (`85e4df89…`) — `VERIFICADO` |
| Supabase real · navegador real | — | `PENDIENTE DE ENTORNO` |

## 2. Excepción de la fase 5 — `VERIFICADO` / `CORREGIDO`
La auditoría 001–092 y la consulta de solo lectura se repitieron desde la carpeta limpia. Defectos del propio guion, `CORREGIDO`: (a) con PostgreSQL apagado daba «0 errores» (falso verde); ahora falla si no conecta, si un `psql` termina con error o si la base no se construyó (umbral de tablas); (b) se había quedado en la 092 y no cubría la 093; (c) ya no aplica el parche manual de `archivado_en`.

## 3. Defectos corregidos y sus pruebas
| Defecto | Corrección | Prueba | Etiqueta |
|---|---|---|---|
| Prueba `citasReplicaVentana` con fechas fijas: pasaba o fallaba según el día (falló al pasar una semana; también en la carpeta de la fase 5) | se fija solo `Date` (no los temporizadores) | la propia prueba + suite completa con el reloj −45/+45/+400 días | `CORREGIDO` |
| Fila de espera: subía a pacientes de otra sucursal, ignoraba el sillón, podía abrir una 2.ª consulta simultánea y **«resucitaba»** a un paciente cancelado entre la lectura y la escritura | filtros por odontólogo, sucursal y sillón; no avanza si ya hay otra consulta; `UPDATE` condicional (`estado = 'en_espera'`) | `avanzarSiguienteEnEspera.test.js` (12) + prueba del hook (sucursal y sillón se transmiten) | `CORREGIDO` |
| Sin palanca para el límite de retrofecha de las notas | migración 093 (§4) | `nota_retrofecha_test.sql` 9/9; 9 mutaciones, 9 detectadas | `CORREGIDO` |
| Códigos nuevos de 091–093 desconocidos para el cliente (mensaje genérico, reintento infinito) | 5 códigos como rechazos definitivos con el mensaje del servidor | prueba bidireccional frontend↔SQL ampliada a 088–093 | `CORREGIDO` |
| Migraciones 007 y 038 fallaban en una base nueva | §5 (propuesta 003 aplicada) | auditoría desde cero (0 errores) | `CORREGIDO` |
Mutación en esta fase: SQL de la 093 (9/9). **No** se repitió la mutación del frontend de la fila de espera: `NO REPRODUCIDO` como cobertura de mutación (las pruebas existen y pasan, pero no se midió su sensibilidad).

## 4. Pendientes del flujo clínico
**Autoría y fecha de las notas — `VERIFICADO`.** El autor sale de `auth.uid()` (migración 092): un valor del cliente distinto de la sesión se rechaza (`NOTA_AUTOR_INCOHERENTE`); sin él se rellena. La fecha futura se acota a «ahora».
**Retrofecha configurable (093) — `CORREGIDO`; el valor es `PENDIENTE DE DECISIÓN HUMANA`.** Clave `plataforma_config.nota_retrofecha_max_horas` (entero 1–999999). **Sin valor por omisión = sin límite (como hasta ahora).** Inválida (`abc`, `0`, `-5`, `1.5`, vacía, `12 h`, 7 cifras) = se ignora. Con valor: una nota creada por un usuario con `creado_en` más antiguo que ahora−N horas se **rechaza** (`NOTA_FECHA_FUERA_DE_LIMITE`); no se «corrige» la fecha en silencio. No aplica a la operación administrativa. Solo el servicio puede cambiar la clave.
- *Captura sin conexión:* la nota viaja con su `creado_en` original; mientras no haya límite, se conserva. Con límite, una nota sincronizada tras más de N horas se rechaza y la cola la conserva como conflicto definitivo (mensaje del servidor); hay que decidir con el propietario si subir el límite o resolverla a mano.
- *Reloj del dispositivo vs. servidor:* se compara contra la hora del SERVIDOR. Un dispositivo adelantado queda acotado a «ahora» (pierde el orden fino de captura); uno atrasado «envejece» la nota y puede toparse con el límite. No se implementó una columna de «recibida en» (decisión de producto).
- *Finalización con una nota fuera del límite:* se revierte TODA la finalización (la cita no queda completada sin nota).
- *Decide el propietario del producto (con asesoría clínica/legal):* si hay límite, de cuántas horas, y qué hacer con las notas rechazadas. No se inventa una política clínica universal.
**Citas completadas — propuesta 004, `PENDIENTE DE DECISIÓN HUMANA`.** Medido con roles reales (cita completada con nota): propietario, recepción y el propio dentista asignado pueden dejarla en cancelada, no asistió o **agendada**; asistente y dentista ajeno no. La auditoría guarda actor y fecha de cada cambio, pero solo el estado **nuevo** (ni el anterior ni el motivo). Propuesta (no aplicada): trigger que impide el cambio directo de una cita completada a un usuario final + `fn_corregir_estado_cita(cita, estado, motivo)`: solo propietario, estados destino `cancelada/no_asistio/agendada`, motivo de 10–500 caracteres, auditoría con antes/después/motivo/actor/notas ligadas, idempotente (no duplica). Las notas siguen inmutables. Verificada: 8/8 y, en las demás baterías, solo cambia M4b (reabrir directamente), lo que la propuesta decide impedir. Parámetros a decidir: quién corrige, estados destino, longitud del motivo, si se permite reabrir (reabrir y finalizar de nuevo crea una 2.ª nota).
| Rol | Hoy (medido) | Propuesta 004 |
|---|---|---|
| Propietario | puede cambiar la cita completada directamente | solo por la corrección, con motivo |
| Recepción | puede (cancelar / no asistió) | no puede |
| Dentista asignado | puede (incluso reabrir) | no puede |
| Asistente / dentista ajeno | no puede | no puede |
**Fila de espera — `CORREGIDO`, `PENDIENTE DE DECISIÓN HUMANA` validar con la operación real.** Al finalizar desde la consulta, el siguiente pasa a consulta solo si es del MISMO odontólogo y la MISMA sucursal, si su sillón (si tiene) coincide, si el odontólogo no tiene ya a otra persona en consulta y si sigue en espera (cambio condicional). No se reordena la fila. Una urgencia sin odontólogo asignado nunca se avanza sola. Escenarios cubiertos con pruebas: varios dentistas, varias sucursales, sillones distintos, cancelación en medio, concurrencia. No se probó en un navegador real (`PENDIENTE DE ENTORNO`).

## 5. Propuestas 001–004 (en `supabase/propuestas/`; no se ejecutan solas)
| # | Estado | Detalle, riesgos y dependencias |
|---|---|---|
| 001 privilegios | `VERIFICADO` en SQL; `PENDIENTE DE DECISIÓN HUMANA` | 42 tablas + 3 vistas (`v_pacientes_seguro`, `v_saldo_pacientes`, `v_tratamientos_recepcion`); 240 privilegios `TRUNCATE/REFERENCES/TRIGGER` de `anon`/`authenticated` → 0. Ninguna función de `public` ni código de la app los usa (el proyecto ya los revocó en las 074/075 para tablas de catálogo). DML y RLS: huella idéntica; `service_role` conserva `TRUNCATE`. `verificar_propuesta_001.sh` (19 baterías con el parche aplicado; PostgREST 62/62 también, probado en la fase 5). Tablas futuras: revisar `pg_default_acl` en desarrollo. Riesgo: ninguno conocido; aun así, no sustituye una prueba en Supabase real |
| 002 logos | `PENDIENTE DE ENTORNO` + decisión | La migración 042 crea el bucket **público a propósito**; su comentario dice que la política `SELECT` «no se necesita» para servir por URL pública. Esa política abierta a `public` permite **listar los UUID de todas las clínicas** con la clave anon. Los logos solo se usan en flujos autenticados (imprimir receta, configuración); login y páginas públicas no. La propuesta limita el listado a la propia clínica (el `upsert` del propietario sigue funcionando); no cambia la visibilidad del bucket. Probada en SQL (2/2). **Falta confirmar en Supabase real** que la URL pública sigue cargando sin esa política (`logos_solo_lectura.sql` + pasos del encabezado). Alternativa (URLs firmadas) exige cambiar `imprimirReceta` y Configuración |
| 003 migraciones 007/038 | `CORREGIDO` (aplicada a la 007) | Ver §6 |
| 004 citas completadas | `PENDIENTE DE DECISIÓN HUMANA` | Ver §4 |

## 6. Migraciones 007 y 038 — procedimientos separados
Causa: la 007 y la 038 usan `pacientes.archivado_en`, que solo creaba la 040, y `create or replace view` no puede reordenar columnas. Corrección: en la 007, antes de recrear la vista, `alter table pacientes add column if not exists archivado_en` y `drop view if exists v_pacientes_seguro` (comprobado: tras 001–006 nada depende de esa vista; si algo dependiera, `drop view` fallaría sin `CASCADE`).
**Instalaciones NUEVAS:** aplicar 001–093 en orden (CLI o `psql`); verificado en modo estricto con 0 errores, sin parche manual.
**Instalaciones EXISTENTES:** no hacer nada con la 007 (ya se aplicó y no se vuelve a ejecutar; no es re-ejecutable ni lo era). Aplicar solo las migraciones pendientes (085–093). Verificado con una base existente simulada: datos idénticos y el mismo esquema que una instalación nueva. Riesgo documentado: se editó una migración histórica; si tu herramienta guarda un checksum de las migraciones aplicadas, la 007 mostrará una diferencia de contenido sin efecto de ejecución. `PENDIENTE DE DECISIÓN HUMANA` aceptarlo (alternativa descartada: una migración numerada antes de la última aplicada obliga a `--include-all` en instalaciones existentes).

## 7. Eliminación de clínicas — `VERIFICADO` (Deno real) / `PENDIENTE DE ENTORNO` (Supabase real)
Verificado en Deno real con Auth y Storage simulados (75/75): la identidad sale del JWT validado y un `solicitanteId` falsificado no afecta autorización ni auditoría; solo superadmin (propietario, dentista y propietario de otra clínica rechazados sin llegar a la base); validación de entradas antes de tocar la base (UUID, acción, nombre ≤ 200, booleano estricto) y errores inesperados genéricos con código `DB_<SQLSTATE>`; bloqueos por clínica activa, ARCO, datos recientes (clínico y fiscal por separado) y política indefinida; eliminación sin huérfanos con otra clínica intacta; fallo parcial de Storage y de Auth con estado `eliminada_con_limpieza_pendiente` y reanudación idempotente que **solo toca recursos de esa clínica** (aserción de extremo a extremo y, en la base, `ITEM_AJENO` rechaza rutas o cuentas ajenas a lo pendiente); auditoría que distingue eliminados, pendientes y fallidos; tres eliminaciones simultáneas (una tiene éxito). **No se declara cerrado contra Supabase real** (Auth y Storage reales, versión de Deno del Edge Runtime, límites de red).

## 8. Conservación de datos — `PENDIENTE DE DECISIÓN HUMANA` (sin valores configurados)
| Categoría | Parámetro (`plataforma_config`) | Valor actual | Si falta la política | Decisión pendiente | Quién aprueba | Efecto en eliminar una clínica |
|---|---|---|---|---|---|---|
| Clínica (expediente, notas, recetas, tratamientos, consentimientos, documentos, fotografías, signos, referencias, odontograma, periodontograma, citas completadas) | `retencion_expediente_anios` | ninguno (SIRO no define uno) | **BLOQUEA** si hay datos clínicos | años de conservación; la NOM-004-SSA3-2012 (mínimo de 5 años para el expediente) es una referencia que requiere validación legal contextualizada | propietario del producto + asesoría legal/sanitaria | bloqueada hasta definirla y hasta que pase el plazo desde el último movimiento |
| Fiscal (pagos y anulaciones) | `retencion_fiscal_anios` | ninguno | **BLOQUEA** si hay pagos | años de conservación fiscal | propietario del producto + contador | bloqueada igual |
| Contractual (suscripciones, aceptaciones legales) | `retencion_contractual_anios` | ninguno | solo **AVISA** (no bloquea) | si debe ser obligatoria y cuántos años | propietario del producto + asesoría legal | solo advertencia mientras no exista |
| Solicitudes ARCO e incidentes de seguridad abiertos | — | — | **BLOQUEA** si hay pendientes | — | propietario del producto | bloqueada hasta resolverlas |
Se conservan los bloqueos preventivos. Un valor inválido (0, negativo, decimal, > 3 cifras) cuenta como no definido. Una clínica sin pacientes ni pagos no necesita política. No se declara cumplimiento legal.

## 9. Pendientes de Supabase real (`PENDIENTE DE ENTORNO`)
Auth y Storage reales con clínicas desechables y datos ficticios; versión de Deno del Edge Runtime; que el bucket `logos-clinicas` sea público y que la URL siga cargando tras la propuesta 002; el comportamiento de `upsert` de logos; pruebas de aislamiento con usuarios reales de dos clínicas; login, agenda, consulta, recuperación de consultas incompletas, fila de espera y permisos por rol en un navegador; fallos de red y sincronización offline; modelo 3D y Service Worker en un navegador (el build los incluye).

## 10. Integración, respaldo, recuperación y despliegue futuro
**Integración:** copiar `SIRSO-fase6-correcciones.zip` sobre el árbol que ya tiene las fases 2–5 (solo archivos nuevos o modificados; sin `.env`, `node_modules`, `dist` ni `.git`). `supabase/propuestas/` no son migraciones.
**Plan de pruebas en Supabase de desarrollo:** proyecto nuevo; aplicar 001–093; `verificacion/estado_produccion_solo_lectura.sql` (esperado: 14 funciones nuevas y 4 triggers) y `logos_solo_lectura.sql`; desplegar `admin-eliminar-clinica` y repetir el recorrido de `edge_deno_integration.mjs` con clínicas desechables; probar las propuestas 001 y 002 y repetir las baterías; probar el frontend (finalizar, recuperar, fila de espera, offline).
**Respaldo:** antes de cualquier migración, respaldo completo de la base y de los buckets (`fotos-clinicas`, `documentos-clinicos`, `logos-clinicas`) y prueba de restauración en un proyecto aparte.
**Recuperación:** cada migración es transaccional y re-ejecutable (excepto la 007, que nunca lo fue); los triggers y funciones de 090–093 se retiran con `drop trigger` / `drop function` sin tocar datos (primero revertir la Edge Function y el frontend); ante daño de datos, restaurar el respaldo. Tras una eliminación con limpieza pendiente: `reintentar_limpieza` (no vuelve a eliminar la base) y `limpieza_pendiente` para consultar lo que falta.
**Despliegue futuro (solo con autorización explícita):** 1) respaldo; 2) consulta de solo lectura; 3) migraciones pendientes en orden (085–093 si vienes de la 084); 4) repetir la consulta; 5) Edge Function; 6) frontend y Service Worker; 7) definir las políticas de conservación; 8) decidir las propuestas 001, 002 y 004 y el límite de retrofecha. Nunca el frontend antes que las migraciones.

## 11. Decisiones humanas pendientes
Valores de las tres políticas de conservación y si la contractual es obligatoria; límite de retrofecha de las notas (si hay y cuánto); política de la propuesta 004; propuestas 001 y 002; aceptar la edición de la 007; validar el avance de la fila de espera con la operación real.
