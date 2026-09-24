# SIRO

## Solución Integral de Registro Odontológico

SIRO es una plataforma SaaS para gestión odontológica: expediente clínico
electrónico, odontograma 2D/3D, periodontograma, agenda, recetas, cobros y
un módulo legal/privacidad completo (avisos, consentimientos, cookies,
ARCO). Pensado para odontólogos independientes, consultorios pequeños y
clínicas con varias sucursales.

---

## 1. Funcionalidades actuales

**Clínica y administrativo**
- Autenticación (Supabase Auth), usuarios, roles (owner, dentista,
  asistente, recepción) y superadmin de plataforma — ver sección 11.
- Clínicas, multi-sucursal (sucursales, consultorios, sillones).
- Pacientes, expediente clínico (antecedentes, alergias, medicamentos,
  hábitos, signos vitales).
- Consulta (flujo unificado: motivo, signos vitales, hallazgos,
  diagnóstico, odontograma, tratamiento, nota clínica, receta, próxima
  cita).
- Agenda (citas, urgencias, lista de espera, bloqueos de horario).
- Odontograma 2D y 3D, periodontograma con gráfica de zigzag por
  arcada (sondaje vestibular/lingual).
- Tratamientos, recetas, pagos, corte de caja, reportes.
- Documentos clínicos, fotografías, radiografías (Storage privado).
- Consentimientos informados (firma capturada, inmutables una vez
  firmados, revocación y cancelación auditadas).
- Referencias e interconsultas.
- Auditoría de escritura (crear/editar/eliminar, automática vía
  triggers) y de eventos de lectura/acceso (registrados explícitamente
  desde el frontend).

**Legal y privacidad**
- Centro Legal (`/legal`), Aviso de Privacidad (simplificado e
  integral), Términos y Condiciones.
- Cookies y tecnologías de almacenamiento — inventario real (no
  genérico), banner y preferencias configurables.
- Derechos ARCO — formulario público, panel de gestión para el owner,
  límite anti-spam y verificación de identidad exigida antes de
  aprobar/atender una solicitud.
- Seguridad, Retención, Proveedores y Acuerdo de Tratamiento de Datos
  (documentos versionados).
- Exportación de datos de un paciente (JSON), auditada.
- Control de sesiones (registro propio de inicios de sesión).
- Registro de incidentes de seguridad.
- Checklist legal y panel `/admin/legal` (solo superadmin).

---

## 2. Arquitectura

**Frontend**: React + Vite + Tailwind CSS + Zustand + React Router.
**Backend**: Supabase (Postgres + Auth + Storage + Row Level Security +
Edge Functions).
**Hosting**: Vercel (o cualquier hosting que sirva un build estático de
Vite).

---

## 3. Seguridad

- Autenticación vía Supabase Auth; ninguna contraseña se maneja ni se
  registra manualmente en el código de SIRO.
- Row Level Security en todas las tablas con datos de clínica —
  aislamiento entre clínicas aplicado por la propia base de datos, no
  solo por la aplicación.
- Roles y permisos por asignación (paciente ↔ dentista/asistente).
- Storage privado para fotografías, radiografías y documentos
  clínicos.
- Auditoría de escritura y de eventos de acceso.
- Control de sesiones y registro de incidentes de seguridad.
- Operaciones privilegiadas (crear/eliminar usuarios, administrar
  clínicas) pasan por Edge Functions con validación de token
  explícita, nunca por `service_role` en el frontend.

SIRO no afirma ser "100% seguro" ni "imposible de vulnerar" — ninguna
afirmación de este tipo aparece en el producto ni en este documento.

---

## 4. Privacidad

Aviso de Privacidad (simplificado e integral), Términos, Política de
Cookies y sus preferencias, Consentimientos y Derechos ARCO están
implementados con versionado y registro de aceptación.

**Los documentos legales incluidos son borradores/plantillas** —
marcados explícitamente como tales en su propio texto, con puntos
señalados para revisión jurídica donde corresponde. Ver sección 20.

---

## 5. Consentimientos

- **Legales**: aceptación de avisos/términos, registrada de forma
  inmutable (nunca se sobrescribe; una nueva versión del documento no
  borra la aceptación de la anterior).
- **Clínicos**: consentimiento informado por procedimiento, con firma
  capturada. Una vez firmado, el contenido no se puede editar — solo
  revocar (el paciente retira su autorización) o cancelar (el registro
  nunca debió existir). Ambas acciones quedan auditadas.
- El flujo de firma remota ("enviar al paciente para firmar después")
  no está implementado — hoy el contenido y la firma se capturan en
  una sola sesión.

---

## 6. Expediente clínico

Antecedentes, alergias, medicamentos, diagnósticos, tratamientos,
notas clínicas, odontograma, periodontograma, documentos,
fotografías, radiografías, recetas, consentimientos e historial —
todo vinculado al paciente y visible en su línea de tiempo.

SIRO incorpora herramientas orientadas a la gestión del expediente
clínico y a los requisitos aplicables. Esto no constituye, por sí
mismo, una certificación de cumplimiento de ninguna norma.

---

## 7. Rutas legales

| Ruta | Descripción |
|---|---|
| `/legal` | Centro Legal |
| `/legal/privacidad` | Aviso de Privacidad |
| `/legal/terminos` | Términos y Condiciones |
| `/legal/cookies` | Cookies y tecnologías de almacenamiento |
| `/legal/cookies/preferencias` | Cambiar preferencias |
| `/legal/arco` | Solicitud de Derechos ARCO (pública) |
| `/legal/seguridad` | Seguridad |
| `/legal/retencion` | Conservación de información |
| `/legal/proveedores` | Proveedores |
| `/legal/acuerdo-tratamiento-datos` | Acuerdo de Tratamiento de Datos |
| `/administracion/arco` | Gestión de solicitudes ARCO (owner) |
| `/administracion/incidentes` | Incidentes de seguridad (owner) |
| `/admin/legal` | Checklist y panel legal (superadmin) |
| `/configuracion/seguridad` | Sesiones propias (cualquier usuario) |

