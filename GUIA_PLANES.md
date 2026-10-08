# Planes comerciales y suscripciones — guía técnica

Migraciones **074** (hotfix de seguridad, se puede desplegar sola) y **075** (sistema completo).
Todo precio, límite y funcionalidad vive en la base de datos y se edita desde **/superadmin/planes**.
El frontend **no** contiene ningún plan escrito (hay una prueba que lo vigila:
`src/components/ui/__tests__/planes/sinPlanesEnElCodigo.test.js`).

## 0. Orden de despliegue (importa)

1. **074** — solo cierra un agujero (ver §6). No depende de nada; despliégala ya.
2. **075** — crea el sistema y toma el *snapshot* de las clínicas existentes.
3. Edge Functions: `admin-crear-clinica`, `admin-actualizar-clinica`, `crear-usuario`.
4. Frontend.

Hazlo seguido: entre 075 y las Edge Functions, la pantalla vieja de superadmin que cambia
`plan` por la función vieja fallaría (el plan `basico` ya no existe: ahora es `esencial`).
Un cliente viejo que **crea** clínicas sigue funcionando (la función nueva usa `esencial/mensual`
si no le mandan plan).

## 1. Modelo de datos

| Tabla | Para qué |
|---|---|
| `planes_catalogo` (se **extendió**, no se duplicó) | Plan: nombre, precios mensual/anual, moneda, modalidades permitidas, activo, visible, recomendado, orden, límites. La llave sigue siendo el código (`plan`). |
| `funcionalidades` | Catálogo. `aplicacion` = `base_de_datos` / `limite` / `interfaz` (dónde se aplica de verdad). `nucleo` = no se puede desactivar. |
| `plan_funcionalidades` | Composición de cada plan (plan → funcionalidad → habilitada). |
| `suscripciones` | Una **vigente** por clínica (índice único parcial); las anteriores quedan `reemplazada` = historial. |
| `suscripcion_limites` / `suscripcion_funcionalidades` | El **snapshot** contratado por esa clínica. |

Desviaciones respecto a la estructura sugerida (para no duplicar tablas): los límites del plan están
en columnas de `planes_catalogo` en vez de una tabla `plan_limites`; las llaves son códigos de texto,
no uuid. `NULL` = ilimitado.

## 2. Cómo se aplican los límites (en la base de datos)

| Límite | Dónde | Notas |
|---|---|---|
| Pacientes | trigger `fn_set_clinica_pacientes` (BEFORE INSERT) | Bloquea la fila de la clínica (sin carreras). **No cuenta** el reintento de un paciente que ya existe: así el upsert idempotente de la cola offline no falla en el cupo exacto. |
| Usuarios | trigger `fn_validar_limite_usuarios` | Antes solo lo comprobaba la Edge Function. Los superadmin no consumen cupo. |
| Sucursales | trigger `fn_validar_limite_sucursales` | No se aplicaba en ningún lado. Cuentan solo las activas; reactivar una también se valida. |
| Sesiones simultáneas | trigger de la 064 (leyendo la suscripción) | Se mantiene el comportamiento: **cierra la sesión más antigua** en vez de rechazar el inicio de sesión. |
| Almacenamiento | **no se aplica** | Se guarda el valor, pero la BD no mide el tamaño de los archivos (no hay columna de tamaño; el tamaño vive en Storage). Medirlo exige una decisión aparte. |

Error de límite: SQLSTATE `PT402` (PostgREST → HTTP 402), `details = PLAN_LIMIT_REACHED`,
`hint` = recurso. Error de funcionalidad (solo sucursales): `PT403` / `FEATURE_NOT_AVAILABLE`.

## 3. Cómo se aplican las funcionalidades

**En la base de datos** (políticas RLS *restrictivas* `plan_func_<tabla>`, se suman con AND a las existentes,
no aflojan nada) — sin la funcionalidad, el usuario **no ve ni escribe** esas tablas:

| Funcionalidad | Tablas |
|---|---|
| `periodontograma` | periodontograma_piezas / _sitios / _historial |
| `odontograma_2d` | odontograma_piezas / _caras / _historial |
| `recetas` | recetas |
| `consentimientos` | consentimientos_informados |
| `fotografias` | fotografias |
| `documentos` | documentos_clinicos |
| `pagos` | pagos |
| `tratamientos` | tratamientos |
| `citas` | citas |
| `agenda` | horarios_bloqueados, lista_espera |
| `notas_clinicas` | notas_clinicas |
| `expediente_clinico` | expedientes, signos_vitales |
| `multisucursal` | trigger de sucursales (2.ª sucursal activa en adelante) |

