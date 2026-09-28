# SIRO — Modo offline: guía técnica y de pruebas

> **Estado honesto:** el modo offline está **parcialmente implementado y NO debe describirse como "100% offline"**.
> Este documento dice qué funciona, qué no, y cómo comprobarlo con tus propios ojos. Las pruebas automáticas
> validan la *lógica*; solo la prueba manual (sección 5) valida el comportamiento en un navegador real.

---

## 1. Qué se guarda en el navegador (y qué NO)

**Ningún dato local está cifrado.** IndexedDB no cifra nada por sí sola, y SIRO no agrega cifrado propio.
Cualquiera con acceso al perfil del navegador puede leerlo desde DevTools.

| Dónde | Nombre | Qué contiene | Expira |
|---|---|---|---|
| IndexedDB | `siro-auth-cache` | Fila completa de `usuarios` del usuario (nombre, rol, clínica, cédula, RFC, **imagen de su firma**), nombre y estado de la clínica, fecha de sincronización | Se **ignora** pasadas 24 h (el registro no se borra) |
| IndexedDB | `siro-cache-lectura` | Resultado de cada lectura ya hecha: lista de pacientes por filtro, paciente, expediente, notas clínicas, odontograma, periodontograma, cita, tratamientos, recetas, signos vitales, diagnósticos frecuentes; y fechas de "última sincronización" | **No expira** |
| IndexedDB | `siro-cola-offline` | Operaciones pendientes de subir, con su contenido completo (notas, recetas, cambios de odontograma…), usuario, clínica y sucursal | No expira; se borra al subirse |
| Cache Storage | `siro-shell-<build>` | Solo archivos estáticos de la app (HTML, JS, CSS, imágenes, modelo 3D) | Se conserva la build actual + la anterior |
| localStorage | (de Supabase) | Sesión de Supabase Auth — la maneja la librería, no SIRO | Según Supabase |

**Nunca se guarda:** contraseñas, `service_role`, ni tokens propios. El service worker **jamás** cachea llamadas a Supabase.

---

## 2. Arquitectura

1. **Service worker** (`public/sw.js`): precachea el App Shell. Un plugin de Vite (`vite-plugin-precache-manifest.js`) lista los archivos reales de cada build y **sella la versión dentro de `sw.js`** — sin eso el navegador nunca detectaría una actualización.
2. **Arranque** (`useAuthStore.cargarPerfil` + `lib/cacheAuth.js`): si Supabase no responde, usa el último perfil guardado (≤ 24 h) y marca `connectionStatus: 'offline'`.
3. **Lectura** (`lib/cacheLectura.js`): cada servicio clínico guarda su última lectura exitosa y la devuelve si la red falla. "Sincronizar mi día" (`services/sincronizacionDia.js`) precarga las citas de hoy y todo lo de sus pacientes.
4. **Escritura** (`lib/colaOffline.js` + `lib/procesadorColaOffline.js`): sin conexión, las acciones se encolan; al volver la red se suben **en orden de creación**.
5. **Indicador** (`BannerSinConexion` + `useEstadoConexion`): OFFLINE · RECONNECTING · SYNC_ERROR · SYNCING · SYNC_PENDING · ONLINE.

---

## 3. Qué funciona sin internet y qué no

**Funciona sin internet** (siempre que se haya visto/sincronizado antes, ver limitaciones):
- Abrir la app en cualquier ruta.
- Consultar paciente, expediente, notas, odontograma, periodontograma, cita, tratamientos, recetas, signos vitales.
- Crear nota clínica · crear receta · modificar pieza de odontograma · modificar pieza/sitio de periodontograma · **finalizar consulta** (nota + cita completada + seguimiento opcional).

**Requiere internet (bloqueado a propósito):**
- **Pagos.** Decisión deliberada: técnicamente serían un insert como cualquier otro, pero un pago perdido o retrasado descuadra el corte de caja sin que nadie lo note, y quien crea que "no se guardó" lo captura de nuevo. La app muestra *"Los pagos requieren conexión a internet."*
- Iniciar sesión, cambiar contraseña, administración de usuarios/clínicas, legal/ARCO, y todo lo no listado arriba.

