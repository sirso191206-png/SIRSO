# SIRO — Guía de despliegue

Versión de esta guía: refleja el estado real del proyecto al cierre de la
ronda de preparación para V1 de producción — **45 migraciones** (001 a 045),
sin ningún resto de SIS en código ni en Supabase.

---

## 1. Requisitos

- Node.js 18+ y npm
- Cuenta de Supabase (proyecto propio, con acceso al SQL Editor o a la CLI)
- Cuenta de Vercel (o cualquier hosting que sirva un build estático de Vite)

---

## 2. Variables de entorno (frontend)

```
VITE_SUPABASE_URL=https://<tu-proyecto>.supabase.co
VITE_SUPABASE_ANON_KEY=<tu anon key>
```

---

## 3. Base de datos (Supabase) — migraciones

Corre todas las migraciones de un jalón:

```bash
supabase db push
```

Esto aplica, en orden, las 45 migraciones (`001` a `045`). Están escritas para
ser seguras de volver a correr (`if not exists` / `drop policy if exists` /
`create or replace function`), así que repetir el comando no rompe nada si
alguna ya se había aplicado.

Si prefieres correrlas manualmente en el SQL Editor del dashboard, respeta el
orden numérico — algunas migraciones posteriores redefinen funciones/vistas
creadas en migraciones anteriores.

**Las más recientes, para referencia rápida (roles, permisos y cierre de V1):**

| Migración | Qué hace |
|---|---|
| `038` | Arquitectura de asignación de pacientes: `dentista_responsable_id`, tabla `asistente_dentista_asignaciones`, función `auth_paciente_asignado()` — la única fuente de verdad para autorización clínica |
| `039` | Corrige `pacientes_update`/`expedientes_insert`, que se habían quedado sin el filtro de asignación |
| `040` | Corrige `v_tratamientos_recepcion` (no funcionaba para recepción por un problema de `security_invoker`), agrega `pacientes.archivado_en` (columna que faltaba), y la restricción por columna en `pacientes UPDATE` |
| `041` | Corrige `fotografias`, `storage.objects` (ambos buckets clínicos no verificaban clínica/asignación — cualquier usuario logueado podía descargar archivos de otra clínica) y `citas` (dependía de `dentista_id` directo, no de la asignación real) |
| `042` | Logo de clínica — columna `clinicas.logo_url` + bucket público `logos-clinicas` |
| `043` | Corrige `signos_vitales`, la última tabla clínica sin el filtro de asignación |
| `044` | Cierra permisos de pacientes: lista blanca ampliada de recepción (CURP, tipo_paciente), `pacientes_insert` restringido a owner/dentista/recepción, y refuerza la autoasignación para que un dentista nunca pueda asignar un paciente a otro dentista |
| `045` | Elimina de Supabase los objetos exclusivos de SIS: tabla `sis_catalogo_establecimientos` y 14 columnas SIS sin uso en `usuarios`/`pacientes` |

**Importante — 038 duplicada, ya resuelta**: durante el desarrollo existieron
temporalmente dos migraciones "038" (una arquitectura paralela, redundante).
Se confirmó que la duplicada nunca se aplicó a un Supabase real y se eliminó
del repositorio — solo queda `038_sirso_permisos_por_asignacion.sql`.

---

## 4. Storage

Tres buckets, todos creados por las propias migraciones (no hace falta
crearlos a mano en el dashboard):

| Bucket | Público | Contenido |
|---|---|---|
| `fotos-clinicas` | No (URL firmada) | Fotografías clínicas — acceso restringido por asignación de paciente |
| `documentos-clinicos` | No (URL firmada) | Documentos clínicos — solo owner/dentista |
| `logos-clinicas` | Sí | Logo de cada clínica — no es información sensible |

---

## 5. Edge Functions

```bash
supabase functions deploy admin-crear-clinica admin-actualizar-clinica admin-eliminar-clinica admin-listar-clinicas admin-ver-clinica cambiar-password crear-usuario eliminar-usuario enviar-contacto
```

No hay ninguna función relacionada con SIS — se eliminó `sis-cifrar-archivo`
en el cierre de V1.

---

## 6. Secrets

