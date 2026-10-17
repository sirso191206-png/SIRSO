# SIRO — Cambio obligatorio de la contraseña temporal

**Estado:** implementado en código y verificado con pruebas automatizadas LOCALES (SQL, HTTP contra PostgREST real, Edge Functions simuladas, interfaz). **No validado en Supabase real** (ver §5).

## 1. Qué hace
Toda cuenta creada con una contraseña temporal (`crear-usuario`, `admin-crear-clinica`) nace con `usuarios.debe_cambiar_password = true`. Mientras sea `true`, el servidor le niega el acceso a datos y funciones; solo puede ver su propia fila de `usuarios`, gestionar su sesión y cambiar la contraseña. Los usuarios existentes no quedan bloqueados (valor por omisión `false`). Migración: `103_sirso_cambio_password_obligatorio.sql` (rollback verificado en `supabase/rollback/103_rollback.sql`).

## 2. Dónde se aplica el control (en el servidor, no en el navegador)
| Capa | Cómo |
|---|---|
| Tablas y vistas (RLS) | `auth_clinica_id()`, `auth_clinica_id_raw()`, `auth_rol()` y `fn_es_super_admin()` devuelven «nadie» mientras el indicador esté puesto; todas las políticas de tenant pasan por ellas |
| Storage | las políticas usan `auth_clinica_id()`: sin acceso |
| Funciones SQL (finalizar consulta, corregir citas, eliminar clínicas…) | usan los mismos ayudantes: se rechazan |
| Edge Functions (usan `service_role`, no pasan por RLS) | `exigirSinCambioPendiente` en las 8 funciones con sesión (`admin-*`, `crear-usuario`, `eliminar-usuario`, `sis-cifrar-archivo`, `admin-eliminar-clinica`); `cambiar-password` es la excepción a propósito y `enviar-contacto` es pública |
| El indicador mismo | un disparador impide que un usuario con sesión lo ponga o lo quite, e impide editar el perfil mientras esté pendiente (salvo `ultimo_acceso`); solo `service_role` lo escribe |
| Interfaz | `ProtectedRoute` muestra SOLO la pantalla de cambio en cualquier URL (sin menú ni contenido). Es un complemento: la protección real es la de arriba |

## 3. Flujo del cambio
1. La persona inicia sesión con la contraseña temporal; el perfil trae `debe_cambiar_password = true` y aparece la pantalla dedicada.
2. Escribe y confirma la contraseña nueva (8–128 caracteres). La interfaz llama a `cambiar-password`.
3. La función exige que la nueva contraseña sea **distinta de la temporal**: intenta iniciar sesión con ella; si entra (o Auth dice «correo no confirmado»), la rechaza. **Solo** «credenciales inválidas» prueba que es distinta; un límite de peticiones, un error de Auth o de red NO concluyen nada y se responde `503` sin cambiar nada.
4. Cambia la contraseña en Auth con un marcador en `app_metadata` (la persona no puede escribirlo) y **solo después** baja el indicador, verifica que quedó en `false` y registra el evento `cambio_password_obligatorio_completado`.
5. Si la contraseña cambió pero el indicador no se pudo bajar: error `CAMBIO_PARCIAL` y sigue restringida; el reintento (con la misma contraseña nueva) termina el proceso gracias al marcador.
6. La interfaz vuelve a leer el perfil: si el indicador sigue en `true` NO da el cambio por hecho. Si el cambio tuvo éxito, recarga la aplicación (así no queda ningún dato vacío guardado mientras estuvo restringida).

## 4. Errores y estados
Red caída, sesión expirada, contraseña inválida, clínica suspendida y fallo de Auth muestran un mensaje legible (nunca técnico) y la persona **sigue restringida**; puede reintentar o cerrar sesión. Un doble clic envía una sola solicitud. Sin conexión no se puede cambiar (el cambio exige servidor).

## 5. Límites y dependencias de Supabase (sin ocultar nada)
* **Supabase no ofrece un bloqueo nativo por indicador personalizado**; por eso se aplica en la base de datos y en las funciones. Un «Auth Hook» o una política de contraseñas del proyecto serían controles adicionales que dependen de la configuración de tu proyecto (no verificado).
* El token de la persona sigue siendo válido para la API de Auth: puede cambiar su contraseña directamente allí, pero eso **no levanta el bloqueo** (solo la función baja el indicador). La nueva contraseña elegida así no se compara con la temporal.
* **El restablecimiento de contraseña por correo no baja el indicador.** Si la persona restablece su contraseña y luego entra en la pantalla de cambio, la contraseña que ya está usando será rechazada como «igual a la actual» y deberá elegir otra: es molesto pero seguro.
* **No verificado en Supabase real:** que `app_metadata`/`getUserById` y `signInWithPassword` se comporten como supone el código (las pruebas usan clientes simulados), los límites de peticiones de Auth y el comportamiento de Realtime con RLS.
* El indicador se escribe con `service_role`: protege ese secreto.
* Un administrador no puede volver a marcar a un usuario desde la aplicación; hacerlo exige SQL con `service_role`. Si en el futuro se añade «restablecer contraseña temporal», debe borrar también el marcador `password_rotada_en` de `app_metadata`.
* Los usuarios existentes con una contraseña temporal anterior **no** están marcados (no hay forma de saberlo): márcalos con SQL si procede.

## 6. Pruebas
`cambio_password_obligatorio_test.sql` (9), 12 comprobaciones HTTP reales en `verificar_postgrest.mjs`, `edgeCambioPasswordObligatorio.test.js` (30), `cambioPasswordObligatorio.test.js` (21: validación, mensajes, pantalla y guardia de rutas con usuario pendiente y usuario normal). Mutaciones sobre la migración 103: 6 de 6 detectadas. La prueba del endurecimiento (verificación no concluyente) falla contra la lógica anterior.
