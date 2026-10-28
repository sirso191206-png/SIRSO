# Respaldo diario automático de SIRO (auditoría P1-01)

Cada día, el Programador de tareas de Windows ejecuta `respaldo_diario.ps1` en esta PC:
1. **Volcado de solo lectura** de la base de producción (`public`, `auth` y `storage`). El script valida el destino antes de conectar y usa TLS.
2. **Descarga de todos los archivos de Storage** (fotos, documentos y logos) y comprueba su tamaño.
3. **Cifrado AES-256** (gpg simétrico) en un solo archivo: `C:\SIRO_RESPALDOS\diarios\SIRO_AAAAMMDD_HHMM.tar.gz.gpg` + `.sha256`.
4. **Restauración de prueba** de ese archivo cifrado en un PostgreSQL de Supabase desechable y sin red. Compara las filas de **cada tabla** con las del volcado; si hay una sola diferencia, el respaldo se marca como fallido.
5. **Copia del archivo cifrado a OneDrive** (`OneDrive\SIRO_RESPALDOS_CIFRADOS`). Se conservan 14 días en la PC y 30 en OneDrive.

**Si falla**, `C:\SIRO_RESPALDOS\diarios\ESTADO.txt` dice `FALLÓ`, aparece `SIRO_RESPALDO_FALLIDO.txt` en el Escritorio y se muestra un aviso en pantalla. El detalle queda en `diarios\registros\`, sin credenciales.

Los datos **sin cifrar** solo existen mientras corre el respaldo y se borran siempre al terminar. A OneDrive solo sube el archivo cifrado.

## Instalación (una vez)
1. En `C:\SIRO_RESPALDOS\conexion_prod.env` agrega una línea:
   `SUPABASE_SERVICE_ROLE_KEY=<valor>`
   El valor está en Supabase → *Project Settings → API Keys* (la `service_role` o una *secret key* `sb_secret_…`). Sirve para descargar los archivos de Storage. No lo compartas.
2. En PowerShell ejecuta: `powershell -ExecutionPolicy Bypass -File .\instalar_tarea.ps1` (por omisión a las 03:00; para otra hora: `-Hora 22:00`).
3. **Guarda la clave de cifrado** (`C:\SIRO_RESPALDOS\clave_respaldo.txt`) en tu gestor de contraseñas. **Sin ella los respaldos no se pueden abrir**, y si se pierde la PC, la copia de OneDrive es inútil sin esa clave.
4. Primera ejecución manual: `Start-ScheduledTask 'SIRO respaldo diario'` y revisa `ESTADO.txt`.

## Requisitos y límites
- La PC debe encenderse con regularidad: si está apagada a la hora programada, el respaldo corre en cuanto se enciende. Docker Desktop se arranca solo.
- **Respalda:** datos de la base (incluidas las cuentas de Auth) y archivos de Storage.
- **No respalda:** secretos de las Edge Functions, configuración de Auth (SMTP, URLs) ni el código. El código está en GitHub y los secretos deben guardarse en el gestor de contraseñas.

## Restaurar en un proyecto nuevo de Supabase (emergencia)
1. Descifra el archivo:
   `gpg -d --passphrase-file clave_respaldo.txt SIRO_….tar.gz.gpg | tar -xzf -`
2. En el proyecto nuevo, como superusuario: borra los esquemas `auth` y `storage`.
3. Ejecuta en una sola transacción: `auth_schema.sql`, `schema.sql`, `storage_schema.sql`, `SET session_replication_role = replica` y `data.sql`. Es el mismo orden de `restaurar_prueba.sh`, validado el 28/10/2026 con el respaldo real del 17/10: 49/49 conteos idénticos.
4. Sube la carpeta `storage/` a los buckets con el mismo nombre y ruta.
5. Vuelve a poner los secretos de las Edge Functions y despliégalas desde el repositorio.