Las funciones usan `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`,
que Supabase provee automáticamente — no hay que configurar nada para esos.

Manuales, solo si usas el formulario de contacto:
- `CORREO_SOPORTE`
- `RESEND_API_KEY`

---

## 7. Frontend — build y despliegue

```bash
cd frontend
npm install
npm run build
```

Sube `dist/` a Vercel (o el hosting que uses). El modelo 3D del odontograma
(`odontograma.glb`, ~1 MB) va incluido en `public/models/` — se empaqueta solo
con el build.

---

## 8. Configuración inicial de producción

### Crear el primer Owner y su clínica
El primer usuario de cada clínica se crea con rol `owner` — la Edge Function
`crear-usuario` acepta `nombreClinica` cuando el rol es `owner`, y crea la
clínica y el usuario en el mismo paso.

### Crear el resto de los usuarios
El owner, desde `/usuarios`, crea odontólogos/asistentes/recepción de su
propia clínica. Cada uno recibe una contraseña temporal que debe cambiar en
su primer inicio de sesión.

### Datos profesionales del odontólogo
Cada odontólogo captura su propia cédula/RFC/universidad desde "Datos
profesionales" en su sesión (o el owner lo hace por él desde `/usuarios`).
Estos datos aparecen automáticamente en las recetas que emita — con snapshot
histórico: si los corrige después, las recetas ya emitidas no cambian.

### Logo de la clínica
El owner lo sube desde `/configuracion` — aparece automáticamente en las
recetas impresas.

---

## 9. Roles y permisos — resumen

| Rol | Pacientes | Expediente clínico | Recetas | Odontograma/periodontograma | Citas/pagos |
|---|---|---|---|---|---|
| **Owner** | Todos los de su clínica | Todos | Todas | Todos | Todos |
| **Dentista** | Solo los asignados a él | Solo de sus pacientes | Solo de sus pacientes | Solo de sus pacientes | Solo de sus pacientes |
| **Asistente** | Solo de los dentistas que apoya | Limitado, según asignación | No | No | Según asignación |
| **Recepción** | Todos (datos administrativos) | No | No | No | Todos (administrativo) |

### Asignación de pacientes
- `pacientes.dentista_responsable_id` — el odontólogo responsable.
- Un dentista que crea un paciente se autoasigna automáticamente.
- Recepción que crea un paciente lo deja sin asignar (`NULL`) — el owner lo
  asigna después.
- **Solo el owner reasigna** — protegido por un trigger, no solo por RLS de
  fila.
- Un asistente ve/apoya según la tabla `asistente_dentista_asignaciones`
  (a qué dentista(s) apoya) — la administra el owner.

### Recepción — columnas de paciente que sí/no puede modificar
Lista blanca (no lista negra): nombre, apellidos, teléfono(s), correo,
domicilio completo, nacionalidad, CURP, tipo_paciente. **Nunca**:
`estado_expediente`, `dentista_responsable_id`, `clinica_id`, ni ninguna
columna clínica — incluidas las que se agreguen en el futuro (protegidas por
defecto).

---

## 10. Multi-clínica

Cada consulta está acotada por `clinica_id = auth_clinica_id()` — un usuario
nunca ve datos de otra clínica, ni conociendo el UUID directamente. Verificado
mediante inspección exhaustiva del SQL de cada política — **no probado contra
un Supabase real con múltiples clínicas** (ver sección de pruebas pendientes
abajo).

---

## 11. Pruebas RLS — qué está verificado y qué no

Todo lo de este proyecto relacionado con RLS fue verificado mediante
**inspección estructural del SQL** (confirmar que cada política contiene
exactamente los patrones de seguridad esperados) y **pruebas unitarias** de
la lógica JS pura — nunca contra un Supabase real conectado.

Antes de considerar el sistema listo para producción, se recomienda crear
manualmente un escenario de prueba con al menos 2 clínicas y los 4 roles, y
verificar cada combinación rol × tabla × clínica descrita en la sección de
roles y permisos de arriba.

---

## 12. Estructura del repositorio

```
SIRSO/
├── frontend/            — la app React completa
├── supabase/
│   ├── migrations/       — 001 a 045, en orden
│   └── functions/        — 9 Edge Functions + _shared/
```
