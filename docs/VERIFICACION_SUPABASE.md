# SIRO — Verificación en Supabase (la ejecutas tú, en un proyecto de DESARROLLO)

Estas comprobaciones **no se pudieron ejecutar localmente** (Auth, Storage, el runtime de Edge Functions y la CLI de migraciones son de Supabase real) y por eso las ejecutas tú. Hasta que las hagas, todo lo de aquí está `PENDIENTE DE ENTORNO REAL`.

## 0. Reglas de seguridad (léelas antes de empezar)
* **Solo un proyecto de DESARROLLO desechable**, creado para esto. Nunca producción. Antes de cada comando destructivo comprueba que la URL es la del proyecto de desarrollo.
* **No guardes credenciales en ningún archivo del proyecto.** Usa variables de entorno solo en tu terminal (y bórralas al terminar): `SUPABASE_URL`, `ANON_KEY`, `DEV_DB_URL`. La clave `service_role` y la cadena de conexión **no deben** pegarse en el repositorio, en capturas ni en el chat.
* Datos **ficticios** únicamente (correos `qa+…@example.com`, nombres inventados). Las cuentas se crean con la API de administración, que no envía correos.
* Las llamadas de abajo usan la API HTTP estándar de Supabase (`/auth/v1`, `/rest/v1`, `/storage/v1`, `/functions/v1`). Verifica los detalles contra la documentación de la versión que use tu proyecto; si algún comportamiento difiere, anótalo.

```bash
export SUPABASE_URL="https://<ref-de-DESARROLLO>.supabase.co"
export ANON_KEY="<anon key de DESARROLLO>"
# tokens de cada usuario de prueba (se obtienen en §B.2): TOK_SUPER, TOK_OWNER_A, TOK_DENT_A, TOK_RECEP_A, TOK_ASIS_A, TOK_OWNER_B
```

## A. Verificación de migraciones
**A.1 Orden y dependencias.** Las migraciones se aplican en orden numérico `001 → 106` (107 archivos: el prefijo 064 está repetido desde el origen; se aplican ambos). Una base NUEVA acepta todo el rango desde cero (verificado localmente con PostgreSQL, en modo estricto y sin parches manuales). Una base EXISTENTE solo necesita las pendientes. Dependencias relevantes: la 085 requiere la 078 (sesiones); 086–089 la 001; la 088 reemplaza la función de la 085; la 089 reemplaza la de la 086/087; la 091 y la 092 añaden disparadores independientes (la 092 usa las columnas de la 091 solo en el sentido de que ambas validan referencias de notas y citas); la 093 y la 097 reemplazan la misma función de disparador (la 097 debe ir después de la 093); la 098 reemplaza la función de referencias de citas de la 092.
**A.2 Cómo saber cuáles ya están aplicadas.** Ejecuta en el SQL Editor (solo lectura, `BEGIN READ ONLY`):
* `supabase/verificacion/marcadores_de_migraciones_solo_lectura.sql` → una fila por migración 085–106 con `aplicada = true/false`. Todas `true` = al día. La primera `false` es la primera pendiente; aplica desde ahí, en orden.
* `supabase/verificacion/estado_produccion_solo_lectura.sql` → estado de dependencias, privilegios, políticas y datos que interactúan con las migraciones. **Resultados esperados DESPUÉS de aplicar todo:** 38 funciones nuevas presentes; 16 nombres de triggers distintos; `authenticated` sin `UPDATE`/`DELETE` sobre `notas_clinicas`; 4 políticas en `notas_clinicas`; 0 `SECURITY DEFINER` sin `search_path` (en una base antigua pueden salir `fn_auditoria` y `fn_marcar_nota_editada` hasta la 085); ninguna tabla con `clinica_id`/`paciente_id` sin RLS; `service_role` con `rolbypassrls = true` y `authenticated`/`anon` en `false`; conservación: 0 filas hasta que decidas las políticas; las cuentas de «notas con cita de otro paciente», «citas con odontólogo/sillón de otra clínica» y «notas firmadas por usuario de otra clínica» deben ser 0 (si no lo son, son datos legados que las migraciones NO modifican: revísalos aparte).
* Si tu proyecto aplicó migraciones con la CLI, además existe el historial `supabase_migrations.schema_migrations`; consúltalo solo para LEER (`select version, name from supabase_migrations.schema_migrations order by 1;`). Si aplicaste a mano con `psql`, ese historial puede no existir: usa los marcadores.
**A.3 Riesgos de repetir una migración.** Las migraciones **085–105** están diseñadas para poder re-ejecutarse (`create or replace`, `drop … if exists`, `on conflict`, `if not exists`) y la auditoría local lo verificó (re-ejecutarlas dos veces no da error ni cambia el esquema). **La 007 y las anteriores a la 085 NO se pueden re-ejecutar** en una base que ya las tiene (la 007 nunca lo fue: `create or replace view` falla si las columnas ya cambiaron). Por tanto: nunca vuelvas a lanzar el rango completo sobre una base existente; lanza solo las pendientes.
**A.4 Cómo aplicar (sin la CLI, recomendado):** `psql "$DEV_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/<archivo>.sql` una por una, en orden, y repite el marcador de A.2. Si usas la CLI, no ejecutes `db reset` ni `db push` contra nada que no sea el proyecto de desarrollo.
**A.5 Respaldo y recuperación.**
```bash
pg_dump "$DEV_DB_URL" --format=custom --no-owner --file="respaldo_antes_de_la_migracion.dump"   # lógico, con la cadena de conexión de DESARROLLO
```
Respalda también los objetos de Storage de los tres buckets (`fotos-clinicas`, `documentos-clinicos`, `logos-clinicas`) con la herramienta que prefieras (el panel o la API de Storage). Comprueba que el respaldo se puede restaurar en una base nueva (`pg_restore --dbname="<otra base>" --no-owner respaldo.dump`) ANTES de depender de él. Para retroceder una migración: `supabase/rollback/09X_rollback.sql` en orden inverso (106 → 094); `supabase/rollback/verificar_rollbacks.sh` demuestra, en una base local, que cada uno devuelve el esquema exacto. **No borres la fila `rollback_095_privilegios` de `plataforma_config` antes de retroceder la 095.** Ante daño de datos: restaurar el respaldo.