Los triggers que crean solos el expediente/odontograma/periodontograma al dar de alta un paciente son
`SECURITY DEFINER`, así que **crear pacientes sigue funcionando en cualquier plan** (hay prueba).
El personal de plataforma (superadmin) conserva acceso de soporte.

**Limitaciones que conviene tener claras:**
- Con RLS, leer sin la funcionalidad devuelve **vacío**, y escribir da `42501` — **no** el
  `403 FEATURE_NOT_AVAILABLE` con mensaje que pediste. Un trigger que lo diera habría roto el alta de
  pacientes (esos triggers automáticos también escriben en esas tablas), así que no se hizo.
- **Solo interfaz** (la BD no puede protegerlas porque no tienen tabla propia): `odontograma_3d`, `planes_tratamiento`,
  `caja`, `urgencias`, `turnos`, `cie10`, `roles`, `permisos`, `auditoria`, `reportes`, `estadisticas`,
  `administracion_avanzada`, `offline`, `sincronizacion`. El panel las marca "solo interfaz".
- Cómo se conecta la interfaz (todo vía `services/planes.js` → `store/usePlanStore.js` → `lib/planes.js` + hooks `useFuncionalidad`):

| Funcionalidad | Dónde se oculta la interfaz | ¿También la bloquea la BD? |
|---|---|---|
| `agenda` | menú Agenda + **ruta** `/agenda`; botón "Nueva cita" de Mi día | sí (horarios_bloqueados, lista_espera) |
| `citas` | botones "Nueva cita" y "Urgencia" (Agenda, Mi día); sección "Próxima cita" de la consulta | sí (citas) |
| `urgencias` | botones "Urgencia" / "Nueva urgencia" | no |
| `turnos` | cola de espera de Mi día | no |
| `tratamientos` | menú Tratamientos + **ruta** `/catalogo`; pestaña Plan; sección de la consulta | sí |
| `planes_tratamiento` | botón "Presupuesto imprimible" | no |
| `pagos` | sección de pagos dentro de Plan | sí |
| `caja` | menú Corte de caja + **ruta** `/corte-de-caja` | no (lee `pagos`) |
| `estadisticas` | menú Reportes + **ruta** `/reportes` | no |
| `odontograma_2d` / `odontograma_3d` / `periodontograma` | pestaña Odontograma y sus vistas (2D, 3D, periodontograma, hoja); la vista guardada que ya no esté en el plan cae a una disponible | 2D y periodontograma sí; 3D no |
| `recetas` / `consentimientos` | subpestañas de "Documentos clínicos"; sección de receta de la consulta | sí |
| `fotografias` / `documentos` | pestaña Archivos (basta una de las dos) | sí |
| `expediente_clinico` | signos vitales y "Ver expediente completo" en la consulta; pestaña Historial | sí |
| `notas_clinicas` | hallazgos, diagnóstico y nota de la consulta; pestaña Historial | sí |
| `cie10` | selector CIE-10 del diagnóstico | no |
| `permisos` | asignación de asistentes a dentistas (Usuarios) | no |
| `offline` | sección "PIN para trabajar sin conexión" (Seguridad) | no |
| `sincronizacion` | las **réplicas de lectura** en segundo plano (precarga del día y lista de pacientes/agenda) | no |
| `multisucursal` | botón "+ Nueva sucursal" (Sucursales): sin la funcionalidad no se ofrece | sí (migración 079: sin ella no se crea NINGUNA sucursal) |

- **Sin conectar a ninguna pantalla** (el flag existe y se puede asignar a planes, pero hoy no restringe nada en la interfaz):
  `inventario` (no existe el módulo; ni siquiera está en el catálogo), `administracion_avanzada` (no hay una pantalla
  de clínica que le corresponda; ARCO e incidentes de seguridad son obligaciones legales y **no** se ocultan por plan),
  `auditoria` (no hay pantalla de auditoría para la clínica), `roles` (el selector de rol es indispensable para crear
  usuarios), `reportes` (la pantalla `ReporteSis` no está en ninguna ruta; "Reportes" del menú es `estadisticas`).
- `offline`/`sincronizacion` **no apagan** el motor offline: la cola de cambios pendientes se sube SIEMPRE (apagarla
  perdería datos) y la caché de lectura sigue. Solo se ocultan el PIN offline y el botón manual, y se detienen las
  réplicas de lectura. El plan no vuelve ilimitada a una clínica por trabajar sin conexión: el servidor decide al
  sincronizar (PT402/PT403 → `conflicto`).
