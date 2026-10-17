# SIRO — Respaldos y recuperación

## Qué hay que proteger

| Qué | Dónde vive | ¿Lo cubre el respaldo de la base? |
|---|---|---|
| Pacientes, expedientes, citas, pagos, usuarios, planes, auditoría, políticas de seguridad | Base de datos PostgreSQL (Supabase) | **Sí** |
| Cuentas y contraseñas (correo, sesiones) | Supabase Auth (esquema `auth`) | Depende del plan/herramienta de Supabase; **verificar** |
| Fotografías, documentos clínicos y logos (el contenido de los archivos) | Supabase Storage | **No**: el respaldo de la base guarda solo la lista de archivos, no su contenido. Hay que respaldarlos aparte |
| Cambios hechos sin conexión y todavía sin subir | IndexedDB del navegador de cada persona | No es un respaldo: se sube al volver Internet. **No cerrar sesión con cambios pendientes** (SIRO lo advierte) |
| El código | Repositorio | Es el respaldo del código |

## Lo que debe confirmarse en TU proyecto de Supabase (no se pudo verificar desde aquí)

Llena esta tabla con los valores reales de tu panel de Supabase. **No se asume ninguno.**

| Dato | Valor real | Dónde verlo |
|---|---|---|
| ¿Hay respaldos automáticos diarios? | _______ | Panel → Database → Backups |
| ¿Cuántos días se conservan? | _______ | Mismo lugar (depende del plan contratado) |
| ¿Está activado el respaldo punto-en-el-tiempo (PITR)? | _______ | Mismo lugar (suele ser un complemento de pago) |
| Región donde viven los datos | _______ | Panel → Settings → General |
| ¿Quién puede iniciar una restauración? | _______ | Tu organización de Supabase |

Metas sugeridas, para que las defina el negocio: **RPO** (cuántos datos aceptas perder) y **RTO** (cuánto tiempo aceptas estar sin servicio). Sin PITR, el RPO es hasta el último respaldo diario.

## Respaldo de archivos (Storage)

El contenido de `fotos-clinicas`, `documentos-clinicos` y `logos-clinicas` debe copiarse por separado (por ejemplo con la herramienta de línea de comandos de
Supabase o con una herramienta compatible con S3 hacia un almacenamiento propio), con la frecuencia que decidas. **Pendiente de definir y probar.** Mientras
no exista, una pérdida de Storage no se puede recuperar.

## Prueba de recuperación hecha (ambiente controlado)

`supabase/tests/prueba_recuperacion.sh` hace, sobre PostgreSQL **local** (no es Supabase):

1. Siembra datos de demostración (2 clínicas, 250 pacientes, 120 citas, 100 pagos, 80 notas, 40 archivos de Storage registrados).
2. Respalda con `pg_dump` (formato personalizado).
3. Restaura en una base **nueva**.
4. Compara origen contra restaurada: filas de cada una de las 42 tablas, objetos de Storage, tablas con RLS, 147 políticas, 9 políticas de Storage,
   314 funciones, 51 triggers, 105 índices, el índice único del CURP por clínica y los interruptores de plataforma.
5. Corre las auditorías de aislamiento entre clínicas **sobre la base restaurada**: si las políticas de seguridad no hubieran sobrevivido, fallarían.

**Resultado de la última corrida: 0 diferencias** (todas las comparaciones iguales; aislamiento 36/36 y auditoría 17/17 sobre la base restaurada).

Lo que esta prueba **no** demuestra: que el respaldo de **Supabase** se restaure igual, que Auth conserve las cuentas, ni que los archivos de Storage se recuperen
(eso exige una prueba en un proyecto Supabase de pruebas). Repetirla allí es parte del checklist de producción.

## Procedimiento de recuperación (resumen)

1. Avisar a las clínicas: SIRO queda en pausa.
2. Restaurar el respaldo de la base en un proyecto **nuevo** (no sobre el de producción) y validar con `prueba_recuperacion.sh` (pasos 4 y 5 contra esa base).
3. Restaurar Storage desde la copia propia.
4. Apuntar la aplicación al proyecto restaurado (variables `VITE_SUPABASE_URL` y llave pública) y volver a desplegar.
5. Los navegadores con cambios pendientes los subirán solos al reconectar; los conflictos (límite de plan, CURP duplicado) quedan para revisión.
6. Revisar la auditoría: se pierde lo ocurrido después del respaldo restaurado.

## Frecuencia recomendada de pruebas
Una restauración completa de prueba **antes de salir a producción** y luego cada trimestre, o tras cambios grandes de estructura. Anotar fecha y resultado.