**NO funciona sin internet todavía** (ver §7): Mi día, Agenda, **"Guardar borrador" de la consulta** (solo "Finalizar" funciona offline), registrar signos vitales, crear/editar tratamientos, editar datos del paciente, indicaciones.

---

## 4. Sincronización, duplicados y conflictos

- **Orden:** por fecha de creación. Antes de subir, se verifica que la sesión siga viva; si expiró, no se sube nada y se avisa (la cola queda intacta).
- **Nunca se vacía la cola antes de confirmar éxito.** Una operación pasa por `pendiente → sincronizando → (borrada | error)`. Si falla, se conserva con su mensaje de error y contador de intentos, y se reintenta.
- **Sin duplicados:** los registros nuevos (notas, recetas, citas de seguimiento) llevan un `id` generado en el navegador y se guardan con `upsert`, así que un reintento tras una respuesta perdida pisa la misma fila. Las ediciones usan una clave estable por registro: editar dos veces lo mismo sin conexión deja **una** operación, con lo último.
- **Conflictos:** cada tabla editable tiene `actualizado_en` mantenida por un *trigger* (no por el navegador). El UPDATE lleva la condición `actualizado_en = <lo que viste al abrir>`; si otra persona cambió el registro, no se sobrescribe. Offline, ese cambio **se descarta y se avisa cuál** (reintentar nunca funcionaría); hay que revisarlo y rehacerlo sobre los datos actuales. En "finalizar consulta", si el primer paso choca, **no se ejecuta ninguno de los siguientes** (sin nota huérfana).

---

## 5. Prueba manual obligatoria (paso a paso)

Usa Chrome. DevTools → pestaña **Application** para inspeccionar.

**Preparación (con internet)**
1. Abre SIRO e inicia sesión. Navega un poco (Mi día, un paciente).
2. Application → *Service Workers*: debe decir **activated and running**. Application → *Cache Storage* → `siro-shell-build-…` con ~9 archivos.
3. En Mi día pulsa **Sincronizar mi día**; debe mostrar el resumen con checks.
4. Abre un paciente y recorre: expediente, odontograma, periodontograma. Abre su cita.

**Sin internet**
5. Desconecta la red **de verdad** (apaga el wifi). *(El checkbox "Offline" de DevTools sirve, pero el apagado real es más fiel.)*
6. Recarga la página **estando dentro de un paciente** (no en la raíz). **Debe abrir.** Aparece el banner "Sin conexión".
7. Entra al paciente sincronizado y a su expediente, odontograma y periodontograma. **Deben verse.**
8. Modifica una pieza del odontograma. Aparece "Cambio sin subir".
9. Crea una receta → etiqueta **Sin subir**. Abre la cita y **finaliza la consulta**.
10. Intenta registrar un pago → botón deshabilitado con el aviso de conexión.
11. Application → IndexedDB → `siro-cola-offline` → *operaciones*: deben verse las operaciones con `estado: "pendiente"`.
12. **Cierra el navegador por completo. Ábrelo de nuevo sin internet.** Recarga: la cola debe seguir ahí y la app abrir.

