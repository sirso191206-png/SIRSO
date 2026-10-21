# SIRO V3 — Guía para un revisor externo

Hola. Te pedimos una **revisión independiente** de SIRO, un sistema web para consultorios y clínicas dentales en México: expediente clínico, odontograma 2D y 3D, agenda, consulta, recetas, cobros, multisucursal y planes de suscripción.

Queremos tu opinión honesta sobre tres preguntas:
1. ¿Funciona bien para el trabajo diario de una clínica?
2. ¿Es seguro con los datos de los pacientes?
3. ¿Está listo para venderse? Si no, ¿qué falta?

## Reglas de la revisión (importante)
- **No uses datos reales de pacientes.** Usa solo la clínica de prueba y los usuarios que te demos.
- **No elimines clínicas** ni cambies planes de clínicas reales.
- **No compartas ni copies credenciales.** Las tuyas te llegarán por un canal privado.
- Anota cada problema con: **qué hiciste**, **qué esperabas**, **qué pasó** y una **captura de pantalla** (y la URL si aparece un error).

## Qué necesitas
- Acceso a la aplicación: `https://sirso.vercel.app`, con un usuario de cada rol: **owner, dentista, asistente y recepción**.
- Una computadora y, si es posible, un teléfono o una tablet.
- Para la revisión técnica (opcional): acceso de lectura al repositorio. La documentación está en `docs/`. Empieza por `README.md`, `docs/INFORME_ESTADO_SIRO_V3.md` y `docs/ROLES_Y_PERMISOS.md`.

## Parte A — Uso clínico (1–2 horas)
Califica cada punto de 1 a 5 y agrega comentarios.

| # | Prueba | Rol | Calificación / comentario |
|---|---|---|---|
| A1 | Entrar por primera vez. ¿Pide cambiar la contraseña y aceptar los documentos legales? | owner | |
| A2 | Crear un paciente con CURP; llenar sus antecedentes, alergias y medicamentos | recepción / dentista | |
| A3 | Agendar una cita, moverla y cancelarla; registrar una urgencia; usar la lista de espera | recepción | |
| A4 | Hacer una consulta completa (signos vitales, diagnóstico CIE-10, odontograma, tratamiento, nota, receta, próxima cita) y finalizarla | dentista | |
| A5 | Usar el odontograma 2D y el 3D, y el periodontograma. ¿Son claros y rápidos? | dentista | |
| A6 | Firmar una receta y un consentimiento en pantalla; imprimirlos | dentista | |
| A7 | Subir una fotografía o radiografía y un documento | asistente / dentista | |
| A8 | Registrar un anticipo, un pago y un reembolso; hacer el corte de caja | recepción | |
| A9 | Revisar el dashboard y exportar un reporte a CSV | owner | |
| A10 | Crear un usuario y asignarle pacientes. ¿Cada rol ve solo lo que le corresponde? | owner | |
| A11 | Desconectar Internet, seguir trabajando (agenda, consulta) y reconectar. ¿Se sincroniza bien? | dentista | |
| A12 | Usar SIRO desde un teléfono o una tablet. ¿Se ve y funciona bien? | cualquiera | |
| A13 | ¿El centro de ayuda y la guía de primeros pasos son suficientes para aprender sin capacitación? | owner | |
| A14 | Si el pago en línea está activado: en Configuración → *Pago en línea*, paga un plan con la tarjeta de prueba `4242 4242 4242 4242` (cualquier fecha futura y CVC). ¿Se actualizan el plan y el vencimiento? ¿Funcionan «Administrar pago» y el historial? | owner | |

## Parte B — Seguridad y privacidad
| # | Prueba | Resultado |
|---|---|---|
| B1 | Con el rol de recepción o asistente, intenta abrir pantallas de administración, auditoría o expedientes no asignados escribiendo la URL directamente. ¿Te bloquea? | |
| B2 | Sin iniciar sesión, intenta entrar a `/pacientes`. ¿Te manda a `/login`? | |
| B3 | ¿Queda registro en la auditoría de lo que hiciste en la parte A? | |
| B4 | Revisa el Centro Legal (`/legal`): ¿los documentos son claros, completos y coherentes con lo que hace el sistema? | |
| B5 | Prueba el formulario de derechos ARCO y el de contacto | |
| B6 | (Técnico, opcional) Revisa las políticas RLS en `supabase/migrations` y las Edge Functions en `supabase/functions`. ¿Hay algún acceso entre clínicas posible? | |

## Parte C — Comercialización
Responde con tu opinión:
1. **Precios.** Los planes de origen son Esencial a $599 MXN/mes, Profesional a $999, Clínica a $1,799 y Empresarial a $3,999. ¿Son adecuados para el mercado? ¿Pagarías por alguno?
2. **Comparación.** ¿Cómo se compara SIRO con otros sistemas dentales que conozcas (Dentalink, Dentrix, Odontosys, etc.)?
3. **Funciones que faltan.** SIRO ya cobra la suscripción con tarjeta de forma automática (Stripe), pero hoy **no** tiene: recordatorios por WhatsApp, inventario, horarios de atención configurables, reportes en PDF ni facturación electrónica (CFDI). ¿Cuáles son **imprescindibles** para vender?
4. **Lo que más y lo que menos te gustó.**
5. **Veredicto.** Elige uno: **listo para vender**, **listo para piloto con 1–3 clínicas** o **necesita más trabajo**. Explica por qué.

## Parte D — Revisión legal (solo si eres abogado o asesor en protección de datos)
Revisa `docs/PENDIENTES_LEGALES.md` (15 decisiones), `docs/MATRIZ_REVISION_JURIDICA.md` y `docs/POLITICA_CONSERVACION_DATOS.md`. Necesitamos tu opinión, sobre todo, en estos puntos:
- **Responsable y encargado del tratamiento:** quién es responsable y quién encargado de los datos de los pacientes (la clínica o SIRO).
- **Normas de expediente:** lo que exigen la NOM-004-SSA3-2012 (expediente clínico) y la NOM-024-SSA3-2012 (sistemas de expediente electrónico).
- **Plazos de conservación:**
  - clínico (5 años desde el último acto médico);
  - fiscal;
  - contractual.
  Hacen falta para desbloquear la eliminación de clínicas.
- **Términos comerciales y acuerdo de tratamiento:** SLA, reembolsos, suspensión, incidentes y subencargados (Supabase, Vercel).

## Entrega
Devuélvenos este documento con las tablas llenas, las capturas y tu veredicto final. Gracias.