## B. Auth, Storage y aislamiento
**B.1 Preparar dos clínicas y un superadministrador de prueba.** Crea en el panel (Authentication → Users) un usuario de plataforma `qa+super@example.com` y márcalo como superadministrador en `usuarios` con el SQL Editor (`es_super_admin = true`, rol `owner`, en una clínica de plataforma de prueba; si ya tienes el procedimiento de alta de superadmin, úsalo). Obtén su token (B.2). Crea las clínicas con la Edge Function de administración (requiere haberla desplegado, §C):
```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/admin-crear-clinica" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOK_SUPER" -H "Content-Type: application/json" \
  -d '{"nombreClinica":"QA Clinica A","ownerNombre":"QA Owner A","ownerCorreo":"qa+a-owner@example.com","planCodigo":"empresarial","modalidad":"mensual"}'   # responde correo y passwordTemporal
# repite para «QA Clinica B» / qa+b-owner@example.com y una tercera «QA Clinica C vacia» (sin pacientes ni pagos, para probar la eliminación)
```
Con el token del propietario A crea odontólogo, recepción y asistente (la clínica sale de TU perfil, nunca del cuerpo):
```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/crear-usuario" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOK_OWNER_A" -H "Content-Type: application/json" \
  -d '{"correo":"qa+a-dent@example.com","nombre":"QA Dentista A","rol":"dentista"}'     # roles: dentista | recepcion | asistente
```
Crea en cada clínica 1–2 pacientes ficticios desde la app (o por REST) y una cita por paciente.
**B.2 Token de cada usuario:**
```bash
curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" -H "apikey: $ANON_KEY" -H "Content-Type: application/json" -d '{"email":"qa+a-owner@example.com","password":"<passwordTemporal>"}'   # copia access_token → TOK_OWNER_A
```
**B.3 Permisos por rol y aislamiento (REST).** Sustituye los ids por los de tus datos. Resultado esperado entre paréntesis.
| # | Llamada | Esperado |
|---|---|---|
| 1 | `GET /rest/v1/pacientes?select=id` con `TOK_OWNER_A` | solo pacientes de A |
| 2 | Misma llamada con `TOK_OWNER_B` filtrando por un id de A: `?id=eq.<id de A>` | `[]` |
| 3 | `PATCH /rest/v1/pacientes?id=eq.<id de A>` con `TOK_OWNER_B` y cuerpo `{"nombre_completo":"X"}` | `[]` / 0 filas, sin cambios |
| 4 | `GET /rest/v1/notas_clinicas` con `TOK_RECEP_A` y con `TOK_ASIS_A` | `[]` (no ven notas) |
| 5 | `POST /rest/v1/notas_clinicas` con `TOK_DENT_A` y `usuario_id` de OTRA persona | 400, `hint: NOTA_AUTOR_INCOHERENTE` |
| 6 | Misma nota con `cita_id` de un paciente de B | 400, `hint: NOTA_CITA_INCOHERENTE` (igual que con un id inexistente) |
| 7 | `PATCH /rest/v1/notas_clinicas` / `DELETE` con `TOK_OWNER_A` | sin permiso (401/403/0 filas): las notas son inmutables |
| 8 | `PATCH /rest/v1/citas?id=eq.<cita en consulta>` con `{"estado":"completada"}` (cualquier rol) | 400, `hint: COMPLETAR_SOLO_VIA_CONSULTA` |
| 9 | Finalizar una consulta: `POST /rest/v1/rpc/fn_finalizar_consulta` con `TOK_DENT_A` | 200 (y una repetición con los mismos ids: `ya_finalizada: true`, sin duplicar) |
| 10 | `PATCH` del estado de esa cita ya completada con `TOK_RECEP_A` / `TOK_OWNER_A` | 400, `hint: CORREGIR_ESTADO_REQUIERE_MOTIVO` |
| 11 | `POST /rest/v1/rpc/fn_corregir_estado_cita` con `{"p_cita":"<id>","p_estado":"agendada","p_motivo":"Prueba de reapertura QA"}`: con `TOK_DENT_A` (responsable) → 200; con `TOK_RECEP_A` → 400 `ROL_NO_PERMITIDO`; con `TOK_DENT_A` y `p_estado:"cancelada"` → 400 `ESTADO_NO_PERMITIDO_PARA_ROL`; con motivo corto → 400 `MOTIVO_REQUERIDO`; con `TOK_OWNER_B` → 400 `CITA_NO_ENCONTRADA` | como se indica |
| 12 | `PATCH /rest/v1/citas?id=eq.<id>` con `{"dentista_id":"<usuario de B>"}` y `TOK_OWNER_A` | 400, `hint: CITA_DENTISTA_INCOHERENTE` |
| 13 | `POST /rest/v1/recetas` con `dentista_id` de B / `POST /rest/v1/pagos` con `registrado_por` ajeno o `tratamiento_id` de otro paciente | 400 con `REFERENCIA_DENTISTA_INCOHERENTE` / `ACTOR_INCOHERENTE` / `REFERENCIA_TRATAMIENTO_INCOHERENTE` |
| 14 | Nota con `creado_en` de dentro de 3 horas | 201, `creado_en` ≤ ahora y `creado_en_cliente` conserva lo enviado |
| 15 | `POST /rest/v1/auditoria` con `TOK_OWNER_A`, `usuario_id` propio y `accion:"eliminar_clinica"` (o `crear_usuarios`, etc.) | 403 `42501`: la auditoría ya no se puede fabricar. Con `accion:"exportar"` → 201 |
| 16 | `DELETE`/`PATCH` sobre `/rest/v1/auditoria` con cualquier token | sin permiso (`42501`) |
| 17 | `POST /rest/v1/recetas` con `TOK_DENT_A` y `dentista_id` de OTRO odontólogo de la clínica | 400 `FIRMANTE_INCOHERENTE`; con su propio id → 201; con `TOK_OWNER_A` a nombre de un odontólogo → 201, a nombre de recepción → 400 |
| 18 | **Contraseña temporal (migración 103).** Crea un usuario con `crear-usuario`, inicia sesión con la contraseña temporal y, con SU token: `GET /rest/v1/pacientes` | `[]`; `PATCH /rest/v1/usuarios?id=eq.<su id>` con `{"debe_cambiar_password":false}` → 400 `CAMBIO_PASSWORD_INDICADOR_PROTEGIDO`; `POST /functions/v1/crear-usuario` o cualquier `admin-*` → 403 `CAMBIO_PASSWORD_PENDIENTE`; en el navegador, cualquier URL muestra solo la pantalla de cambio |
| 19 | Con ese mismo usuario: `POST /functions/v1/cambiar-password` con la MISMA contraseña temporal | 400 `PASSWORD_IGUAL_A_LA_TEMPORAL` y sigue restringido; con una contraseña distinta → 200, y a continuación `GET /rest/v1/pacientes` devuelve sus datos. **Esto prueba el comportamiento real de Auth (`signInWithPassword`, `app_metadata`) que las pruebas locales solo simularon** |
| 20 | **Conservación (104).** Con credenciales de servidor: `select fn_conservacion_paciente('<paciente de prueba>')` y `delete from pacientes where id = '<paciente con registros>'` | el borrado falla con `EXPEDIENTE_SUJETO_A_CONSERVACION`; con una retención legal colocada, `RETENCION_LEGAL_ACTIVA`. Con un token de usuario, `GET /rest/v1/politicas_conservacion` → denegado |
| 21 | **Documentos legales (105).** `select tipo, version, activo from legal_documents where clinica_id is null order by tipo, version` | 7 versiones activas (`…-borrador`) y las anteriores inactivas, ninguna borrada |
| 22 | **Aceptación legal (106).** Inicia sesión con un usuario nuevo en una instalación con la 106 | aparece la pantalla «Documentos legales de SIRO» con los documentos que le tocan (el propietario, además, el Acuerdo de Tratamiento de Datos); sin marcar la casilla el botón no acepta; al aceptar entra y se crea una fila por documento en `legal_acceptances` |
| 23 | Con su token: `POST /rest/v1/legal_acceptances` con `documento_version` falsa y `aceptado_en` de 2000 | se guarda con la versión REAL del documento y la fecha de hoy; un documento inactivo o de otra clínica → 400 `ACEPTACION_DOCUMENTO_NO_VIGENTE` / `ACEPTACION_DOCUMENTO_AJENO`; `PATCH`/`DELETE` sobre sus aceptaciones no cambian nada |
| 24 | Abre `/legal/arco`, `/legal/consentimientos` y `/legal/privacidad` sin sesión | se ve el texto 1.0 (sin la palabra «borrador» ni marcadores entre corchetes), con la versión y la fecha de entrada en vigor |
| 25 | Sin conexión (modo avión) con la sesión ya iniciada | la aplicación NO muestra la pantalla de aceptación ni bloquea el trabajo |
| 26 | Cualquier llamada de A con el token de A pero apuntando a ids de B (citas, tratamientos, pagos, fotografías) | nunca devuelve ni modifica datos de B |
**B.4 Logos (decisión 096: confirma que NO se rompe).**
```bash
# 1) el propietario A sube su logo (carpeta = id de su clínica)
curl -s -X POST "$SUPABASE_URL/storage/v1/object/logos-clinicas/<ID_CLINICA_A>/logo.png" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOK_OWNER_A" -H "Content-Type: image/png" --data-binary @logo_prueba.png
# 2) URL PÚBLICA sin ninguna credencial: debe seguir devolviendo 200 y la imagen
curl -s -o /dev/null -w "%{http_code}\n" "$SUPABASE_URL/storage/v1/object/public/logos-clinicas/<ID_CLINICA_A>/logo.png"
# 3) REEMPLAZAR (upsert) como propietario: debe funcionar
curl -s -X POST "$SUPABASE_URL/storage/v1/object/logos-clinicas/<ID_CLINICA_A>/logo.png" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOK_OWNER_A" -H "x-upsert: true" -H "Content-Type: image/png" --data-binary @logo_prueba2.png
# 4) LISTAR con la clave anon (sin sesión): el resultado esperado tras la 096 es []  (antes mostraba las carpetas = UUID de las clínicas)
curl -s -X POST "$SUPABASE_URL/storage/v1/object/list/logos-clinicas" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" -H "Content-Type: application/json" -d '{"prefix":"","limit":100}'
# 5) el propietario B intenta subir en la carpeta de A: debe dar 403
```
Además abre la app como propietario A, imprime una receta con logo (el logo debe verse) y comprueba que `supabase/verificacion/logos_solo_lectura.sql` indica bucket `public = true`. **Si 2) o la receta fallan, retrocede con `supabase/rollback/096_rollback.sql` y anótalo: significaría que Supabase real SÍ necesitaba esa política para servir la URL pública.**
**B.5 Documentos y fotografías.** Con `TOK_DENT_A` sube un archivo pequeño a `documentos-clinicos/<ID_PACIENTE_A>/prueba.pdf` (mismo patrón `POST /storage/v1/object/...`); debe dar 200. Con `TOK_OWNER_B` intenta subir o leer ese mismo objeto → 403/404. Sin sesión: la lectura debe fallar (bucket privado). Ningún usuario debe poder **borrar** objetos de `fotos-clinicas` ni `documentos-clinicos` (`DELETE` → sin efecto o denegado). Con un odontólogo que NO tiene asignado al paciente: subir → 403.
**B.6 Limpieza.** El proyecto es desechable: lo más fiable es **borrar el proyecto de desarrollo** al terminar, o restaurar el respaldo previo. Para probar la eliminación de una clínica real de extremo a extremo usa SOLO la clínica «C vacía» (sin pacientes ni pagos), porque las clínicas con datos recientes quedan bloqueadas por conservación; lo haces en §C.2.

