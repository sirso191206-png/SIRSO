# Finalizar consulta, notas inmutables, 406 en `citas`, conservación y eliminación de clínicas

> **Actualización de la fase 4 (ver `docs/FASE4_INFORME_CANDIDATA_V1.md`):** este documento describe las migraciones 085–089. Dos afirmaciones de su §9 quedaron superadas: (1) ««Finalizar» en Mi día completa la cita sin pasar por la consulta» está **CORREGIDO** (migración 090); (2) la Edge Function **sí se ejecutó en Deno real** (55/55), con Auth y Storage simulados; la validación contra Supabase real sigue **PENDIENTE DE ENTORNO**. La migración 091 corrige además un defecto de integridad nota↔cita.


Migraciones nuevas: **085, 086, 087, 088 y 089** (aplicar en ese orden; las tres últimas **reemplazan** funciones de las anteriores con `CREATE OR REPLACE`). Nada se ha desplegado, ni ejecutado en Supabase, ni subido a git. Todas son aditivas y transaccionales: crean/reemplazan funciones y fijan un `search_path`; **ninguna borra ni modifica datos**.

> Nota sobre nombres: el archivo de la fase 2 es `087_sirso_conservacion_antes_de_eliminar_clinica.sql` (no existe un `087_sirso_retencion_clinica_v2.sql`). La revisión de la 087 dio lugar a la **089**.

## 0. Cómo se verificó (y qué NO)
| Nivel | Qué se ejecutó | Resultado |
|---|---|---|
| **Pruebas unitarias / de componentes** (Vitest, mocks) | suite completa | **127 archivos, 1,629 pruebas, 0 fallos** |
| **Edge Function** | su código real, cargado en **Node** con clientes de Supabase simulados (`edgeEliminarClinicaComportamiento.test.js`) | 17 pruebas. **No es el runtime de Deno.** |
| **SQL local** (PostgreSQL, migraciones 001–089 desde cero) | 14 baterías | **389 verificaciones, 0 fallos** |
| **Concurrencia real** (2 sesiones PostgreSQL) | `concurrencia_finalizar.sh` | la 2.ª sesión esperó 1.46 s y respondió `ya_finalizada`; 1 nota, 1 seguimiento |
| **PostgREST real 12.2.3** con JWT por rol | `verificar_postgrest.mjs` (una sola ejecución sobre una base **nueva**: el script no es idempotente) | **36 comprobaciones** como asume el código |
| **Mutación** | quitar cada protección y exigir que alguna prueba falle | 088/089: 90 mutaciones; los supervivientes fueron analizados (ver §9) |
| TypeScript / lint / build | `tsc --noEmit`, `npm run lint`, `npm run build` | sin errores / 0 avisos / correcto |
| **NO verificado** | Edge Function en Deno · Storage/Auth reales · navegador real · Supabase de producción | — |

## 1. Idempotencia de `fn_finalizar_consulta` (migración 088)
**Defectos (confirmados por lectura y reproducidos en `finalizar_consulta_idempotencia_test.sql`):**
* **A. Seguimiento:** `insert … on conflict (id) do nothing` y se continuaba sin comprobar nada. Un id que ya pertenecía a **otra cita** (o a otro paciente/horario/motivo) devolvía éxito con un `seguimiento_id` que no era el pedido.
* **B. Nota:** ante un id existente solo se comprobaban id + expediente + cita; un diagnóstico, exploración u hallazgo distintos —u otro autor— se aceptaban como «reintento».
* **C. «Completada» ≠ «confirmada»:** una cita completada respondía `ya_finalizada` sin mirar si la nota o el seguimiento de **esa** operación existían, ni si el motivo coincidía.

**Solución:** se **escribe solo** cuando la cita aún no está completada; sobre una ya completada la función **no escribe nada, jamás** (no repara en silencio). En **toda** ejecución se **relee y compara** cada efecto esperado:
* **Nota:** expediente, cita, **autor**, tipo, contenido, diagnóstico, CIE-10 (código y descripción), interrogatorio, exploración, acción de salud bucal, hallazgos, y que no tenga pronóstico, plan ni versión anterior. *No se comparan* `creado_en` (la hora de captura offline varía) ni `editado`.
* **Seguimiento:** paciente, odontólogo, sucursal, inicio, fin y motivo. `citas` **no tiene ninguna columna** que ligue un seguimiento con su cita de origen, así que «corresponde a la operación» solo puede comprobarse con esos campos (no se compara estado/turno/consultorio: avanzan legítimamente).