- Las secciones de la consulta conservan su numeración fija ("1.", "2.", …): si el plan oculta alguna, queda un salto.
- Cerrar una consulta **no depende** de notas ni expediente: sin ellas simplemente no se genera nota.

## 4. Crear clínica y snapshot

`admin-crear-clinica` valida el plan (existe y está activo) **antes** de crear nada, crea la clínica, llama a
`fn_asignar_plan_interno` (solo `service_role`) y recién después crea al dueño; si algo falla, revierte.
Esa función copia al snapshot los límites y las funcionalidades **de ese momento**, fija el precio contratado
(el del plan según modalidad, o uno a la medida), la fecha de inicio, el estado y quién la creó, y audita.
`clinicas.plan/limite_usuarios/limite_pacientes` quedan como **espejo** para lo que aún las lee; la fuente de verdad es la suscripción.

## 5. Cambiar planes y precios

- Editar un plan (precio, límites, funcionalidades) **no toca** a las clínicas existentes. Verás en
  *Planes → Clínicas* quién **difiere del plan**.
- **Aplicar condiciones** (decisión explícita, clínica por clínica) o **Cambiar plan**: crea una suscripción
  nueva con el snapshot de hoy; la anterior queda como historial. Si la clínica ya supera el nuevo límite
  **no se borra nada**: se bloquean altas nuevas y se avisa (en la respuesta y en el panel de la clínica).
- Una clínica suspendida **no** se reactiva en silencio al cambiar de plan.
- Una funcionalidad nueva (creada desde el panel) **no se activa sola** en clínicas existentes; se puede
  dar a los planes elegidos y, con orden explícita, a sus clínicas vigentes. Las creadas desde el panel son
  siempre "solo interfaz" (aplicarla en BD exige migración).

## 6. Seguridad

- **Hallazgo (074):** `planes_catalogo` se creó **sin RLS** (la única tabla de `public` en esa condición). Cualquier usuario
  con sesión podía hacer `PATCH /rest/v1/planes_catalogo?...` y cambiar límites de **todas** las clínicas de un plan.
  Reproducido y corregido (RLS + sin permisos de escritura).
- Las tablas nuevas no tienen políticas de escritura ni GRANT de escritura para `authenticated`; **todo cambio pasa por funciones
  `sa_*` SECURITY DEFINER**, cada una se autoverifica (`es_super_admin`). Las internas (`fn_asignar_plan_interno`, `fn_auditar_plan`) no son ejecutables por la API.
- El precio contratado solo lo ven el dueño de la clínica y el superadmin.
- Auditoría: cada cambio guarda quién, qué (valor anterior y nuevo), cuándo y la clínica afectada (`sa_historial_planes`).

## 7. Funciones expuestas (RPC de Supabase)

Superadmin: `sa_listar_planes`, `sa_guardar_plan`, `sa_activar_plan`, `sa_duplicar_plan`, `sa_set_plan_funcionalidades`,
`sa_funcionalidades_de_plan`, `sa_guardar_funcionalidad`, `sa_clinicas_de_plan`, `sa_asignar_plan_clinica`,
`sa_ajustar_condiciones_clinica`, `sa_suspender_suscripcion`, `sa_reactivar_suscripcion`, `sa_suscripcion_de_clinica`, `sa_historial_planes`.
Clínica: `mi_suscripcion` (plan, límites, uso, funcionalidades; precio solo al dueño), `mi_limite_sesiones`.

## 8. Cola offline

Un límite o funcionalidad rechazados **durante la sincronización** (PT402/PT403) se conservan como `conflicto`
(como el CURP): no se reintentan solos, el cambio local no se pierde, cuenta como "con error", se puede descartar y el
botón "Reintentar sincronización" lo vuelve a intentar (p. ej. tras ampliar el plan). El plan de la clínica se cachea
localmente (se borra al cerrar sesión o cambiar de cuenta) para que los menús funcionen sin conexión.

## 9. Pruebas

```
supabase/tests/run_planes_tests.sh      # necesita un PostgreSQL local; no toca Supabase
npx vitest run src/components/ui/__tests__/planes
```
El SQL se probó en PostgreSQL 16 **real** aplicando las 74 migraciones reales sobre una capa que **imita** a Supabase
(`auth.uid()`, roles, permisos por defecto). No es un proyecto Supabase: conviene repetir lo esencial en *staging*.
Las Edge Functions solo se validaron de **sintaxis** (no hay Deno aquí); falta probarlas desplegadas.