---

## 8. Exportación

SIRO permite exportar la información de un paciente en **JSON**
(expediente, notas, tratamientos, recetas, consentimientos, signos
vitales), y cuenta con impresión del expediente completo en PDF vía el
navegador. Cada exportación queda registrada en auditoría (quién, qué
paciente, cuándo).

**CSV no está implementado.**

---

## 9. Sesiones

SIRO mantiene su **propio registro** de inicios de sesión (dispositivo,
navegador aproximado, fecha) — el SDK de cliente de Supabase Auth no
expone una forma de listar sesiones activas en otros dispositivos, así
que esto no viene "gratis" de la plataforma de autenticación.

Con ese registro, SIRO puede hoy:
- Mostrar las sesiones registradas del usuario.
- Quitar una sesión del listado (solo del registro, es una acción de
  visualización).
- Cerrar **todas** las sesiones del usuario a la vez, vía Supabase Auth
  (`signOut` con alcance global) — esto sí revoca acceso real en
  cualquier dispositivo.

**SIRO no puede cerrar remotamente una sesión específica en otro
dispositivo de forma individual** — eso requeriría una Edge Function
con `service_role` que no está construida. No se afirma esa capacidad
en ningún lugar del producto.

---

## 10. Incidentes de seguridad

Registro estructurado por clínica (o de plataforma, para
super-administrador): tipo, severidad (baja/media/alta/crítica),
descripción, datos y usuarios afectados, acciones tomadas, estado
(detectado → en investigación → contenido → resuelto → cerrado) y
resolución. Visible únicamente para el owner de la clínica
correspondiente o el super-administrador — nunca para otros roles.
Cada cambio queda auditado.

---

## 11. Roles

- **owner**: administra su propia clínica (usuarios, sucursales,
  configuración, ARCO, incidentes).
- **dentista / asistente / recepción**: acceso según rol y asignación
  de pacientes.
- **superadmin** (`usuarios.es_super_admin`): administra la plataforma
  SIRO en general (clínicas, checklist legal) — es un indicador
  **separado** del rol, un usuario no puede auto-asignárselo ni
  cambiar su propio rol vía una petición manipulada; ambos quedan
  protegidos a nivel de base de datos.

**Owner no equivale a superadmin.**

---

## 12. Estructura del proyecto

```
frontend/
  src/
    components/
    pages/
    services/
    hooks/
    store/
    lib/
supabase/
  migrations/
  functions/
```

---

## 13. Migraciones

Las migraciones son **acumulativas y nunca se modifican una vez
aplicadas** — cualquier corrección o cambio posterior se hace con una
migración nueva. Al día de hoy hay 59 migraciones (`001`–`059`).

Antes de aplicar, revisa el estado actual de tu base de datos. Para
aplicarlas:

```bash
supabase db push
```

---

## 14. Edge Functions

Funciones activas en `supabase/functions/`:

`admin-crear-clinica`, `admin-actualizar-clinica`,
`admin-eliminar-clinica`, `admin-listar-clinicas`, `admin-ver-clinica`,
`cambiar-password`, `crear-usuario`, `eliminar-usuario`,
`enviar-contacto`.

> Ver sección 21 — se encontró una carpeta adicional
> (`sis-cifrar-archivo`) sin código dentro; no se documenta como
> función activa.

---

## 15. Variables de entorno

Definidas en `frontend/.env.example` (sin valores reales):

```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

Nunca subas un archivo `.env` con valores reales al repositorio. La
`service_role_key` de Supabase **nunca** debe vivir en el frontend —
solo la usan las Edge Functions, del lado del servidor.

---

## 16. Instalación

```bash
cd frontend
npm install
npm run dev      # servidor de desarrollo
npm run build    # build de producción
npm run preview  # sirve el build localmente
```

---

## 17. Despliegue

```bash
git add .
git commit -m "..."
git push
```

Si Vercel está conectado al repositorio, despliega automáticamente al
hacer push. Si necesitas desplegar una Edge Function que modificaste:

```bash
supabase functions deploy NOMBRE-DE-LA-FUNCION
```

---

## 18. Tests

```bash
cd frontend
npm run test:run
```

Ejecutados como parte de esta actualización: **296/296 pruebas
pasando**, en 40 archivos de prueba.

---

## 19. Estado del proyecto

**MVP / Beta en pruebas.** SIRO no es un producto terminado, no está
certificado, y no se garantiza cumplimiento legal o regulatorio
completo — ver sección 20.

---

## 20. Aviso legal

Los documentos legales incluidos en SIRO son plantillas sujetas a
revisión profesional. Su implementación técnica no constituye por sí
misma una certificación de cumplimiento legal o regulatorio.

---

## 21. Notas de esta revisión

- Se encontró una carpeta `frontend/src/features/interoperabilidad/sis/`
  (15 archivos) y una carpeta vacía
  `supabase/functions/sis-cifrar-archivo/` sin `index.ts`. Este módulo
  (SIS) ya se había eliminado en una limpieza anterior del proyecto —
  reapareció en este zip, aparentemente por sobrescribir la carpeta de
  trabajo con una copia anterior. No se tocó (esta actualización es
  solo del README), pero se deja señalado aquí para que se revise.
