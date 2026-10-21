# SIRO — Informe de estado del proyecto (V3, 20/10/2026)

**SIRO (Solución Integral de Registro Odontológico)** es una plataforma SaaS web para consultorios y clínicas dentales en México. Incluye expediente clínico electrónico, odontograma 2D y 3D, periodontograma, agenda, consulta, recetas, cobros, multisucursal, planes de suscripción y un módulo legal y de privacidad.

- **En producción:** frontend en Vercel (`sirso.vercel.app`) y backend en Supabase (proyecto DentalMedic).
- **Versión publicada:** commit `bf21707` (SIRO V3), migraciones 001–112.
- **Pendiente de subir (commits locales, sin push):**
  - `bbe7384`: corrección 113, ya aplicada en la base de datos de producción.
  - `68c386e`: migración 114, cobro automático con Stripe. Todavía **no** está en producción.

---

## 1. Qué utiliza (tecnología)

| Capa | Tecnología |
|---|---|
| Interfaz | React 18, Vite 5, Tailwind CSS 3, React Router 7, Zustand (estado) |
| 3D | three.js, @react-three/fiber y drei (odontograma 3D con modelos GLB) |
| Gráficas | Recharts (dashboard, periodontograma) |
| Base de datos | Supabase: PostgreSQL 17 con seguridad por filas (RLS) en todas las tablas clínicas |
| Autenticación | Supabase Auth, con cambio de contraseña obligatorio en el primer acceso |
| Archivos | Supabase Storage privado (fotografías, radiografías, documentos, logos) |
| Lógica de servidor | 10 Edge Functions (Deno) en producción: crear, ver, listar, actualizar y eliminar clínicas; crear y eliminar usuarios; cambiar contraseña; formulario de contacto; cifrado de archivos SIS. Otras 3 listas para desplegar: `stripe-checkout`, `stripe-portal` y `stripe-webhook` |
| Cobro | Stripe (Checkout, portal del cliente y webhook firmado). SIRO no guarda tarjetas |
| Sin conexión | Service worker y copia local en IndexedDB, con cola de sincronización |
| Pruebas | Vitest: 152 archivos y **2011 pruebas, todas en verde**. Además hay 43 baterías SQL de base de datos y pruebas Deno de las funciones |
| Hospedaje | Vercel (publica automáticamente desde `main`) y Supabase |

**Tamaño:** unos 460 archivos de código del frontend, 114 migraciones SQL, 21 scripts de reversión (rollback) y 26 documentos técnicos y legales en `docs/`.

---

## 2. Qué hace (funciones actuales)

**Clínica**
- **Pacientes:**
  - registro con CURP;
  - ficha y datos privados separados;
  - tutor o representante para menores.
- **Expediente clínico:**
  - antecedentes heredofamiliares;
  - alergias y medicamentos;
  - interrogatorio por sistemas;
  - exploración física;
  - signos vitales;
  - línea de tiempo.
- **Consulta unificada:** motivo, signos vitales, hallazgos, diagnóstico CIE-10, odontograma, tratamiento, nota clínica, receta y próxima cita. Se cierra de forma **atómica**: o se guarda todo o no se guarda nada.
- **Odontograma:**
  - 2D por caras;
  - 3D con modelos GLB y rotación;
  - historial;
  - detalle por pieza.
- **Periodontograma:** sondaje vestibular y lingual, gráfica en zigzag por arcada e historial.
- **Tratamientos:** catálogo de tratamientos, presupuesto imprimible y cancelación auditada.
- **Recetas:** firma en pantalla y datos profesionales (cédula).
- **Consentimientos informados:**
  - firma en pantalla;
  - no se pueden modificar una vez firmados;
  - la revocación queda auditada.
- **Archivos del paciente:** fotografías, radiografías y documentos en almacenamiento privado, con topes de tamaño y tipos de archivo validados.
- **Referencias e interconsultas.**
- **Reportes SIS (interoperabilidad):** captura, catálogo de establecimientos y cifrado de archivos.

**Operación**
- **Agenda:**
  - vistas de día, semana y mes;
  - urgencias y turnos;
  - lista y cola de espera;
  - bloqueos de horario;
  - pantalla «Mi día».
- **Pagos:** anticipos, reembolsos, anulación, saldos y **corte de caja**. Los cobros son **idempotentes**: un reintento no duplica un pago (H28).
- **Dashboard y reportes:** filtros, ranking de tratamientos y exportación a CSV.
- **Usuarios y roles:** owner, dentista, asistente y recepción, con asignación de pacientes. Además existe el superadmin de la plataforma.
- **Multisucursal:** sucursales, consultorios y sillones, según el plan contratado.
- **Sin conexión:** trabaja con lo preparado ese día y sincroniza al recuperar la conexión, con control de concurrencia en pacientes, expedientes, odontograma y citas.
- **Sesiones:** control de sesiones reales y límite de sesiones simultáneas por plan (se cierra la sesión más antigua).