| Escenario | Resultado (verificado) |
|---|---|
| Primera finalización | `ya_finalizada:false`, `verificado:{nota:true, seguimiento:true}` |
| Doble clic (concurrente, 2 sesiones) | la 2.ª **espera** (FOR UPDATE) y responde `ya_finalizada:true`; 1 nota, 1 seguimiento |
| Respuesta perdida; reintento idéntico (incluso con el candado de concurrencia obsoleto, como la cola offline) | `ya_finalizada:true`, verificado, **nada nuevo** |
| Mismo id de nota, **otro contenido** (cualquier campo clínico, uno por uno) | `NOTA_CONFLICTO`; la original intacta |
| Nota existente de otro autor / de otra clínica / con pronóstico, plan o versión / otro expediente / otro tipo | `NOTA_CONFLICTO` (el mensaje no revela nada de la ajena) |
| Seguimiento con el id de **otra cita**, de **otra clínica** o **de la propia cita** (aunque con su mismo horario y motivo) | `SEGUIMIENTO_CONFLICTO`; se **revierte todo**; la cita ajena no se toca |
| Seguimiento existente con otro paciente / odontólogo / sucursal / inicio / fin / motivo | `SEGUIMIENTO_CONFLICTO` (cada campo por separado) |
| Cita completada **sin la nota** pedida · **sin el seguimiento** · sin ambos | `FINALIZACION_INCOMPLETA` (dice qué falta); **no se escribe nada** |
| Cita completada con **otro motivo** | `CONSULTA_CON_DATOS_DISTINTOS` |
| Reintento sobre completada **sin id** de nota/seguimiento | `ID_REQUERIDO_PARA_REINTENTO` |
| Conflicto de horario del seguimiento | `HORARIO_OCUPADO` y **rollback completo**; reintento con los mismos ids y otro horario funciona |
| Error de integridad **intermedio** (23503 inyectado tras crear la nota y completar la cita) | se propaga y **revierte todas** las escrituras |
| Sesión revocada / expirada | `SESION_CERRADA`, sin efectos. La operación es una transacción: una sesión que expira «a mitad» no deja efectos parciales |
| Asistente/recepción/otra clínica reintentando; plan sin notas | `ROL_NO_PERMITIDO` / `CITA_NO_ENCONTRADA` / `FUNCIONALIDAD_NO_INCLUIDA`: la idempotencia no esquiva la autorización |
| Payload de la cola offline (campos extra) y su reintento | funciona, verificado |

No concede `UPDATE` sobre notas; no contiene `UPDATE/DELETE/DO UPDATE` sobre `notas_clinicas` (probado); las 4 políticas de `notas_clinicas` y las 5 de `citas` no cambian.

## 2. Conservación por categorías (migración 089, sustituye a la 087)
**Hallazgos al revisar la 087 contra el esquema real:**
1. Faltaban la **apertura y el cierre del expediente**: están en `pacientes.creado_en` y `pacientes.archivado_en` (el expediente solo tiene `actualizado_en`, que cualquier edición reescribe).
2. Solo se evaluaba lo **clínico**: los **pagos** (fiscal) y las **suscripciones/aceptaciones legales** (contractual) se destruían sin política.

Una política de conservación **no** es autorización legal para eliminar: cada categoría se evalúa por separado. **Ninguna tiene valor por omisión.** Una política ausente, vacía, de espacios, `0`, negativa, decimal, con texto, de más de 3 cifras, con signo o con coma **no es política** (`plataforma_config.valor` es `NOT NULL`: «nula» = fila ausente).

| Categoría | Parámetro | Obligatoria cuando… | Fechas (campo real) |
|---|---|---|---|
| **Clínico** | `retencion_expediente_anios` | hay información clínica | `pacientes.creado_en`, `pacientes.archivado_en`, `expedientes.actualizado_en`, `notas_clinicas.creado_en`, `recetas.creado_en`, `tratamientos.creado_en`, `consentimientos_informados.creado_en`, `documentos_clinicos.creado_en`, `fotografias.fecha_captura`, `signos_vitales.creado_en`, `referencias_medicas.creado_en`, `odontograma_historial.creado_en`, `odontograma_piezas.actualizado_en`, `periodontograma_historial.creado_en`, `periodontograma_piezas.actualizado_en`, `citas.inicio` (solo **completadas**) |
| **Fiscal** | `retencion_fiscal_anios` | la clínica tiene pagos | `pagos.creado_en`, `pagos.anulado_en` |
| **Contractual** | `retencion_contractual_anios` | **opcional**: sin política **no bloquea** pero **avisa** (`CONTRACTUAL_NO_EVALUADO`); con política, bloquea dentro del plazo | `suscripciones.created_at/updated_at/fecha_fin`, `legal_acceptances.aceptado_en` |

