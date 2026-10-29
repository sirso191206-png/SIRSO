# SIRO — Decisiones y configuración que faltan por proporcionar

Nada de lo siguiente se ha inventado: donde falta un dato legal, clínico o de negocio, el sistema se queda en el estado **más seguro** y espera tu decisión. Ninguna política incompleta habilita una eliminación destructiva.

## A. Decisiones que solo tú (con asesoría) puedes tomar
| Decisión | Estado por omisión (seguro) | Cómo se configura | Impacto y recomendación |
|---|---|---|---|
| **Conservación del expediente clínico** (años) — clave `retencion_expediente_anios` | Sin valor: la eliminación de una clínica con datos clínicos queda **BLOQUEADA** | `supabase/decisiones/aplicar_politicas_conservacion.sql` (valida el valor, no escribe nada con datos inválidos) | La NOM-004-SSA3-2012 (mínimo 5 años) es solo una referencia; el plazo aplicable lo define tu asesoría legal y sanitaria. Un valor demasiado corto expone a un borrado prematuro; uno largo retiene datos de clientes dados de baja |
| **Conservación fiscal** — `retencion_fiscal_anios` | Sin valor: bloquea la eliminación de clínicas con pagos | el mismo script | Lo define tu contador; no se asume ningún plazo |
| **Conservación contractual** — `retencion_contractual_anios` | Sin valor | el mismo script | Lo define tu abogado |
| **Límite de retrofecha de las notas** (horas) — `nota_retrofecha_max_horas` | Sin valor: sin límite (la fecha del evento se conserva, pero la futura se acota a «ahora» y la fecha de recepción la fija siempre el servidor) | `aplicar_limite_retrofecha.sql` / `quitar_limite_retrofecha.sql` | Un límite corto rechaza consultas legítimas capturadas sin conexión; se rechaza (no se corrige) y la cola conserva la nota como conflicto. Recomendación: define un límite solo con validación clínica |
| **Quién corrige consultas completadas** | Implementado (migración 094): propietario corrige y reabre; el odontólogo responsable solo reabre; recepción y asistente no; motivo obligatorio | Cambiarlo exige una migración nueva | Más estricto = solo propietario; más amplio = menos trazabilidad |
| **Quién firma en nombre de otro odontólogo** | Implementado (migración 101): solo el propietario, y a nombre de un odontólogo de su clínica | Cambiarlo exige una migración nueva | Si no quieres que nadie firme por otro, exige siempre `dentista_id = quien guarda` |
| **Fila de espera** | Conservador: avanza solo con el mismo odontólogo, la misma sucursal y sin segunda consulta simultánea | Código del frontend/base | Un avance más agresivo podría asignar al profesional equivocado; validar en una clínica |
| **Cambio obligatorio de la contraseña temporal** | **Implementado** (migración 103, `CAMBIO_PASSWORD_OBLIGATORIO.md`); falta validarlo en Supabase real. Los usuarios anteriores a la 103 no están marcados | Para marcar a un usuario existente: `update usuarios set debe_cambiar_password = true where id = '<id>'` con credenciales de servidor | Decide si marcas a los usuarios existentes que aún usan una contraseña temporal |
| **Documentos legales** (aviso de privacidad, términos, cookies, seguridad, conservación, acuerdo de tratamiento) | Versión 2 en borrador (migración 105), **PENDIENTE DE ABOGADO** | Panel `/admin/legal`; matriz y pendientes en `MATRIZ_REVISION_JURIDICA.md` y `PENDIENTES_LEGALES.md` | Requieren revisión jurídica y los datos corporativos antes de publicar; no se declara cumplimiento normativo |
| **Plazos de conservación por categoría** (y su aprobación) | Todos SIN valor y en `PENDIENTE_DE_ABOGADO`; ninguna supresión posible | `fn_establecer_plazo_conservacion` (ver `POLITICA_CONSERVACION_DATOS.md`); estado en `supabase/verificacion/conservacion_estado_solo_lectura.sql` | Decisión jurídica; también el bloqueo como estado técnico, la limpieza de Storage por paciente y la anonimización, aún no implementados |

## B. Valores técnicos ajustables (ya tienen un valor por omisión razonable)
| Clave en `plataforma_config` | Por omisión | Qué controla |
|---|---|---|
| `contacto_max_por_correo_hora` | 5 | mensajes por hora y por correo en el formulario público |
| `contacto_max_global_hora` | 100 | mensajes por hora en total (si se alcanza, bloquea a cualquiera: ver riesgo en el informe) |
Un valor inválido (texto, 0) se ignora y rige el de por omisión. Los límites de tamaño del formulario (nombre 120, correo 254, mensaje 5,000) están en la migración 099; cambiarlos exige otra migración.

## C. Secretos y configuración del entorno (los proporcionas al instalar)
`RESEND_API_KEY`, `CORREO_SOPORTE`, `CORS_ALLOWED_ORIGINS` (tu dominio), `SIS_CIFRADO_LLAVE_B64` (solo con cifrado SIS), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Detalle en `INSTALACION_COMPLETA.md` §3. Además: dominio y «Site URL» de Supabase Auth, remitente de correo (hoy `onboarding@resend.dev`, de pruebas: cámbialo por un dominio propio verificado en Resend antes de producción), y la CLUES de cada clínica si usan el reporte SIS.

## D. Protecciones que dependen de tu infraestructura (no se pueden resolver en el código)
* **CAPTCHA o límite por IP** para el formulario público (la base de datos no conoce la IP): configúralo en Supabase, Vercel o un WAF. La migración 102 limita por correo y global, y un atacante que cambie de correo puede agotar el límite global y bloquear temporalmente a personas legítimas.
* **CSP:** impuesta desde el 28/10/2026 (`Content-Security-Policy` en `frontend/vercel.json`), validada con el build real. Si un recurso nuevo de otro dominio no carga, el navegador lo indica en la consola con «Refused to…»: agrégalo a la directiva correspondiente.
* **Rotación de la llave SIS y de la clave de Resend:** define tu calendario.