**Comercial (planes)**
- Hay 4 planes guardados en la base de datos y editables desde `/superadmin/planes`. Estos son los precios de origen de la migración 075; pueden haberse cambiado después desde el panel:

  | Plan | Precio | Pacientes | Usuarios | Sucursales |
  |---|---|---|---|---|
  | **Esencial** | $599 MXN/mes ($5,990/año) | 500 | 1 | 1 |
  | **Profesional** | $999 MXN/mes | 2,000 | 3 | 1 |
  | **Clínica** | $1,799 MXN/mes | 7,500 | 10 | 3 |
  | **Empresarial** | $3,999 MXN/mes | ilimitados | ilimitados | ilimitadas |

- Los límites (pacientes, usuarios, sucursales y sesiones) se aplican **en la base de datos**, no solo en la pantalla. Las funcionalidades por plan se aplican con RLS.
- Avisos de vencimiento y suspensión de clínicas.
- **Pago en línea con Stripe** (migración 114; listo en código, falta activarlo). El owner paga su plan con tarjeta y Stripe lo cobra solo cada mes o cada año. En el portal de Stripe el owner cambia de tarjeta o de plan, cancela y descarga sus recibos.
  - Cada pago extiende el vencimiento automáticamente.
  - Un pago fallido no bloquea nada: la clínica pasa a gracia y luego queda vencida.
  - Se ve el historial de cobros.
  - Se activa cuando el superadmin captura el precio de Stripe de cada plan (ver `docs/COBRO_STRIPE.md`).

**Seguridad, legal y privacidad**
- **Aislamiento entre clínicas:** se aplica con RLS; privilegios mínimos (095); la auditoría no se puede falsificar (100).
- **Auditoría:** las escrituras se registran automáticamente y los accesos de lectura también quedan registrados.
- **Centro legal:**
  - 9 documentos legales vigentes (versión 1.0): aviso de privacidad simplificado e integral, términos, cookies, seguridad, retención, proveedores y acuerdo de tratamiento;
  - **aceptación obligatoria** al entrar.
- **Derechos ARCO:**
  - formulario público con protección anti-spam;
  - verificación de identidad;
  - panel de gestión.
- **Incidentes de seguridad:** registro de incidentes.
- **Exportación de datos del paciente:** en JSON, con auditoría.
- **Conservación de datos:**
  - la eliminación de clínicas está bloqueada mientras no se configure la política de conservación;
  - un usuario con registros no se puede borrar.
- **Formulario de contacto:** con límites de tamaño y de frecuencia.

---

## 3. Historia del proyecto (de lo más antiguo a lo más nuevo)

| Fecha | Etapa | Qué se añadió |
|---|---|---|
| 11–12/07/2026 | Primera subida | Esquema base, agenda, despliegue en Vercel |
| 15–22/07 | Fase clínica | Odontograma 3D, nuevo login, contacto, recuperación de contraseña, urgencias, turnos, registro por CURP, folio, tratamientos, pagos, periodontograma, recetas, CIE-10, consentimientos (migraciones 001–028) |
| 14–18/08 | Seguridad y SIS | Planes por clínica, suspensión, límites de pacientes, interoperabilidad SIS, cifrado de archivos (029–032) |
| 18–28/08 | **SIRO V1 (beta)** | Expediente completo, datos personales separados, tutor, permisos por asignación, auditoría de fotos y signos vitales, impresión de recetas (033–046) |
| 22–26/09 | **Primera puesta en producción** | Multisucursal, módulo legal (fase 1), ARCO, cookies, sesiones, incidentes, firma de recetas, límites de sesiones, índices de rendimiento, nuevo diseño completo (047–068) |
| 27/09–01/10 | Modo sin conexión | Offline V1 y V2, sincronización, concurrencia de pacientes, expedientes, odontograma y citas, edición de pagos (069–073) |
| 05–08/10 | **SIRO V1.0** | Sistema de planes y suscripciones, correcciones de seguridad del superadmin, sesiones reales, sucursales según plan, aislamiento de la auditoría, catálogo honesto, owner como dentista (074–084) |
| 17/10 | **SIRO V3** (en producción) | Ver la sección 4 (085–112, Edge Functions, H23–H28) |
| 17/10 | Corrección 113 | El panel de suscripción del superadmin ya no falla con «roles» (aplicada en la base; commit local sin subir) |
| 20/10 | Configuración D4 | Las clínicas de prueba sin pacientes ni pagos ya se pueden eliminar; las que tienen datos clínicos o pagos siguen protegidas (aplicado en producción) |
| 20/10 | Cobro con Stripe | Migración 114, 3 Edge Functions y pantallas de pago (commit local `68c386e`; falta el alta en Stripe y el despliegue) |

## 4. Actualizaciones de la V3 (lo más reciente)