*Decisión de diseño que debes validar:* si la contractual fuera obligatoria, **toda** clínica (todas tienen suscripción) —incluida una clínica de pruebas recién creada— quedaría bloqueada. El aviso queda en la vista previa y en la auditoría. Defínela cuando tu asesoría legal lo decida (cuando existe, una clínica recién creada **sí** queda bloqueada: es la consecuencia buscada).

Además bloquean (con o sin datos): **ARCO** sin resolver (`recibida`, `en_revision`, `requiere_informacion`, `aprobada`) e **incidente** abierto (`detectado`, `en_investigacion`, `contenido`). Una clínica **sin pacientes ni pagos** no necesita política clínica ni fiscal.

**Comprobado:** cada fuente aporta su fecha **exacta** (último registro = esa fecha, conservar hasta = +N años), **fronteras al microsegundo** (en el instante exacto del plazo permite; 1 µs antes bloquea; 1 µs después permite), varias fuentes con fechas distintas (manda la más reciente), expediente sin notas (manda la apertura), políticas inválidas valor por valor, categorías independientes, y que el servidor decide: `fn_eliminar_clinica` **no recibe ninguna fecha, plazo ni política** del cliente (la Edge Function envía solo 4 parámetros; el solicitante sale del token).

## 3. Eliminación de clínicas
Solo un **superadmin** (`service_role`); la clínica **suspendida**; nombre exacto y, si hay pacientes, confirmación explícita; no la propia ni una que aloje un superadmin; conservación por categorías, ARCO e incidentes. **Sin `ON DELETE CASCADE` global**; una transacción; la otra clínica queda intacta. **`authenticated`, `anon` y `public` no pueden ejecutar ninguna función destructiva ni de limpieza** (verificado también por PostgREST: 403 `42501`). *Suspender* sigue siendo la vía para revocar el acceso sin destruir nada.

**Auth y Storage NO comparten transacción con PostgreSQL: la eliminación completa NO es atómica entre los tres sistemas.** Por eso:
* La **lista completa** de archivos y cuentas pendientes se guarda en la auditoría **dentro de la transacción del borrado** (antes solo se guardaban conteos): si la Edge Function se interrumpe después, nada se pierde.
* La Edge Function limpia, **registra lo que sí logró y lo que falló** (`fn_registrar_limpieza_clinica`: solo acepta elementos de la lista original y solo de un superadmin) y responde con el **estado real**: `eliminada_completa` o `eliminada_con_limpieza_pendiente`. Si ni siquiera puede registrar el avance, dice «pendientes desconocidos». **Jamás declara «todo eliminado» si no lo está** (la interfaz tampoco).
* Lo pendiente se consulta con `fn_limpieza_pendiente_clinica` y se **reanuda** con la acción `reintentar_limpieza` (no vuelve a eliminar la clínica).
* Los intentos **rechazados** quedan registrados (`intento_eliminar_clinica_rechazado`); la auditoría de la eliminación conserva quién, qué clínica, conteos, lo que se conserva, **las políticas y fechas evaluadas en el servidor**, la confirmación y las listas de limpieza.

## 4. Archivos de esta fase (respecto a `SIRSO-fase2-correcciones.zip`)
**Migraciones nuevas:** `088_sirso_finalizar_consulta_verificada.sql`, `089_sirso_conservacion_por_categorias_y_limpieza.sql` (las 085–087 no cambian respecto a la fase 2).
**Edge Function:** `supabase/functions/admin-eliminar-clinica/index.ts`.
**Frontend:** `hooks/useConsultaForm.js`, `lib/finalizarConsulta.js`, `lib/eliminarClinica.js`, `services/admin.js`, `components/administracion/ModalEliminarClinica.jsx`.
**Pruebas SQL / scripts:** `finalizar_consulta_test.sql`, `finalizar_consulta_idempotencia_test.sql` (nueva), `eliminar_clinica_test.sql`, `conservacion_categorias_test.sql` (nueva), `concurrencia_finalizar.sh` (nueva), `postgrest/verificar_postgrest.mjs`.
**Pruebas Vitest:** `edgeEliminarClinicaComportamiento.test.js` (nueva), `eliminarClinicaFrontend.test.js`, `finalizarConsultaFrontend.test.js`, `useConsultaFormFinalizar.test.js`, `offline/procesadorCola.test.js`.
**Documentación:** este archivo.