## 10. Decisiones abiertas / puntos a revisar

1. **Composición inicial de planes** (qué funcionalidades trae cada uno): no estaba especificada; es una *propuesta mía* (Esencial = base
   clínica + agenda + pagos; Profesional suma 3D, periodontograma, consentimientos, fotos, documentos…; Clínica suma multisucursal, reportes,
   auditoría; Empresarial todo). Edítala en el panel. Las clínicas existentes **no** la reciben: conservan todo.
2. **Clínicas creadas por un dueño** (`crear-usuario` con rol `owner`): esa vía **sigue creando clínicas sin suscripción**
   (sin límites ni restricciones). Es comportamiento anterior y podría ser intencional, por eso no se cambió. Si no lo es, basta
   exigir `es_super_admin` en esa rama de la función.
3. **Clínicas sin suscripción** conservan el comportamiento anterior (sin restricciones de funcionalidad, límites de las columnas viejas).
4. **Migraciones**: hay dos archivos `064_*` (el viejo definía el trigger de sesiones con números fijos y devolvía 1 para
   cualquier plan que no conociera, incluido `empresarial`; 075 lo elimina) y la `007` referencia una columna que agrega la `040`.
5. El `basico` pasó a llamarse `esencial` (el CHECK con la lista fija de planes se eliminó; la llave foránea garantiza validez).

## 11. Lo que NO se hizo (para que no se dé por hecho)

- **WhatsApp**: no se agregó (SIRO no tiene la integración). Si algún día existe, se crea como funcionalidad desde el panel.
- **Datos fiscales / RFC / teléfono del responsable** en el alta de clínica: el formulario sigue pidiendo nombre de la clínica, nombre y correo del dueño (+ plan y modalidad).
- **"Otros límites configurables"**: existe la columna `configuracion_json` en el plan y en el snapshot, pero no hay pantalla para editarla ni nada que la lea.
- **Límite de almacenamiento**: se guarda, no se aplica (ver §2).
- **Vencimiento automático** de suscripciones (`fecha_fin`) y **cobro/facturación**: no existen; las fechas son informativas.
- **`403 FEATURE_NOT_AVAILABLE` con mensaje** al leer una funcionalidad no incluida (ver §3).
- **Ocultar en la interfaz** todas las funcionalidades (ver §3 para la lista exacta de las que sí se ocultan).
- **Edge Functions ejecutadas**: solo validadas de sintaxis.

## 12. Integración en la aplicación (servicio → store → gating)

- **Una sola fuente**: `obtenerMiSuscripcion()` (`services/planes.js`, rpc `mi_suscripcion`) → `usePlanStore` → `funcionalidadDisponible()` (`lib/planes.js`). No hay otro store, servicio ni contexto.
- **Caché por identidad**: clave `siro:mi-suscripcion:<user_id>:<clinica_id>`. Cae a la caché **solo** ante fallas de red; un rechazo del servidor se propaga sin modificar. Se vacía junto con la caché de lectura (`limpiarDatosLocalesDeSesion` al cerrar sesión, `asegurarCacheDeEsteUsuario` al cambiar de cuenta).
- **Store**: cada carga lleva una versión; si la identidad cambia o se cierra sesión mientras se espera, la respuesta tardía se **descarta**. `usePlanStore` se suscribe a `useAuthStore`: en cuanto cambia usuario o clínica del perfil (logout voluntario o forzado, recarga de perfil) se limpia solo, sin depender de que haya componentes montados. Y los hooks solo entregan la suscripción si su identidad coincide con la de la sesión.
- **Cambio de plan** hecho por el superadmin: se refresca al iniciar, al recuperar la red, al volver a la pestaña (máx. 1/min) y cada 5 min (`useSuscripcionAlDia`). Con datos guardados, el panel lo avisa.
- **Cambio de clínica**: en SIRO una cuenta pertenece a UNA clínica; "cambiar de clínica" ocurre al cambiar de cuenta o si cambia `clinica_id` del perfil. Cambiar de **sucursal** no cambia el plan (es por clínica).
- Los rechazos reales de la BD se muestran con `mensajeErrorDePlan` al crear pacientes, usuarios y sucursales y al reactivar sucursales.

## 13. Hotfix de la auditoría: migraciones 076 y 077