**Volver a internet**
13. Conecta la red. Debe verse "Reconectando…", luego "Sincronizando…", y por último desaparecer el banner. Las operaciones de la cola desaparecen.
14. En el SQL Editor de Supabase, busca duplicados (deben devolver **0 filas**):
```sql
select expediente_id, contenido, count(*) from notas_clinicas
 where creado_en > now() - interval '1 day' group by 1,2 having count(*) > 1;
select paciente_id, creado_en, count(*) from recetas
 where creado_en > now() - interval '1 day' group by 1,2 having count(*) > 1;
select paciente_id, inicio, count(*) from citas
 where creado_en > now() - interval '1 day' group by 1,2 having count(*) > 1;
```
15. **Prueba de conflicto:** con la red cortada, edita una pieza; desde otro navegador (con internet) edita esa **misma** pieza; reconecta el primero → debe avisar que otra persona ya la modificó, sin sobrescribir.
16. **Prueba del límite de sesión:** con la red cortada, espera más de **1 hora** (o el valor de *JWT expiry* de tu proyecto) y recarga → **se espera que te mande al login** (ver §7, límite #1). Si esto ocurre, es el comportamiento conocido, no un fallo nuevo.

**Actualización del service worker**
17. Haz un deploy nuevo. Abre SIRO con internet, recarga una vez. Application → Service Workers debe mostrar la build nueva y `Cache Storage` conservar solo la nueva y la anterior.

---

## 6. Qué cubren las pruebas automáticas (y qué no)

`npx vitest run` → 63 archivos, 492 pruebas. Las de esta capa están en `src/components/ui/__tests__/offline/`.
Usan `fake-indexeddb` (dependencia **solo de desarrollo**) y cargan el `sw.js` real en un entorno simulado.
Cada bloque se validó con **pruebas de mutación** (romper el código a propósito y comprobar que fallan).

| # | Escenario pedido | Cobertura |
|---|---|---|
| 1 | Abrir offline tras visita online | 🟡 Lógica del SW sí (incl. rutas profundas); navegador real → manual |
| 2 | Sesión offline | 🟡 Perfil, expiración 24 h y arranque sí; **límite del token de Supabase no** (§7) |
| 3–7 | Paciente, expediente, odontograma, periodontograma, cita offline | ✅ |
| 8–12 | Crear nota, modificar odonto/perio, receta, finalizar consulta | 🟡 Procesador y servicios sí; **los hooks de React no** (no hay renderizador) |
| 13–14 | Cerrar y reabrir con cola pendiente | ✅ (IndexedDB simulado) |
| 15 | Recuperar internet | 🟡 Procesador sí; el disparo por el evento `online` no |
| 16–19 | Sincronizar, reintentar, duplicados, conflicto | ✅ |
| 20 | Actualización del SW | 🟡 Lógica y sellado por build sí; la actualización real en navegador → manual |

**11 completas, 9 parciales.** Lo "parcial" se cierra con la prueba manual de la sección 5.

---

## 7. Limitaciones conocidas — léelas antes de confiar en esto

1. **El arranque offline dura lo que dure el token de Supabase.** Verificado en el código de `auth-js` 2.112.4: si el token de acceso ya venció y no se puede renovar por falta de red, `getSession()` devuelve `null` y la app manda al login, donde no se puede entrar sin internet. Por defecto un token dura **1 hora** (ajuste *JWT expiry* de tu proyecto). Recargar sin red pasado ese tiempo **no funciona**. Resolverlo exige un mecanismo de sesión local propio (p. ej. PIN) — es una decisión de seguridad que no he tomado.
2. **Cerrar sesión NO borra los datos locales.** Verificado: no existe ninguna función que limpie las bases de IndexedDB. Los datos clínicos quedan en el equipo tras el logout, sin cifrar, y las claves de la caché de lectura no distinguen usuarios (`paciente:<id>`): si otra persona inicia sesión en el mismo navegador y cae la red, la caché podría servirle datos de otro usuario (offline no aplica RLS). **En un equipo compartido esto es un riesgo real.** Falta decidir qué hacer con los cambios sin subir al cerrar sesión (¿bloquear el logout? ¿advertir?).
3. **La caché de lectura no expira** (la sección 19 del documento pide expiración). Solo el perfil expira (24 h).
4. **"Mi día" y la Agenda no cargan sin internet.** `obtenerCitasRango`, `miDia.js` y `dashboard.js` no están cacheados; solo `obtenerCitaPorId` lo está. Se puede llegar a un paciente por URL directa o por una búsqueda ya hecha, pero no navegar desde la agenda.
5. **No se encolan:** "Guardar borrador" de la consulta (hoy falla sin red con un error; hay que usar "Finalizar"), registrar signos vitales, crear/editar tratamientos, editar datos del paciente, editar expediente, indicaciones. Los servicios de expediente/paciente ya tienen el candado de concurrencia, pero no están conectados a la cola.
6. **"Última sincronización" en el panel del banner** solo se actualiza cuando la cola tenía algo que subir; si nunca hubo cambios pendientes, dirá "Nunca en este dispositivo" aunque el equipo sí esté al día.
7. **Firma del dentista y de la paciente:** viajan dentro de la cola y del perfil guardado (imágenes en base64, sin cifrar).
8. Las pruebas de hooks/UI de React y del navegador real **no existen**; dependen de la sección 5.