## 5. Verificación PREVIA en producción (solo lectura)
```sql
-- ¿Qué hay aplicado? (esperado antes de aplicar 085–089: 0 en las funciones nuevas)
select count(*) from pg_proc where proname in ('fn_finalizar_consulta','fn_eliminar_clinica','fn_clinica_resumen_eliminacion','fn_limpieza_pendiente_clinica','fn_registrar_limpieza_clinica','fn_registrar_intento_eliminacion','fn_politica_anios');
select '078' m, count(*) from pg_proc where proname in ('fn_sesion_activa','fn_estado_sesion','fn_sesion_jwt','fn_proteger_tablas_con_sesion')       -- 4 (la 085 requiere la 078)
union all select '084', count(*) from information_schema.columns where table_name='usuarios' and column_name='ejerce_como_dentista';                -- 1
-- privilegios reales de notas_clinicas (esperado: sin UPDATE ni DELETE)
select privilege_type from information_schema.role_table_grants where table_name='notas_clinicas' and grantee='authenticated' order by 1;
-- políticas de conservación vigentes (esperado: 0 filas = no definidas; SIRO no define ninguna por ti)
select clave, valor from plataforma_config where clave like 'retencion_%';
-- estado de la conservación hoy (¿hay datos que bloquearán eliminaciones?)
select count(*) filter (where estado = 'suspendida') suspendidas, count(*) total from clinicas;
select count(*) pendientes from arco_solicitudes where estado in ('recibida','en_revision','requiere_informacion','aprobada');
select count(*) abiertos from incidentes_seguridad where estado in ('detectado','en_investigacion','contenido');
-- SECURITY DEFINER sin search_path fijo (esperado tras la 085: 0)
select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and not exists (select 1 from pg_options_to_table(p.proconfig) where option_name='search_path');
-- Eliminaciones previas con limpieza pendiente (después de aplicar 089)
select entidad_id, creado_en, detalle->'limpieza'->>'estado' from auditoria where accion='eliminar_clinica' order by creado_en desc;
```

## 6. Despliegue (orden estricto; el frontend nunca antes que las migraciones)
1. **Respaldo** y comprobar que se puede restaurar. 2. Ejecutar §5 y confirmar. 3. Aplicar **085, 086, 087, 088, 089** en orden (cada una es una transacción y se puede re-ejecutar; si ya aplicaste 085–087 en algún entorno, bastan 088 y 089).
4. Comprobar privilegios: `select proname, has_function_privilege('authenticated', oid, 'EXECUTE') from pg_proc where proname in ('fn_eliminar_clinica','fn_clinica_resumen_eliminacion','fn_limpieza_pendiente_clinica','fn_registrar_limpieza_clinica','fn_registrar_intento_eliminacion','fn_politica_anios');` → **todo `false`**. Y `fn_finalizar_consulta` → `true` para `authenticated`, `false` para `anon`.
5. `supabase functions deploy admin-eliminar-clinica`. 6. Frontend (`npm ci`, `npm run build`). 7. Actualizar el Service Worker.
8. **Definir las políticas** (decisión tuya y de tu asesoría legal; sin ellas, ninguna clínica con información clínica o pagos se puede eliminar, a propósito):
```sql
insert into plataforma_config (clave, valor) values ('retencion_expediente_anios', '<AÑOS>'), ('retencion_fiscal_anios', '<AÑOS>'), ('retencion_contractual_anios', '<AÑOS, opcional>')
on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();
```
*Referencia a validar con tu asesor, no asesoría legal:* entiendo que la **NOM-004-SSA3-2012** exige conservar el expediente clínico un mínimo de 5 años desde el último acto médico; los plazos fiscales y contractuales los define tu contador/abogado.