**Orden de despliegue**
1. **074** (RLS de `planes_catalogo`) y **077** (nadie se hace superadmin por la API): hotfix de seguridad, independientes de los planes; se aplican de inmediato.
2. **075** (planes y suscripciones). Ahora se niega a correr si la 074 no está aplicada.
3. **076** (una clínica nunca existe sin suscripción). Requiere la 075.

**077 — escalada a superadmin.** `usuarios_update_owner` permitía a un dueño actualizar cualquier fila de su clínica, incluida `es_super_admin`; con eso un dueño podía hacerse superadmin (`PATCH /usuarios {"es_super_admin": true}`) y llamar todas las `sa_*`. Un trigger impide ahora a `authenticated`/`anon` activar o cambiar esa columna. El alta de un superadmin se hace con SQL o `service_role`.

**076 — clínica sin suscripción.**
- `crear-usuario` ya no crea owners ni clínicas (responde 403); solo el superadmin da de alta clínicas con `admin-crear-clinica`.
- `fn_crear_clinica_con_plan` crea clínica y suscripción en una sola transacción (solo `service_role`) y un trigger diferido rechaza cualquier clínica sin suscripción vigente.
- **Antes de desplegar**, busca clínicas ya huérfanas (creadas entre la 075 y la 076):
  `select id, nombre from clinicas c where not exists (select 1 from suscripciones s where s.clinica_id = c.id and s.estado <> 'reemplazada');`
  Regularízalas con "Asignar plan" del superadmin; hasta entonces funcionan igual pero no se pueden reactivar.

**Verificación:** `supabase/tests/run_planes_tests.sh` (heredadas, idempotencia, 84 pruebas) y `planes_auditoria_hotfix_test.sql` (13 pruebas de los ataques de la auditoría). Ambas corren contra PostgreSQL local, no contra Supabase.

**Pendiente de decisión:** si un plan nuevo QUITA una funcionalidad, los datos de esa funcionalidad no se borran pero la clínica deja de verlos (RLS). Un owner también puede insertar otro owner en su propia clínica por la API directa (no crea clínicas y cuenta contra el límite de usuarios).

## 14. Usuarios y sucursales: límites en pantalla (migración 079)

- **"+ Nuevo usuario"** desaparece al llegar al límite de usuarios del plan y en su lugar se explica por qué, con "Mejorar plan". Esencial (1): "Tu plan incluye 1 usuario: el principal." Profesional (3): desaparece al llegar a 3. El límite se edita por plan en el panel de planes (`max_usuarios`; vacío = ilimitado).
- **"+ Nueva sucursal"** solo aparece si el plan incluye la funcionalidad `multisucursal` y aún hay cupo. Esencial y Profesional (que no la incluyen) no pueden crear ninguna. Para dar sucursales a un plan: activa `multisucursal` en el plan y fija `limite_sucursales`.
- **Base de datos (079):** crear una sucursal sin `multisucursal` se rechaza siempre (PT403), también la primera; antes la primera se permitía y por eso Esencial "sí dejaba". Reactivar una sucursal que ya existía conserva la regla anterior. No se toca ninguna sucursal existente ni a las clínicas heredadas.
- El botón es solo interfaz: la base de datos rechaza el alta de más (PT402 usuarios/sucursales, PT403 sin la funcionalidad). Ante la duda (sin suscripción, clínica heredada, datos que no llegaron) no se oculta nada.
- El contador de uso viene de la suscripción y se vuelve a pedir tras cada alta, baja o reactivación, así el botón aparece o desaparece al momento (`cargar({ forzar: true })`).
- Pruebas: `sucursales_multisucursal_test.sql` (9) y `altaUsuariosYSucursales.test.js` (22, renderiza las pantallas reales).

### 14.1 Qué se oculta cuando el plan no lo incluye (migración 080 y menú)

- **Sucursales** (entrada del menú y pantalla `/sucursales`) se oculta si el plan no incluye `multisucursal` **y** la clínica no tiene ninguna sucursal. Si ya tiene (por ejemplo, bajó de plan), conserva el acceso para verlas y desactivarlas: no se esconde lo que ya usa. Quien escriba la dirección a mano ve "Esta funcionalidad no está disponible en tu plan" con "Mejorar plan".
- **Profesional incluye 1 sucursal** (migración 080: `multisucursal` activada, tope 1). Esencial no. Cambia el catálogo: las clínicas que ya tenían Profesional conservan su snapshot; para dársela, el superadmin usa "Aplicar condiciones actuales del plan" en esa clínica.
- Pruebas: `ocultarSucursalesSegunPlan.test.js` (11, renderiza el menú lateral real) y `sucursales_multisucursal_test.sql` (10).