## C. Edge Functions
**C.1 Desplegar SOLO en desarrollo.**
```bash
supabase login
supabase link --project-ref <ref-de-DESARROLLO>      # comprueba el ref: NO el de producción
for f in admin-actualizar-clinica admin-crear-clinica admin-eliminar-clinica admin-listar-clinicas admin-ver-clinica cambiar-password crear-usuario eliminar-usuario enviar-contacto sis-cifrar-archivo; do supabase functions deploy $f --project-ref <ref-de-DESARROLLO>; done
supabase secrets set RESEND_API_KEY="<llave de prueba>" CORREO_SOPORTE="qa+soporte@example.com" --project-ref <ref-de-DESARROLLO>   # solo en tu terminal
```
Las importaciones remotas (`deno.land`, `esm.sh`) las resuelve el runtime de Supabase: si el despliegue falla por eso, anótalo (en las pruebas locales se sustituyeron por módulos locales).
**C.2 `admin-eliminar-clinica`.** Todas las respuestas de error deben ser un JSON con `error` (y `codigo` si aplica), **sin** textos internos de PostgreSQL ni tokens.
| Prueba | Esperado |
|---|---|
| Sin `Authorization` | 400 `Falta autenticación` |
| Token inventado / expirado | 400 `Token inválido` |
| `TOK_OWNER_A` (propietario) o `TOK_DENT_A` | 400 `No autorizado` (también para `previsualizar`) |
| Superadmin con `clinicaId` que no es UUID, numérico, objeto o arreglo; `accion:"borrar_todo"`; `confirmarDatosClinicos:"false"` (texto) | 400 con mensaje limpio, sin llegar a la base |
| `previsualizar` sobre la clínica A (activa, con datos) | resumen con `puede_eliminar:false` y bloqueos (`NO_SUSPENDIDA`, y conservación/ARCO si aplica) |
| `eliminar` sobre A con nombre y confirmación correctos | 400 `ELIMINACION_BLOQUEADA`; la clínica sigue existiendo; queda una fila `intento_eliminar_clinica_rechazado` en `auditoria` |
| Clínica C vacía: suspenderla (`admin-actualizar-clinica` con `estado:"suspendida"`), crearle un logo y un usuario, luego `eliminar` con nombre exacto (sin `confirmarDatosClinicos`) | 200 `eliminada_completa`; la clínica, sus usuarios de Auth y su logo en Storage desaparecen; auditoría con `eliminar_clinica` y `limpieza_eliminar_clinica` |
| Repetir esa eliminación | 400 `CLINICA_NO_ENCONTRADA`; ninguna auditoría nueva |
| `reintentar_limpieza` / `limpieza_pendiente` sobre C ya eliminada | `eliminada_completa` y 0 pendientes (idempotente) |
**Nota honesta:** no hay forma sencilla de provocar en Supabase real un fallo parcial de Storage/Auth; esa rama solo se probó con la pasarela simulada (`supabase/tests/deno/`). Si quieres forzarla, haz que el logo de C tenga un nombre inválido o revoca temporalmente la `service_role` del bucket SOLO en desarrollo, y verifica que el estado sea `eliminada_con_limpieza_pendiente`, que `limpieza_pendiente` liste lo que falta y que `reintentar_limpieza` lo complete.
**C.3 `eliminar-usuario` (corregida en la fase 8).** Con `TOK_OWNER_A`: eliminar al usuario de recepción recién creado y sin registros → 200; en Authentication → Users el usuario ya no existe. Eliminar a un usuario de **B** → 400 `Ese usuario no pertenece a tu clínica`. Eliminarte a ti mismo → 400. Eliminar a un odontólogo que ya tiene citas o tratamientos → 400 con el aviso de desactivarlo, y **esa cuenta debe poder seguir iniciando sesión** (la función la reactiva; **esto es lo que la simulación no pudo probar: confirma que `ban_duration: none` realmente la reactiva**). Con `TOK_DENT_A` → 400 `Solo el owner puede eliminar usuarios`.
**C.3b `crear-usuario`, `cambiar-password`, `admin-*`.** Todos los errores inesperados responden `500` con un texto genérico y un `codigo` `DB_xxxxx`, **sin** nombres de tablas ni de restricciones. Con `TOK_OWNER_A` crea un usuario con un correo que YA existe en la clínica B: la respuesta debe ser `ALTA_NO_DISPONIBLE`, idéntica a cualquier otro fallo de alta. La contraseña temporal devuelta debe tener 16 caracteres. `admin-ver-clinica` con un `clinicaId` que no sea UUID → 400; con uno válido → 200 **y una fila `ver_clinica` en `auditoria`** (la ve el propietario de esa clínica). `sis-cifrar-archivo` con `contenidoBase64` inválido o `nombreBase` como `../x` → 400; con un reporte válido → 200 y un `.CIF`.
**C.4 `enviar-contacto` (pública).** Guarda un mensaje como visitante anónimo y dispara el envío:
```bash
ID=$(python3 -c "import uuid;print(uuid.uuid4())")
curl -s -X POST "$SUPABASE_URL/rest/v1/mensajes_contacto" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" -H "Content-Type: application/json" -d "{\"id\":\"$ID\",\"nombre\":\"QA\",\"correo\":\"qa@example.com\",\"mensaje\":\"Prueba de contacto\"}"
curl -s -X POST "$SUPABASE_URL/functions/v1/enviar-contacto" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" -H "Content-Type: application/json" -d "{\"mensajeId\":\"$ID\"}"   # 1.ª vez: {"ok":true}; llega UN correo a CORREO_SOPORTE
# repetir la llamada: {"ok":true,"yaEnviado":true} y NO llega otro correo
```
Esperado además: un `mensajeId` que no existe → 400; una llamada sin `mensajeId` → 400; una llamada con un `mensaje` falso en el cuerpo → el correo contiene el mensaje GUARDADO; insertar un mensaje de 5,001 caracteres (o nombre > 120, correo > 254) → el `INSERT` falla con `check_violation` (23514); el 6.º mensaje de la misma hora y del mismo correo falla con `CONTACTO_DEMASIADOS_MENSAJES`; sin `RESEND_API_KEY` el mensaje de error lo dice; una llave inválida → 502 genérico **sin** el texto de Resend. Si el envío falla, el mensaje debe quedar con `correo_enviado = false` (se puede reintentar).
**C.5 Errores y auditoría.** Tras las pruebas revisa (solo lectura): `select accion, entidad, creado_en from auditoria where creado_en > now() - interval '3 hours' order by creado_en;`. Debes ver `crear_usuarios`, `eliminar_usuarios`, `corregir_estado_cita`, `intento_eliminar_clinica_rechazado`, `eliminar_clinica`, etc., a nombre del actor correcto. En el panel de Edge Functions → Logs revisa que no aparezcan tokens ni claves.
**C.6 Limpieza.** Borra el proyecto de desarrollo (o restaura el respaldo), elimina los secretos de prueba (`supabase secrets unset RESEND_API_KEY …`) y descarta los tokens de tu terminal (`unset TOK_… ANON_KEY SUPABASE_URL DEV_DB_URL`).

## D. Navegador
Ver `docs/CHECKLIST_NAVEGADOR.md`.

## E. Qué hacer con los resultados
Anota para cada fila: fecha, resultado (OK / FALLA), captura de la respuesta SIN tokens, y el comportamiento observado si difiere. Si algo falla, **no apliques nada a producción** y entrégame esas filas: con ellas se corrige y se repite la prueba local.
