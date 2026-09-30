# SIRO — Modo offline: guía técnica y de pruebas

> **Estado honesto:** el modo offline está **parcialmente implementado y NO debe describirse como "100% offline"**.
> Este documento dice qué funciona, qué no, y cómo comprobarlo. Las pruebas automáticas validan la *lógica*;
> solo la prueba manual (sección 6) valida el comportamiento en un navegador real.

---

## 1. Qué se guarda en el navegador (y qué NO)

**Ningún dato clínico local está cifrado.** IndexedDB no cifra nada por sí sola y SIRO no agrega cifrado propio.
Cualquiera con acceso al perfil del navegador puede leerlo desde DevTools.

| Dónde | Nombre | Qué contiene | Expira / se borra |
|---|---|---|---|
| IndexedDB | `siro-auth-cache` | Fila de `usuarios` del usuario (nombre, rol, clínica, cédula, RFC, imagen de firma), datos de la clínica | Se ignora pasadas 24 h. **Se borra al cerrar sesión** |
| IndexedDB | `siro-cache-lectura` | Lecturas ya hechas (pacientes, expediente, notas, odontograma, periodontograma, cita, tratamientos, recetas, signos vitales, **Mi día del día actual, citas por rango de Agenda, horarios bloqueados, lista de espera, dentistas**…) y fechas de "última sincronización" | No expira. **Se borra al cerrar sesión** y cuando entra un usuario distinto al dueño de la caché |
| IndexedDB | `siro-cola-offline` | Operaciones pendientes con su contenido completo, usuario, clínica y sucursal | Se borra solo al subirse. **El cierre de sesión NUNCA la toca** |
| IndexedDB | `siro-pacientes-offline` | Pacientes creados sin conexión, completos, con su id local y su `idFuturo` (uuid real que tendrán en el servidor) | Se conserva incluso después de sincronizado (historial). **El cierre de sesión NUNCA la toca** |
| IndexedDB | `siro-mapeo-ids-offline` | Relación id local → id real, uno por paciente ya sincronizado | **El cierre de sesión NUNCA la toca** (lo necesitan operaciones que aún dependan de ese paciente) |
| IndexedDB | `siro-indice-pacientes` | Índice de búsqueda offline: solo id, nombre, teléfono y folio de cada paciente visto o creado en este equipo — nunca el expediente completo | No expira. **El cierre de sesión NUNCA lo toca** (si no, la búsqueda offline quedaría vacía justo después de haber estado trabajando) |
| IndexedDB | `siro-pin-offline` | **Sal + hash PBKDF2 del PIN** (600 000 iteraciones), contadores de intentos, expiración. Una sola ranura por dispositivo | Según la duración elegida; se revoca al cerrar sesión, al cambiar de usuario o tras 10 fallos |
| Cache Storage | `siro-shell-<build>` | Solo archivos estáticos de la app | Se conservan la build actual y la anterior |
| localStorage | (de Supabase) | Sesión de Supabase Auth (la maneja la librería) | Según Supabase |

**Nunca se guarda:** contraseñas, `service_role`, tokens propios, ni el PIN en claro. El service worker **jamás** cachea llamadas a Supabase.

---

## 2. Arquitectura

1. **Service worker** (`public/sw.js`): precachea el App Shell; el plugin `vite-plugin-precache-manifest.js` lista los archivos reales y **sella la versión dentro de `sw.js`** (sin eso el navegador nunca detectaría actualizaciones).
2. **Arranque** (`useAuthStore`): con red usa Supabase Auth. Si falla por red, usa el perfil guardado (≤ 24 h) y, si existe un PIN válido, ofrece desbloqueo offline.
3. **Lectura** (`lib/cacheLectura.js`): cada servicio clínico guarda su última lectura exitosa. "Sincronizar mi día" precarga citas de hoy y todo lo de sus pacientes.
4. **Escritura** (`lib/colaOffline.js` + `lib/procesadorColaOffline.js`): sin conexión se encolan; al volver la red se suben en orden de creación. Solo se procesan las operaciones **del usuario de la sesión**.
5. **Indicador** (`BannerSinConexion` + `useEstadoConexion`): OFFLINE · RECONNECTING · SYNC_ERROR · SYNCING · SYNC_PENDING · ONLINE.
6. **PIN y cierre seguro** (`lib/pinOffline.js`, `lib/cierreSesion.js`, `lib/errorDeRed.js`): ver §3 y §5.

---

## 3. PIN para trabajar sin conexión

**Qué es:** un PIN local que permite **reabrir una sesión offline de alguien que ya se autenticó antes con Supabase**, cuando el token venció y no hay red. Reemplaza la idea de alargar el JWT.

