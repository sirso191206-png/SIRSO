# SIRO — Checklist de comercialización

Leyenda: ✅ existe y está probado automáticamente · ⚠️ existe pero falta validar con personas o en entorno real · ❌ no existe (**no se debe ofrecer**).

## Lo que SIRO ofrece hoy
| Capacidad | Estado |
|---|---|
| Pacientes, ficha y expediente clínico | ✅ |
| Odontograma 2D y 3D, hoja clínica, periodontograma | ✅ (3D y periodontograma según plan) |
| Agenda (día/semana/mes), citas, urgencias, lista de espera | ✅ |
| Consulta: signos vitales, hallazgos, diagnóstico CIE-10, tratamiento, nota, próxima cita, receta | ✅ (nota opcional) |
| Tratamientos, presupuesto imprimible | ✅ |
| Recetas y consentimientos con firma en pantalla | ✅ |
| Fotografías y documentos del paciente (topes y tipos validados) | ✅ |
| Pagos (anticipos, reembolsos, anulación), saldos, **corte de caja** | ✅ |
| Dashboard y reportes con filtros; exportación CSV | ✅ |
| Auditoría para la clínica | ✅ |
| Usuarios y roles (owner, dentista, asistente, recepción), asignación de pacientes | ✅ |
| Varias sucursales (según plan) | ✅ |
| Funcionamiento **sin Internet** y sincronización automática | ✅ en pruebas · ⚠️ falta probarlo en uso real prolongado |
| Planes, suscripciones, límites, avisos de vencimiento | ✅ |
| Aislamiento entre clínicas | ✅ (pruebas locales; ⚠️ falta en Supabase real) |
| Derechos ARCO e incidentes (pantallas) | ✅ pantallas · ⚠️ falta el proceso humano |
| Centro de ayuda y guía de primeros pasos | ✅ |

## Lo que NO existe (no anunciar, no poner en planes, no prometer)
- ❌ WhatsApp (ninguna integración; un teléfono guardado en el paciente no es una integración).
- ❌ Inventario.
- ❌ Caja con apertura, egresos y cierre (solo existe el **corte de caja** a partir de los pagos).
- ❌ Horarios de atención configurables.
- ❌ Cobro automático de suscripciones, facturación electrónica.
- ❌ Reportes en PDF (solo CSV).
- ❌ Borrado/anonimización de pacientes y de archivos desde la aplicación.
- ❌ Aplicación móvil nativa (es web; funciona en teléfono y tablet, ⚠️ sin medir el responsive).

## Antes de vender
- [ ] ⚠️ **Documentos legales en versión definitiva** (hoy los 8 son borradores) — ver `PRIVACIDAD_REVISION.md`.
- [ ] Contrato de servicio y acuerdo de tratamiento de datos firmables.
- [ ] Planes y precios: **se configuran desde el panel de superadmin** (no están en el código). Revisar nombres, precios, límites y funcionalidades de cada plan antes de publicarlos.
- [ ] Definir el soporte: canal, horario y tiempos de respuesta. ⚠️ El formulario de contacto necesita el correo transaccional configurado (`RESEND_API_KEY`) y probarse.
- [ ] Definir la política de respaldos que se promete al cliente (ver `BACKUPS_Y_RECUPERACION.md`) **solo después** de conocer lo que realmente ofrece el plan de Supabase contratado.
- [ ] Guion de alta de una clínica nueva: el superadmin crea la clínica con su plan (un propietario no puede), el propietario entra y sigue la guía de primeros pasos.
- [ ] Capacitación: usar el centro de ayuda como base; grabar un recorrido corto por rol.
- [ ] Probar con 1–2 clínicas piloto antes de abrir la venta, con una lista de incidencias.

## Mensajes que NO deben usarse sin validación
- "Cumple con la ley/norma …" (no se ha validado).
- "Tus datos están siempre respaldados" (depende de la configuración real de Supabase; Storage no está respaldado).
- "Funciona 100 % sin Internet": funciona con lo preparado ese día; hay que abrir SIRO con conexión al menos una vez al día.
