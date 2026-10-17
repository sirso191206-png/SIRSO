# SIRO — Plan de prueba de restauración

**Estado: PROCEDIMIENTO PREPARADO; RESTAURACIÓN REAL EN SUPABASE PENDIENTE.** Sí se ejecutó un ensayo de restauración de PostgreSQL en una instancia local desechable (ver `RESULTADO_PRUEBA_RESTAURACION.md`), pero **no es Supabase**: no ejercita Auth real, archivos de Storage, Edge Functions ni secretos. Hasta que ejecutes el §4 en un proyecto de DESARROLLO con respaldos reales, la restauración real no está verificada.

## 1. Qué se respalda y qué se reconstruye
| Componente | ¿Se respalda? | Cómo se recupera | Límite |
|---|---|---|---|
| Base de datos PostgreSQL (esquema y datos de `public`) | Sí: `pg_dump` formato custom | `pg_restore` en una base NUEVA | Probado localmente; en Supabase no |
| Esquema `auth` (cuentas de usuario) | Parcial: depende de cómo exportes | Un volcado de la base completa trae `auth.users` (con hashes de contraseña); restaurarlo en OTRO proyecto de Supabase puede no ser posible o no ser soportado | **No verificado.** Si no se restaura Auth, hay que re-crear las cuentas con `crear-usuario` y re-vincular los `usuarios.id`: procedimiento pendiente de definir |
| Archivos de Storage (`fotos-clinicas`, `documentos-clinicos`, `logos-clinicas`) | **No los incluye `pg_dump`** (solo los metadatos en `storage.objects`) | Copia aparte con la herramienta del proveedor y re-subida | **No verificado** |
| Configuración de Auth (URL del sitio, redirecciones, plantillas, política de contraseñas) | No (es configuración del proyecto) | Reconfigurar a mano según `INSTALACION_COMPLETA.md` | Debe documentarse y revisarse |
| Edge Functions y su configuración | El código sí (está en el paquete); los **secretos NO** | `supabase functions deploy` + `supabase secrets set` | Los secretos se guardan en un gestor aparte, nunca en el respaldo |
| Migraciones, documentación, archivos de configuración no secretos | Sí (el paquete y su manifiesto SHA-256) | Se reaplican | — |
| Secretos (`SERVICE_ROLE`, `RESEND_API_KEY`, llave SIS…) | **No** | Se vuelven a generar o se recuperan del gestor de secretos | Nunca exportes secretos a un ZIP ni a un `.env` versionado |

## 2. Objetivos (pendientes de aprobación)
**RPO** (pérdida máxima de datos tolerada) y **RTO** (tiempo máximo para volver a operar): **NO ACORDADOS.** Decide valores con base en cuánta información clínica puede perderse en un día y cuánto puede estar la clínica sin sistema. El tiempo medido en el ensayo local (0.6 s con datos sintéticos) **no sirve** como RTO real: depende del tamaño de la base, los archivos y la reconstrucción de Auth. Controles propuestos (a confirmar): respaldo antes de cada migración o despliegue, respaldo periódico, copia de archivos, SHA-256 de cada respaldo, almacenamiento cifrado con acceso restringido y retención definida (ver `POLITICA_CONSERVACION_DATOS.md`: los respaldos conservan lo que contengan hasta que su propio plazo lo permita).

## 3. Prerrequisitos
Un proyecto de Supabase de **DESARROLLO** (no producción) con un respaldo reciente; un segundo proyecto o base **vacía y distinta** como destino; `psql`, `pg_dump`, `pg_restore` (misma versión mayor o superior a la del servidor); acceso a Storage; el paquete de SIRO verificado (`sha256sum -c docs/MANIFIESTO_SHA256.txt`); datos de prueba **ficticios** (nunca pacientes reales). Variables solo en tu terminal: `ORIGEN_URL`, `DESTINO_URL`.

## 4. Procedimiento (ejecútalo tú; nunca sobre producción)
```bash
# 1) Respaldo del ORIGEN de desarrollo
pg_dump "$ORIGEN_URL" --format=custom --no-owner --file=respaldo.dump && sha256sum respaldo.dump > respaldo.dump.sha256
# 2) Integridad: debe decir OK; luego altera una COPIA y comprueba que ya no dice OK
sha256sum -c respaldo.dump.sha256
# 3) Restauración en un DESTINO NUEVO y distinto (nunca el origen, nunca producción)
pg_restore --no-owner --exit-on-error -d "$DESTINO_URL" respaldo.dump        # anota la duración y TODOS los errores
# 4) Esquema y datos: compara contra el origen las huellas que calcula el guion local (supabase/restauracion/prueba_restauracion_local.sh, funciones huella.sql y datos.sql)
# 5) Migraciones: ejecuta supabase/verificacion/marcadores_de_migraciones_solo_lectura.sql en el destino: todas en true
# 6) Controles funcionales sobre el destino (ver §5)
```
**Reversión:** el destino es desechable: se elimina (`drop database` o borrar el proyecto de prueba). El origen y producción no se tocan en ningún paso. Si el procedimiento tuviera que repetirse, empieza otra vez desde un destino vacío.

## 5. Qué debe verificarse tras restaurar (marca cada uno con evidencia)
| ☐ | Control |
|---|---|
| ☐ | SHA-256 del respaldo correcto y un respaldo alterado rechazado |
| ☐ | Restauración sin errores (o con una lista de errores explicados) y duración registrada |
| ☐ | Esquema, funciones, disparadores, políticas RLS, privilegios, restricciones e índices idénticos al origen |
| ☐ | Datos idénticos tabla por tabla (huella) y relaciones/restricciones válidas |
| ☐ | Usuarios de la aplicación asociados a su cuenta de Auth y a su clínica |
| ☐ | **Auth real:** iniciar sesión con una cuenta de prueba en el destino (depende de que se hayan restaurado o re-creado las cuentas) |
| ☐ | **Storage real:** los archivos existen y las referencias (`url_storage`) resuelven; la URL pública del logo responde |
| ☐ | Aislamiento: el propietario de una clínica no ve datos de la otra (dos clínicas de prueba) |
| ☐ | Una consulta clínica de prueba se finaliza una sola vez y es idempotente |
| ☐ | La política de conservación, las retenciones legales y el indicador de cambio de contraseña pendiente se conservan |
| ☐ | **Edge Functions:** desplegadas en el destino con sus secretos y responden |
| ☐ | Ausencia de secretos en el respaldo |
Los controles de PostgreSQL ya se ensayaron localmente (ver resultado); los marcados **real** requieren tu proyecto de Supabase.

## 6. Limitaciones que debes conocer
Una exportación de PostgreSQL **no** restaura automáticamente todo Supabase. Los roles gestionados por Supabase pueden producir avisos al restaurar fuera de su plataforma. Las políticas y funciones dependen de las extensiones y roles del proyecto destino (`anon`, `authenticated`, `service_role`). Las copias automáticas del proveedor dependen de tu plan: confirma su alcance antes de depender de ellas.