**Qué NO es:** no sustituye a Supabase Auth. Con conexión, la app siempre valida contra Supabase. Una sesión desbloqueada con PIN **no tiene token**: `session = { offline: true, user: { id } }`. Al volver la red intenta `refreshSession()`:
- Éxito → sesión normal.
- Rechazo definitivo del servidor → se revoca el PIN, se cierra la sesión local y se avisa.
- Falla de red → sigue en modo offline.

**Reglas**
| Regla | Valor |
|---|---|
| Formato | 6 a 10 dígitos; se rechazan patrones predecibles (111111, 123456, 121212…) |
| Derivación | PBKDF2-SHA256, 600 000 iteraciones, sal aleatoria por PIN, comparación en tiempo constante |
| Intentos | 5 fallos → bloqueo de 15 min · 10 fallos → PIN revocado (hay que entrar con contraseña) |
| Expiración | Configurable: 8 h, 24 h, 72 h (por defecto) o 7 días. Se **renueva** cada vez que hay validación online real |
| Activar / cambiar / revocar | **Solo con sesión real y con conexión.** Cambiar exige el PIN actual. Revocar no lo exige (ya hay sesión real) |
| Alcance | Una ranura por dispositivo; si entra otro usuario, el PIN anterior se elimina |

**Modelo de amenaza — qué protege y qué no**
- ✅ Protege contra alguien que **adivine el PIN en pantalla** (límite de intentos + bloqueo).
- ✅ Un PIN robado por observación **no sirve online** (Supabase exige contraseña) ni en otro dispositivo.
- ❌ **No** protege contra quien abra DevTools/IndexedDB: los datos clínicos locales no están cifrados.
- ❌ **No** protege contra manipular el reloj del equipo para saltarse la expiración.
- ❌ **No** resiste un ataque de fuerza bruta *offline* sobre el hash si copian la base (un PIN de 6 dígitos tiene solo 10⁶ combinaciones; PBKDF2 solo lo encarece).
- Conclusión: el PIN es una **barrera de conveniencia para el equipo del consultorio**, no cifrado. Para cifrar de verdad los datos locales haría falta derivar una clave del PIN y cifrar IndexedDB (no implementado).

---

## 4. Paciente nuevo sin conexión (walk-in no agendado)

El caso que de verdad importa: se va el internet y llega un paciente que
no está en la agenda — puede existir ya en SIRO o ser alguien
completamente nuevo.

**Paciente existente, no agendado.** Buscarlo usa el mismo cuadro de
búsqueda de siempre. Sin conexión, la búsqueda cae a un **índice
local** (`siro-indice-pacientes`) con solo nombre/teléfono/folio — NO es
una copia de la clínica completa, es lo que ya se vio o se creó en este
equipo. Cada resultado indica si su expediente está disponible para
abrir sin conexión (`_disponibleOffline`): si nunca se abrió antes en
este equipo, se avisa que hace falta internet — nunca se inventa un
expediente vacío.