- **Consulta atómica y verificada** (085, 088, 090): una cita solo se completa a través de la consulta.
- **Integridad clínica** (091, 092, 097, 098, 101):
  - la nota queda vinculada a la cita;
  - la autoría y las referencias se validan;
  - las notas solo pueden retrofecharse dentro de un límite configurable;
  - se registra quién firma los documentos clínicos.
- **Corrección de citas completadas** (094), con auditoría.
- **Privilegios mínimos** (095) y **auditoría no falsificable** (100).
- **Contacto** con límites de tamaño y frecuencia (099, 102).
- **Cambio de contraseña obligatorio** en el primer acceso (103).
- **Política de conservación, retención legal y eliminación controlada de clínicas** (086, 087, 089, 104, 107, 108, 109). La eliminación está bloqueada mientras no se configuren las decisiones D2–D4.
- **Documentos legales**: borradores v2 (105) y versión 1.0 vigente con aceptación obligatoria (106).
- **Correcciones finales:**
  - periodontograma (110);
  - un usuario con registros no se borra (111);
  - el dentista ve al paciente que creó (112);
  - cobros idempotentes (H28);
  - la ficha del paciente ya no deja rechazos sin capturar (H27).
- **Despliegue del 17/10, con evidencia:**
  - respaldo lógico verificado;
  - 28 migraciones aplicadas con marcadores 32/32;
  - 10 Edge Functions desplegadas con CORS y JWT;
  - frontend en Vercel idéntico byte a byte al build local.

---

## 5. ¿Qué tan efectiva es esta versión?

### Para el uso clínico diario: **alta (8/10 aprox.)**
- **Fortalezas:**
  - Cubre el flujo completo de un consultorio: agenda, consulta, expediente, odontograma, receta, cobro y corte de caja.
  - La seguridad está en la base de datos y no solo en la pantalla.
  - Funciona sin Internet.
  - Las pruebas automatizadas son amplias (más de 2000).
  - Es más completa que muchas alternativas de su rango de precio.
- **Debilidades:**
  - Falta probarla en uso real prolongado: la conexión intermitente y el uso en teléfono y tablet no se han medido.
  - El flujo autenticado en producción solo se ha probado con una clínica sintética (los pasos 3–7 de las pruebas de humo siguen pendientes).
  - Faltan funciones que los clientes suelen pedir: recordatorios por WhatsApp, inventario, horarios de atención configurables y reportes en PDF.

### Para venderla: **media (6–7/10 hoy)**
El producto técnico está casi listo; lo que falta es sobre todo **negocio y legal**:
1. **Revisión legal.** Los documentos legales están vigentes, pero hay que confirmar por escrito con el abogado las 15 decisiones de `docs/PENDIENTES_LEGALES.md`: responsable y encargado del tratamiento, NOM-004 y NOM-024, plazos ARCO, términos y condiciones (SLA, reembolsos) y acuerdo de tratamiento de datos.
2. **Cobro de suscripciones.**
   - El **cobro automático con Stripe ya está hecho y probado** (migración 114). Falta crear la cuenta de Stripe, desplegarlo y probarlo de punta a punta en modo de prueba.
   - La **facturación electrónica (CFDI)** sigue pendiente: mientras tanto se factura aparte. Es la segunda etapa.
3. **Respaldos.** El plan actual de Supabase no tiene respaldos de plataforma (sin PITR) y Storage no está respaldado. No se puede prometer «datos siempre respaldados» hasta contratar el plan adecuado o automatizar los respaldos.
4. **Soporte y correo.** Hay que definir el canal y los tiempos de soporte y configurar el correo transaccional del formulario de contacto.
5. **Piloto.** Conviene probar con 1 o 2 clínicas reales antes de abrir la venta.

**Recomendación:** lanzar como **piloto pagado o con descuento** con 1 a 3 clínicas mientras se cierran los puntos legales, de cobro y de respaldos. Los precios (de $599 a $3,999 MXN al mes) son competitivos en México para lo que incluye.

---

## 6. Pendientes inmediatos

- Subir los commits `bbe7384` (113) y `68c386e` (114) a GitHub. Requiere autorización: al hacerlo, Vercel publica de nuevo.
- Cobro con Stripe:
  - crear la cuenta de Stripe;
  - aplicar la migración 114 en producción;
  - desplegar las 3 funciones;
  - capturar los precios de Stripe;
  - hacer la prueba de punta a punta en modo de prueba.
- Respaldos automáticos diarios (base de datos y archivos) y facturación CFDI.
- Terminar los pasos 3–7 de las pruebas de humo en la clínica «Oscar» y, después, B8 (cierre de la ventana).
- Identificar el error 403 que aparece en la consola (se necesita la URL).
- Que el abogado configure las decisiones de conservación D2–D4.
- No subir `supabase/.temp/` (archivo local de la CLI de Supabase).
