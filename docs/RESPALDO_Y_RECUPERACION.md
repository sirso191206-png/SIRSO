# SIRO — Respaldo y recuperación

Probado localmente: los **rollbacks** de las migraciones 094–102 (esquema exacto anterior) y la **idempotencia** de 085–102. **No** se probó aquí un respaldo ni una restauración con Supabase real (ni sus copias automáticas, que dependen de tu plan): hazlo tú antes de confiar en él.

## 1. Qué respaldar
| Qué | Cómo |
|---|---|
| Base de datos | `pg_dump "$DB_URL" --format=custom --no-owner --file=respaldo_$(date +%Y%m%d_%H%M).dump` (con la cadena de conexión de TU proyecto, solo en tu terminal) |
| Archivos (`fotos-clinicas`, `documentos-clinicos`, `logos-clinicas`) | descárgalos con la herramienta que prefieras (panel o API de Storage). Los dos primeros son clínicos y privados: guárdalos cifrados y con acceso restringido |
| Secretos | guárdalos en tu gestor de secretos, **nunca** en el repositorio ni en el ZIP |
| Copias automáticas de Supabase | consulta en Database → Backups qué incluye tu plan (diarias, recuperación a un punto en el tiempo); no las des por supuestas |

## 2. Frecuencia y retención recomendadas (decisión tuya)
Antes de cada migración o despliegue; y una rutina periódica según cuánta pérdida de datos toleres. Los plazos de **conservación legal** de expedientes, facturas y contratos son distintos de los de respaldo y están en `CONFIGURACION_PENDIENTE.md`.

## 3. Probar la restauración (antes de necesitarla)
```bash
createdb siro_restauracion_prueba          # una base DISTINTA; nunca sobre la de producción
pg_restore --dbname=siro_restauracion_prueba --no-owner respaldo.dump
psql -d siro_restauracion_prueba -At -f supabase/verificacion/marcadores_de_migraciones_solo_lectura.sql   # todos true
```
Los roles propios de Supabase pueden producir avisos al restaurar fuera de Supabase: anótalos; no se probó aquí.

## 4. Recuperación ante un problema
1. **Una migración dio error:** son transaccionales; no quedó a medias. Corrige la causa o usa su rollback y no avances.
2. **Quieres retroceder una migración ya aplicada:** `supabase/rollback/<nnn>_rollback.sql`, de la más reciente a la más antigua (102 → 094). Cada rollback restituye el esquema exacto anterior y es re-ejecutable. La 100 REABRE la posibilidad de fabricar eventos de auditoría; la 095 usa la instantánea de `plataforma_config`.
3. **Datos dañados o borrados:** restaura el respaldo en una base nueva, compara y migra solo lo necesario. No sobrescribas producción sin comparar.
4. **Eliminación de una clínica:** está protegida (suspendida, con política de conservación definida, ARCO resueltos y confirmación con el nombre exacto). Si la limpieza de archivos o cuentas queda incompleta, el estado es `eliminada_con_limpieza_pendiente`: usa la acción `limpieza_pendiente` para ver qué falta y `reintentar_limpieza` para completarla (idempotente). Una eliminación completada NO se deshace: solo se recupera desde un respaldo.
5. **Un usuario dado de baja con la cuenta de acceso pendiente:** `eliminar-usuario` la deja DESACTIVADA (no puede iniciar sesión) y registra `eliminar_usuario_cuenta_pendiente` en la auditoría; elimínala desde Authentication → Users.

## 5. Nada de esto sustituye a un simulacro
Programa una restauración completa en un proyecto desechable al menos antes de salir a producción y tras cada cambio importante del procedimiento.