**Paciente nuevo.** "+ Nuevo paciente" y "Nueva urgencia" siguen
funcionando igual sin conexión — es el escenario más importante del
pliego: llega alguien sin avisar, puede ser un paciente que se acaba de
crear en el mismo formulario. `crearCitaUrgencia()` (usada por "Nueva
urgencia") es consciente de conectividad igual que `crearPaciente()`:
si no hay conexión real, o el paciente es uno recién creado offline,
encola la cita de urgencia en vez de intentarla directo — con
`dependeDe` cuando corresponde. Si quien registra es el propio
dentista, normalmente se le manda directo a `/consulta/:id`; mientras
la cita esté encolada (sin conexión, o el paciente sin sincronizar)
eso no existe todavía, así que se queda en la pantalla con un aviso en
vez de navegar a una consulta que no es real. La verificación de CURP duplicada y de posibles duplicados
por nombre/teléfono son consultas al servidor — sin internet se saltan
(no se puede saber de verdad) y se avisa que no se pudieron verificar,
en vez de bloquear el registro de un paciente real que llegó sin avisar.
El paciente se guarda de inmediato en `siro-pacientes-offline` con un id
local (`offline-<uuid>`) y aparece en SIRO al instante, con su propio
`idFuturo` — un UUID real generado ahí mismo que viajará como `id`
explícito al crearlo en el servidor (igual que ya se hacía con notas y
recetas): si la subida se reintenta, un **upsert** con ese mismo id
nunca duplica el paciente.

**Consulta clínica con ese paciente, sin conexión.** Conectadas a este
flujo: **notas clínicas**, **odontograma** (piezas generales — estado,
diagnóstico, corona, ausencia), **periodontograma** (movilidad/furcación
por pieza, y los 6 sitios de sondaje/recesión/sangrado/placa/cálculo por
pieza) **recetas**, **tratamientos**, **agendar la próxima cita** y
**signos vitales**. Estas cuatro comparten la misma forma simple: sus
tablas referencian al paciente directo (`paciente_id`), sin ningún
trigger que cree filas por adelantado — el mismo mecanismo genérico que
resuelve `paciente_id` cubre las cuatro sin lógica adicional en
`resolverReferenciasOffline()`. "Indicaciones" no es una entidad
aparte: es un campo dentro de la propia receta (`indicaciones`,
`indicaciones_generales`), ya cubierto por lo anterior. **Tratamientos,
"Nueva cita" y signos vitales no tenían NINGÚN soporte offline antes de
esto — ni siquiera para un paciente ya existente**; se agregaron desde
cero: `crearTratamiento()`/`crearCita()` (esta última ya usaba upsert
por el flujo de seguimiento de `finalizar_consulta`)/`agregarSignosVitales()`
generan su id en el navegador, y
`useTratamientos.js`/`useCitas.js`/`useSignosVitales.js` ahora encolan
igual que notas/recetas. **Reagendar/confirmar/cancelar una cita ya
agendada** también se encola sin conexión — `useCitas.js` ganó un
nuevo tipo de operación, `actualizar_cita`, que reutiliza
`actualizarCita()` (la misma función que ya usaba `finalizar_consulta`)
sin tocarla: solo `reagendar()` decide encolar o no, para no afectar
el resto de las pantallas que ya la llamaban directo (Mi día, la cola
de espera, iniciar consulta). Cambiar estado, cancelar, actualizar o
sumar una sesión a un **tratamiento**, siguen siendo solo online — ver
límite #4. Los signos vitales, como las notas clínicas, solo se
registran (nunca se editan), así que no tienen
ese límite extra. Odontograma y periodontograma sí comparten una vuelta extra que las recetas no tienen:
sus piezas (32) y, en el caso del periodontograma, también sus sitios
(32×6=192) no se "crean", ya existen — las genera un trigger del
servidor en cuanto el paciente se sube (notación FDI, migraciones
002_fase2_odontograma.sql y 018_sirso_periodontograma.sql), así que
antes de eso no hay ningún id real al que apuntar. Mientras el paciente
no se sincroniza, esas pantallas muestran un tablero local "en blanco"
(igual a como lo crearía el trigger) con ids temporales
(`offline-pieza-<número>`, `offline-pieza-perio-<número>`,
`offline-sitio-<número>-<sitio>`); al sincronizar, cada pieza se
resuelve por su número y cada sitio por (pieza, nombre del sitio) — un
sitio nunca depende de que la operación hermana de su pieza haya
corrido, solo de que el paciente ya se haya sincronizado (ambas filas
las crea el mismo trigger, al mismo tiempo). El resto del flujo clínico
completo (tratamiento, receta, indicaciones, próxima cita, pago)
**todavía no está conectado** para un paciente que aún no existe en el
servidor — ver límite #4 más abajo. Archivar, restaurar e "iniciar consulta desde una
cita" tampoco aplican todavía a un paciente sin sincronizar; la app lo
avisa con un mensaje claro en vez de un error críptico.

**Estrategia de IDs y dependencias.** El mismo mecanismo sirve para las
cuatro entidades, con una diferencia de fondo: una nota se CREA (id
generado en el navegador, upsert); una pieza de odontograma, una pieza
periodontal o un sitio periodontal se ACTUALIZAN (ya existen, solo hace
falta encontrar su id real una vez sincronizado el paciente) — ver
`lib/odontogramaOffline.js`, `lib/periodontogramaOffline.js`, y las
funciones `obtenerPiezaPorNumero` / `obtenerPiezaPeriodontalPorNumero` /
`obtenerSitioPeriodontalPorNombre` en sus respectivos servicios. La
resolución de un sitio periodontal es la más profunda: dos búsquedas
encadenadas (paciente → pieza por número → sitio por nombre), todas
dentro de `resolverReferenciasOffline()` en
`lib/procesadorColaOffline.js`. Cada operación de la cola puede
declarar `dependeDe: [otroOperationId]`. `lib/dependenciasCola.js`
ordena la cola respetando esas dependencias (el padre siempre se sube
antes) y decide, operación por operación, si está `lista`, si debe
`esperar` (el padre sigue pendiente) o si quedó `bloqueada` (el padre se
perdió para siempre por un conflicto — entonces el hijo tampoco puede
completarse y se descarta con él, nunca queda huérfano reintentando
sin sentido). Una nota clínica de un paciente offline no puede llevar
`expediente_id` todavía (ese registro lo crea un trigger en el servidor
al crear el paciente) — se encola con `pacienteIdOffline` en su lugar;
`lib/procesadorColaOffline.js`, ya con el paciente sincronizado, resuelve
el id real (`lib/mapeoIdsOffline.js`) y CONSULTA el expediente recién
creado para completar `expediente_id` antes de subir la nota. El mapeo
offlineId → id real, igual que la cola, **nunca se borra al cerrar
sesión**.

**Sincronización.** Ya no depende de pulsar "Sincronizar mi día": desde
antes, la cola se sube sola al detectar conexión (`useColaOffline`);
ahora, además, ese disparo espera una comprobación real contra el
servidor (`lib/conectividadReal.js`, con límite de tiempo) en vez de
confiar solo en `navigator.onLine` — una wifi conectada sin salida a
internet ya no dispara intentos de sincronización que solo generarían
errores confusos. "Sincronizar mi día"/"Sincronizar ahora" siguen
existiendo como respaldo manual.

## 5. Cerrar sesión

| Situación | Comportamiento |
|---|---|
| Con conexión y **sin** pendientes | Cierra: `signOut()` + borra caché de lectura, caché de perfil y PIN. Cola intacta |
| Con conexión y **con** pendientes | **Bloquea.** Muestra la cantidad, el desglose por tipo y "Sincronizar ahora". Si al sincronizar quedan 0, permite cerrar |
| **Sin conexión** (con o sin pendientes) | **Bloquea siempre.** Mensaje claro; la cola no se toca |
| No se puede leer la cola (`COLA_ILEGIBLE`) | Bloquea por seguridad |
| Operaciones con error permanente | Cuentan como pendientes y bloquean, salvo que se **descarten** (ver abajo) |

- `PERMITIR_CIERRE_LOCAL_SIN_CONEXION = false` (en `lib/cierreSesion.js`): si algún día se quiere permitir cierre local offline con cola vacía, es un cambio de una línea.
- El logout **siempre** intenta `signOut()` y, pase lo que pase, limpia el estado local (caché + PIN). La cola **nunca** se borra por logout.
- "Cerrar todas mis sesiones" (Seguridad) pasa por la misma verificación.
- **Descartar un cambio atascado.** Una operación en estado `error` con **3 o más intentos fallidos** puede descartarse desde el mismo modal de cierre de sesión: se descarga automáticamente una copia en `.json` con el contenido completo, se registra en la tabla `auditoria` (`accion: 'cola_offline_descartada'`, con `entidad`, `entidad_id` y el último error — el `usuario_id` lo pone el servidor, nunca el navegador) y **solo entonces** se borra de la cola. Requiere **confirmación explícita** (dos pasos: pedir → confirmar) y **conexión** — si el registro de auditoría falla o no hay red, no se borra nada: se prefiere seguir bloqueado a perder el rastro de qué se descartó. Una operación que aún no se intentó, o que falló pocas veces, no se puede descartar (podría ser un bache de red, no un error real).
- **Multiusuario en un equipo:** si otro usuario inicia sesión, la caché del anterior se vacía (`usuario_dueno_de_la_cache`), y solo se suben operaciones cuyo `usuarioId` coincide con la sesión; las ajenas se dejan intactas con aviso.

---

## 6. Qué funciona sin internet y qué no

**Funciona** (si se vio/sincronizó antes): abrir la app en cualquier ruta; **ver Mi día (solo el de HOY, de tu cuenta) y la Agenda (solo rangos ya vistos o sincronizados, con sus horarios bloqueados y lista de espera)**, siempre con un aviso ámbar *"Mostrando información guardada…"*; consultar paciente, expediente, notas, odontograma, periodontograma, cita, tratamientos, recetas, signos vitales; crear paciente, nota clínica, receta, tratamiento, registro de signos vitales y agendar una cita (incluida "Nueva urgencia" completa); guardar un borrador de la consulta (encola la nota, sin completar la cita); editar datos del paciente o antecedentes del expediente (con candado de concurrencia y vista optimista mientras se sube); reagendar, confirmar o cancelar una cita ya agendada (sin candado — mismo límite que ya tenía online); cambiar estado, cancelar, actualizar o sumar una sesión a un tratamiento ya existente (sumar sesión relee el valor real del servidor antes de sumar, nunca usa una instantánea vieja); iniciar o finalizar una consulta desde Mi día, y marcar el estado de alguien en la lista de espera (mismo ejecutor `actualizar_cita` que usa Agenda); modificar pieza de odontograma; modificar pieza/sitio de periodontograma; **finalizar consulta**.

**Requiere internet (a propósito):** pagos ("Los pagos requieren conexión a internet." — excluidos de toda la cola, para cualquier paciente, por el riesgo de duplicar el corte de caja si alguien reintenta un cobro creyendo que falló), iniciar sesión con contraseña, cambiar contraseña, **gestionar el PIN**, administración de usuarios/clínicas, legal/ARCO.

**Requiere internet aunque haya cola:** descartar un cambio atascado (necesita registrar la auditoría en el servidor); imprimir una receta (el membrete trae nombre/dirección/logo de la clínica desde el servidor — límite preexistente, no específico de pacientes offline).

**No funciona sin internet todavía:** agregar alguien a la lista de espera, archivar/restaurar un paciente, bloquear horarios. Ninguno de estos es específico de un paciente nuevo offline: es el mismo límite para cualquier paciente.

---

## 7. Prueba manual obligatoria (paso a paso)

Chrome, DevTools → **Application**.

**A. Preparación (con internet)**
1. Inicia sesión y navega un poco.
2. Service Workers: *activated and running*; Cache Storage: `siro-shell-build-…`.
3. En Mi día pulsa **Sincronizar mi día**. Abre un paciente: expediente, odontograma, periodontograma y su cita.
4. Configuración → Seguridad → **Activar PIN offline** (elige duración). Verifica en IndexedDB `siro-pin-offline` que hay hash y sal, **sin el PIN en claro**.

**B. Sin internet**
5. Apaga el wifi. Recarga dentro de un paciente: debe abrir con banner "Sin conexión".
6. Modifica una pieza, crea una receta, guarda un borrador de la consulta (sin finalizarla), finaliza una consulta. Deben aparecer como "Sin subir". Pagos: deshabilitado.
7. `siro-cola-offline` muestra operaciones `pendiente`. Cierra el navegador por completo, ábrelo sin red: la cola sigue.

**C. Cierre bloqueado**
8. Sin red, pulsa **Cerrar sesión** → debe bloquear con mensaje de "sin conexión". Verifica que la cola sigue intacta.
9. Vuelve la red, pulsa Cerrar sesión con pendientes → modal con la cantidad y **Sincronizar ahora**. Tras sincronizar permite cerrar.

**D. PIN (simulación de token vencido)**
10. Con red cortada, en Application → Local Storage edita la clave `sb-…-auth-token` y pon `expires_at` en un valor pasado. Recarga.
11. Debe aparecer la **pantalla de PIN**. Prueba un PIN incorrecto (mensaje con intentos restantes) y luego el correcto → entra en modo offline (sin token).
12. Falla 5 veces → bloqueo de 15 min. (Para el paso de 10 fallos, revisa que exija contraseña.)
13. Con sesión desbloqueada por PIN: Seguridad → los controles del PIN deben estar **deshabilitados**.

**E. Reconexión**
14. Conecta la red: "Reconectando…" → sesión normal → sincroniza la cola. Verifica que el PIN sigue vigente y su expiración se renovó.
15. Duplicados (deben dar 0 filas):
```sql
select expediente_id, contenido, count(*) from notas_clinicas
 where creado_en > now() - interval '1 day' group by 1,2 having count(*) > 1;
select paciente_id, creado_en, count(*) from recetas
 where creado_en > now() - interval '1 day' group by 1,2 having count(*) > 1;
select paciente_id, inicio, count(*) from citas
 where creado_en > now() - interval '1 day' group by 1,2 having count(*) > 1;
```

**F. Conflicto**
16. Sin red edita una pieza; desde otro navegador edita la **misma**; reconecta el primero → avisa y no sobrescribe.

**G. Cuenta revocada**
17. Con PIN activo y sesión offline, desde el panel de Supabase deshabilita/borra al usuario; reconecta → la app debe revocar el PIN, cerrar la sesión local y avisar.

**H. Paciente nuevo sin conexión**
- Con la red apagada, usa "Nueva urgencia" → "Paciente nuevo": llena nombre y motivo, guarda. Debe avisar que se guardó localmente, sin navegar a ninguna consulta.
- Registra signos vitales del mismo paciente offline. Debe quedar como pendiente.
- Con el mismo paciente offline del paso anterior, abre su odontograma: deben verse las 32 piezas en blanco. Marca una como "caries" o "ausente" — debe quedar como pendiente.
- Abre su periodontograma: 32 piezas en blanco, cada una con sus 6 sitios en cero. Cambia la movilidad de una pieza y marca sangrado en uno de sus sitios — ambos deben quedar como pendientes.
- Agrégale una receta. Debe aparecer marcada "Pendiente de sincronizar".
- Reconecta: todo debe subirse solo. En Supabase, confirma que la pieza de odontograma correcta (por su número) quedó con el estado nuevo, que la pieza periodontal correcta quedó con la movilidad nueva, que el sitio correcto (pieza + nombre de sitio) quedó con el sangrado marcado, y que la receta quedó ligada al `paciente_id` real — nunca una pieza, sitio o receta equivocados, y nunca duplicados.
- Apaga la red. En Pacientes, "+ Nuevo paciente" → llena el formulario y guarda. Debe avisar que no se pudo verificar duplicados y guardarlo igual; debe aparecer de inmediato en la lista.
- Ábrelo: debe mostrar sus datos (Resumen/Datos generales). Ve a "Notas clínicas" (si la pantalla lo permite en este paciente) y agrega una nota — debe quedar marcada como pendiente.
- Recarga la página (sigue sin red): el paciente y la nota pendiente deben seguir ahí (`siro-pacientes-offline`/`siro-cola-offline`).
- Reconecta: debe subirse solo, sin pulsar nada. En Supabase, confirma UN SOLO paciente nuevo (no duplicado) y que la nota quedó ligada al expediente real que el trigger le creó.
- Repite buscando ese mismo paciente por nombre ANTES de reconectar, desde el buscador general — debe aparecer marcado como disponible offline.
- Con un paciente YA existente (con red, ábrelo primero para que su ficha quede cacheada), apaga la red y edita sus datos generales (p. ej. el teléfono). Debe avisar que se guardó en el equipo; el nuevo teléfono debe verse de inmediato en la pantalla. Edita antecedentes del expediente de la misma forma.
- Edita el mismo dato una segunda vez antes de reconectar — en `siro-cola-offline` debe seguir habiendo solo una operación por cada uno (paciente y expediente), no dos.
- Reconecta: debe subirse solo. En Supabase, confirma que el paciente y el expediente quedaron con los valores más recientes.
- Con red apagada, en Agenda confirma, reagenda o cancela una cita YA agendada (no una que acabas de crear offline). Reconecta y confirma en Supabase que quedó con el estado correcto.
- Con un tratamiento YA existente, sin red: cambia su estado, y por separado suma una sesión DOS veces seguidas. Reconecta y confirma en Supabase que `sesiones_completadas` avanzó en 2 (no en 1) respecto al valor que tenía antes de apagar la red.
- Sin red, desde Mi día inicia consulta con alguien de la lista de espera (debe navegar a la pantalla de consulta igual que online) y, por separado, marca a alguien más como "no asistió" en la lista de espera — debe desaparecer de la lista al instante. Reconecta y confirma en Supabase que ambas citas quedaron con el estado correcto.

**I. Mi día y Agenda offline**
- Con red: en Mi día pulsa **Sincronizar mi día** (debe decir sincronizado; si lo pulsas sin red debe **fallar** con "Sin conexión", no fingir éxito).
- Apaga la red y recarga Mi día: se ve, con el aviso ámbar y la hora de lo guardado. Abre Agenda en la misma vista (día, mismo dentista/sucursal): se ven citas, bloqueos y lista de espera.
- Cambia a otro día/semana que no viste: debe dar error, **no** mostrar datos de otro rango.
- Al día siguiente, sin red y sin haber sincronizado, Mi día **no** debe mostrar el de ayer.
- Con red de nuevo, el aviso desaparece.

**J. Descartar un cambio atascado**
- Crea una cita, desconecta la red y cambia su estado de forma que el servidor la rechace de verdad (p. ej. edítala desde otro navegador para que choque por concurrencia, o provoca un error de validación). Reconecta y deja que falle 3 veces (o edita directo en `siro-cola-offline` el campo `intentos` a 3 y `estado` a `error`, para no esperar).
- Intenta cerrar sesión: en el modal debe aparecer listada como descartable, con el botón **Descartar**.
- Pulsa Descartar → pide confirmación. Confirma → debe descargarse un `.json` con el contenido completo y la operación debe desaparecer de la cola.
- En Supabase, tabla `auditoria`, confirma una fila con `accion = 'cola_offline_descartada'` y el `usuario_id` correcto.
- Repite sin conexión: el botón debe fallar con un mensaje claro y la operación debe seguir en la cola.

**K. Actualización del service worker**
18. Deploy nuevo; recarga una vez; deben quedar solo la build nueva y la anterior.

---

## 8. Qué cubren las pruebas automáticas (y qué no)

`npx vitest run` → 79 archivos, 727 pruebas, en `src/components/ui/__tests__/offline/`. Usan `fake-indexeddb` (**solo desarrollo**) y cargan el `sw.js` real. Cada bloque se validó con **mutación** (romper el código a propósito y comprobar que las pruebas fallan): 10 mutaciones en `pinOffline.js`, 14 en `useAuthStore.js`/`cierreSesion.js`, más las del SW y la cola.

| Área | Cobertura |
|---|---|
| Lecturas offline (paciente, expediente, odontograma, periodontograma, cita) | ✅ |
| Cola: persistencia, orden, reintento, duplicados, conflicto | ✅ |
| Aislamiento multiusuario de cola y caché | ✅ |
| PIN: formato, derivación, intentos, bloqueo, revocación, expiración, cambio, concurrencia de intentos | ✅ |
| Mi día / Agenda offline: claves por usuario, día y filtros; sin mezclar rangos; "Sincronizar" no da éxito falso; bloqueos/lista de espera/dentistas | ✅ (16 mutaciones, todas atrapadas) |
| Descartar un cambio atascado: umbral de intentos, exige conexión, no borra si falla la auditoría, exporta el contenido completo | ✅ (19 mutaciones, todas atrapadas) |
| Paciente nuevo offline: creación con id local, upsert idempotente, índice de búsqueda local, redirección tras sincronizar | ✅ (14 mutaciones, todas atrapadas) |
| Odontograma de paciente nuevo offline: 32 piezas sintéticas, resolución por número tras sincronizar | ✅ (5 mutaciones, todas atrapadas) |
| Periodontograma de paciente nuevo offline: 32 piezas + 192 sitios sintéticos, resolución encadenada (pieza → sitio) | ✅ (9 mutaciones, todas atrapadas) |
| Recetas de paciente nuevo offline: resolución de `paciente_id`, ya cubierta por la batería de creación de paciente (sin código de motor nuevo) | ✅ (reutiliza las pruebas de creación de paciente) |
| Tratamientos: creación offline para paciente existente (capacidad nueva, upsert idempotente) y para paciente nuevo offline (dependiente) | ✅ (2 mutaciones, todas atrapadas) |
| Agendar cita: creación offline para paciente existente (capacidad nueva) y para paciente nuevo offline (dependiente) | ✅ (1 mutación, atrapada) |
| "Nueva urgencia" completa (paciente existente y paciente nuevo, ambos sin conexión) | ✅ (3 mutaciones, todas atrapadas) |
| Signos vitales: creación offline para paciente existente (capacidad nueva, upsert idempotente) y para paciente nuevo offline (dependiente) | ✅ (2 mutaciones, todas atrapadas) |
| Editar paciente/antecedentes offline: candado de concurrencia, vista optimista en caché, reemplazo por clave estable, sube vía el ejecutor de la cola | ✅ (10 mutaciones, todas atrapadas) |
| Reagendar/confirmar/cancelar una cita ya agendada, sin conexión: sube vía el nuevo ejecutor `actualizar_cita` | ✅ (mutado y atrapado) |
| Editar tratamiento offline: cambiar estado/cancelar/actualizar (UPDATE simple) y sumar sesión (relee el valor fresco, nunca una instantánea vieja — incluida la prueba de acumulación de 2 sesiones offline) | ✅ (3 mutaciones, todas atrapadas) |
| Cola con dependencias: orden topológico, "esperar" vs "bloqueada", resolución de `paciente_id`/`expediente_id`, ciclos | ✅ (21 mutaciones, todas atrapadas) |
| Conectividad real (heartbeat con timeout, no solo `navigator.onLine`) | ✅ (mutado y atrapado) |
| Cierre de sesión: bloqueo por pendientes / sin red / cola ilegible, limpieza, cola intacta | ✅ |
| Store de auth: desbloqueo, `reanudarSesionOnline` (éxito / rechazo / red), SIGNED_OUT ignorado en modo offline | ✅ |
| Service worker: precache, rollback, actualización, 503 explícito | 🟡 Lógica sí; navegador real → manual |
| **Componentes React ni hooks** (`AvisoDatosGuardados`, `Agenda`, `MiDia`, `useExpediente`, `usePacienteDetalle`, `useColaOffline`, `PantallaDesbloqueoPin`, `ModalCierreSesionBloqueado`, `SeccionPinOffline`, banner, `ProtectedRoute`) | ❌ **No se renderizan en pruebas** (no hay renderizador): dependen de la prueba manual |
| Evento `online` real del navegador | ❌ manual |

---

## 9. Limitaciones conocidas — léelas antes de confiar en esto

1. **Lo que Mi día y Agenda MUESTRAN es de "lo último que viste".** Solo aparece lo que se cargó o sincronizó antes con esos mismos filtros (rango, dentista, estado, sucursal). Cualquier otra vista falla en vez de mostrar datos ajenos. La información puede estar desactualizada (otra persona pudo agendar o cambiar citas): por eso el aviso ámbar. Iniciar/finalizar consulta, marcar la lista de espera y reagendar/cancelar SÍ funcionan y quedan encoladas de verdad — pero la pantalla no siempre se entera sola: **una cita que finalizas sin conexión sigue viéndose con su estado anterior** en Mi día hasta volver a sincronizar (Mi día vuelve a leer de una caché que la acción no tocó), y la lista de espera sí se actualiza al toque (ahí se corrige a mano en memoria, no recargando del servidor).
   - Los widgets de `dashboard.js` (ingresos, gráficas, pagos recientes, etc.) siguen sin caché, a propósito (financieros).
   - Cada rango visto se guarda con su propia clave y no expira ni se poda (crece con el uso hasta cerrar sesión).
   - La caché de lectura cae a lo guardado ante **cualquier** error de la consulta, no solo por falta de red (comportamiento previo, no nuevo): un error de permisos también serviría datos guardados con el aviso.
2. **El PIN no cifra datos** (ver modelo de amenaza, §3). Los datos clínicos locales están en claro y un PIN de 6 dígitos es débil frente a ataque offline sobre el hash.
3. **Un solo PIN por dispositivo.** Si dos personas comparten equipo, el PIN de la primera se elimina cuando la segunda inicia sesión.
4. **El flujo de paciente nuevo offline llega hasta notas clínicas, odontograma (piezas generales), periodontograma (piezas y sitios), recetas, tratamientos (crear y editar) y signos vitales.** Solo **pago** NO está conectado todavía a un paciente que aún no existe en el servidor — y de forma deliberada: pagos está excluido de TODA la cola offline, para cualquier paciente, por el riesgo de duplicar el corte de caja (ver §6). Tampoco están conectadas las **caras/superficies** del odontograma (`cambiarEstadoCara`) ni la vista 3D detallada — solo el estado general de la pieza. De citas, tanto crear como reagendar/confirmar/cancelar ya están encolados — pero, a diferencia de paciente/expediente, esta edición NO lleva candado de concurrencia (mismo comportamiento que ya tenía online: `reagendar()` nunca recibió un `actualizadoEnEsperado`). Una cita agendada o modificada offline tampoco aparece todavía en la vista de Agenda hasta que se sincroniza (a diferencia de notas/recetas/tratamientos, que sí se muestran como pendientes dentro de la ficha de SU paciente): fusionar citas pendientes en una lista por rango de fechas/dentista/estado es más riesgoso de hacer bien sin poder probar el renderizado, así que se dejó fuera a propósito — la cita sí se crea y sincroniza correctamente, solo no se ve en la lista mientras tanto. De tratamientos, cambiar estado, cancelar y actualizar se reemplazan por clave estable, igual que citas (sin candado, mismo límite que ya tenían online); **sumar una sesión es distinto a propósito**: en vez de mandar el número ya calculado (que podría quedar desactualizado si se suma más de una vez sin conexión, o si el servidor ya avanzó por otro lado), el ejecutor de la cola vuelve a leer el tratamiento justo antes de sumar — así, dos sesiones registradas offline antes de reconectar cuentan como dos, nunca como una, y nunca se retrocede un avance real.
5. **"Nueva urgencia" ya funciona completa sin conexión** (paciente existente o nuevo). Lo único que cambia offline: si quien registra es el dentista, normalmente se le manda directo a atenderla — mientras la cita esté encolada eso no es posible todavía (no existe un id real de consulta), así que se queda en la pantalla en vez de navegar.
6. **Archivar, restaurar e "iniciar consulta desde una cita agendada"** avisan con un mensaje claro en vez de intentarlo cuando el paciente todavía no se sincronizó, pero no ofrecen una alternativa offline para esas acciones específicas.
7. **La búsqueda offline por CURP no existe** — solo nombre, teléfono y folio. Si dos personas sin red registran el mismo paciente por separado en dos equipos, se van a crear dos pacientes; se reconcilian manualmente al ver los duplicados en la lista después.
8. **Descartar un cambio requiere conexión**, aunque el motivo de bloqueo original haya sido "sin conexión": si la cola tiene una operación atascada Y no hay red, hay que esperar a recuperar la conexión antes de poder descartarla (el registro de auditoría no puede diferirse — ver §5).
9. **El umbral de 3 intentos es fijo** (`UMBRAL_INTENTOS_PARA_DESCARTAR` en `lib/descarteOperaciones.js`) y no distingue el tipo de error: un error de validación real y un error de red que por coincidencia falló 3 veces se ven igual de "descartables". La persona decide, viendo el mensaje del último error.
10. **Cierre forzado** (sesión rechazada por el servidor): se limpia caché y PIN, pero la cola queda sin subir hasta que la **misma cuenta** vuelva a iniciar sesión en ese equipo.
11. **La caché de lectura no expira** (solo el perfil, 24 h, y el PIN según su duración).
12. **Editar datos del paciente o antecedentes del expediente sin conexión** funciona distinto a todo lo demás: es la única edición encolada (todo lo otro en la cola es crear algo nuevo). `actualizarPaciente()`/`actualizarExpediente()` verifican conexión real antes de decidir; sin ella, encolan con el candado de concurrencia (`actualizadoEnEsperado`) capturado al abrir el formulario, y dejan la caché de lectura mostrando el cambio de inmediato (única excepción a "la caché es solo de lectura" — ver `lib/cacheLectura.js`). Editar el mismo registro dos veces antes de reconectar reemplaza la operación en cola, no acumula dos. Si alguien más lo cambió mientras tanto, el candado lo detecta igual que en cualquier edición online — se pierde ese cambio en particular, nunca se sobrescribe en silencio. (Todo lo demás en la cola es crear: paciente, nota, tratamiento, receta, cita, signos vitales, piezas de odontograma/periodontograma — ver §4. "Guardar borrador" durante una consulta también encola su nota, igual que crear una nota clínica cualquiera — el motivo de la cita se actualiza hasta que se finaliza, no en cada borrador.)
13. **"Última sincronización"** del banner solo se actualiza cuando la cola tenía algo que subir.
14. **Firmas** (dentista/paciente) viajan sin cifrar dentro de cola y perfil guardado.
15. El PIN depende del reloj del dispositivo.