## 7. Procedimiento de prueba con una clínica desechable
1. Crea una clínica de prueba desde el panel de administración (sin pacientes) y, como su owner, una cita y finaliza una consulta (**ya hay pacientes**: es el caso con datos).
2. **Con política indefinida:** como superadmin, suspende la clínica y abre «Eliminar»: debe bloquear con `POLITICA_CONSERVACION_NO_DEFINIDA` (y `POLITICA_FISCAL_NO_DEFINIDA` si registraste un pago). No debe aparecer el botón habilitado.
3. **Dentro del plazo:** define `retencion_expediente_anios = 5`: debe bloquear con `DENTRO_PLAZO_CONSERVACION` y la fecha.
4. **Clínica sin datos clínicos:** crea otra, **sin pacientes**; suspéndela: vista previa sin bloqueos (con el aviso contractual) y elimínala con el nombre exacto. Comprueba: `estado = eliminada_completa`; no quedan filas en `usuarios` ni `clinicas`; las cuentas de Auth y el logo de Storage ya no existen; otra clínica sigue intacta.
5. **Falla de limpieza (simulada):** renombra temporalmente el bucket de logos o usa una clínica cuyo owner tenga archivos protegidos; elimina y verifica `eliminada_con_limpieza_pendiente`; consulta `limpieza_pendiente`; corrige la causa y ejecuta `reintentar_limpieza` hasta `eliminada_completa`.
6. **Autorización:** como **owner** de una clínica intenta eliminar (UI y `POST /rest/v1/rpc/fn_eliminar_clinica`): debe dar 403.
7. Revisa la auditoría: `eliminar_clinica`, `limpieza_eliminar_clinica`, `intento_eliminar_clinica_rechazado`.

## 8. Recuperación ante un fallo
* **Una migración falla a medias:** cada una es una transacción (`begin … commit`): no deja efectos parciales; corrige la causa y vuelve a ejecutarla (es re-ejecutable).
* **Volver al comportamiento anterior de una función:** re-ejecuta la migración anterior que la define (`CREATE OR REPLACE`). Las funciones nuevas se pueden quitar sin tocar datos: `drop function fn_limpieza_pendiente_clinica(uuid), fn_registrar_limpieza_clinica(uuid,uuid,jsonb,jsonb,jsonb), fn_registrar_intento_eliminacion(uuid,uuid,text,text), fn_politica_anios(text);` (primero revierte la Edge Function, que las llama).
* **Una finalización devuelve `FINALIZACION_INCOMPLETA` / `*_CONFLICTO`:** no se escribió nada; es un estado que alguien debe revisar. Si la cita se completó desde «Mi día» sin nota: agrega la nota desde el **expediente**. Si un `NOTA_CONFLICTO` aparece por una nota ya existente con otro contenido, **no se sobrescribe**: guarda la nueva como nota nueva (id nuevo).
* **Una eliminación quedó con limpieza pendiente (incluida una interrupción de la Edge Function):** la lista está en la auditoría; ejecuta `reintentar_limpieza` con ese `clinicaId`; consulta `limpieza_pendiente` hasta `limpieza_completa = true`.
* **Datos reales alterados por error:** restaura el respaldo del paso 1; estas migraciones no modifican datos.

## 9. Riesgos pendientes y mutantes analizados
* **La Edge Function no se ha ejecutado en Deno ni contra Supabase real**: pruébala primero con una clínica desechable (§7). La API real de Storage/Auth tampoco.
* La **política contractual opcional** y los **valores** de las tres políticas son decisiones legales/de negocio pendientes.
* «Finalizar» en **Mi día** completa la cita sin pasar por la consulta (decisión previa); con 088 un reintento de «Guardar y finalizar» sobre esa cita da `FINALIZACION_INCOMPLETA` (explícito, no silencioso).
* «Guardar borrador» sigue creando una nota por pulsación (diseño previo).
* La limpieza de Auth/Storage **no es atómica** con la base: puede quedar pendiente (registrada y reanudable).
* **Mutantes que sobreviven, todos equivalentes (no son lagunas):** quitar el `REVOKE … anon/authenticated` en una migración **posterior** a la que creó la función (`CREATE OR REPLACE` conserva los privilegios previos; las funciones nuevas de la 089 sí se detectan); y, en la Edge Function, `!errorRegistro` en el cálculo de «completa» (si falla el registro `restante` es `null` y la condición ya es falsa).
