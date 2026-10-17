# SIRO — Lista de comprobación en el NAVEGADOR (la ejecutas tú)

Nada de esto se pudo ejecutar localmente: la interfaz solo se probó con Vitest (componentes renderizados sin navegador). Cada fila queda `PENDIENTE DE EJECUCIÓN MANUAL` hasta que la marques. Usa un proyecto de **desarrollo** con **datos ficticios** y dos clínicas (A y B) con los usuarios de `FASE8_VALIDACION_MANUAL_SUPABASE.md` §B.1. Navegador recomendado para depurar: Chrome/Edge con DevTools. No pegues tokens ni contraseñas en capturas.

**Cómo registrar:** `☐` → `✔` (OK) o `✘` (falla, con una nota: qué viste y qué esperabas).

## 0. Preparación
☐ `cd frontend && npm ci && npm run build && npm run preview` (el Service Worker solo funciona con el build, no con `npm run dev`), apuntando `frontend/.env` a tu proyecto de DESARROLLO (no lo subas ni lo copies a ningún otro sitio).
☐ DevTools → Application → Service Workers: aparece `sw.js` «activated and running». Application → Cache Storage: una caché `siro-shell-<build>` con el HTML, JS, CSS y `models/odontograma.glb`.
☐ DevTools → Application → IndexedDB: tras iniciar sesión aparecen las bases de la app (hasta 10: caché de lectura, caché de autenticación, réplicas de pacientes/citas/expedientes, índice de pacientes, pacientes sin conexión, mapeo de ids, PIN y la cola de operaciones).

## 1. Acceso y roles
☐ Login como propietario A, odontólogo A, recepción A y asistente A: cada uno ve solo el menú permitido a su rol.
☐ Login con contraseña incorrecta: mensaje claro, sin detalles técnicos. Login como usuario de una clínica suspendida: se explica.
☐ Cerrar sesión: vuelve al login; las pestañas abiertas pierden acceso.
☐ Dos pestañas, dos usuarios distintos del mismo navegador: no se mezclan datos (comprobar tras recargar).

## 2. Aislamiento multi-tenant (clínicas A y B)
☐ Como propietario A: pegar en la barra de direcciones la URL de un paciente de B (`/pacientes/<id de B>`): no se muestra nada (error o vacío), nunca datos de B.
☐ Buscar por el nombre de un paciente de B: no aparece. Agenda, tratamientos, pagos y notas: solo los de A.
☐ Con una cita de B en la pestaña Network: ninguna respuesta de la API incluye datos de B.
☐ Logo: cada propietario ve el suyo y no puede reemplazar el de la otra clínica.

## 3. Pacientes y expediente
☐ Crear, editar y buscar un paciente (CURP duplicado → mensaje claro). Ver el expediente.
☐ Signos vitales: guardar con la sesión propia (no deben poder atribuirse a otra persona).
☐ Documentos y fotografías: subir uno de cada y verlos; descargar un documento. Recepción y asistente según su permiso.

## 4. Agenda y fila de espera
☐ Crear una cita; confirmar; poner en espera; iniciar consulta; cancelar; marcar «No asistió» (ninguna de estas acciones crea notas).
☐ En el panel de una cita **en consulta**: NO hay botón «Completar»; «Finalizar consulta» abre la consulta.
☐ Fila de espera: con DOS pacientes en espera del mismo odontólogo, al **finalizar** la consulta del primero pasa a consulta el siguiente **solo** si es de la misma sucursal y sin sillón distinto; si hay otra consulta en curso del mismo odontólogo, **no** avanza.
☐ Cancelar al paciente en espera **justo** antes de finalizar la consulta anterior: no debe «revivir» como en consulta.
☐ Doble clic rápido en «Iniciar consulta», «En espera» y «Finalizar»: una sola acción.

## 5. Consulta clínica
☐ Abrir la consulta: motivo, signos vitales, odontograma, diagnóstico (CIE-10), tratamiento, indicaciones, seguimiento. «Guardar y finalizar»: la cita queda **completada** y la nota guardada; repetirlo (doble clic) no crea una segunda nota.
☐ Finalizar con un seguimiento en horario ocupado: mensaje claro y la consulta NO queda completada sin nota.
☐ Cita completada sin nota (de versiones anteriores): aparece en «Consultas por completar» de Mi día y en el panel de la cita; «Completar consulta» guarda la nota sin modificar la cita; con otra nota ya existente avisa que no crea una segunda.

## 6. Odontograma 2D/3D y periodontograma
☐ Odontograma 2D: marcar piezas, caras y condiciones; guardar; recargar y verificar.
☐ Odontograma 3D: carga el modelo (`odontograma.glb`), rota/zoom, seleccionar una pieza y marcarla. **Sin conexión** (ver §10) el modelo debe seguir cargando desde la caché del Service Worker.
☐ Periodontograma: registrar profundidad de sondaje y sangrado en varios sitios; guardar; historial.

## 7. Notas, recetas y pagos
☐ Notas: no existe botón de editar ni borrar una nota guardada; una corrección se hace con una nota nueva.
☐ Receta: crear e imprimir con el logo y los datos del odontólogo (cédula/firma). El logo debe verse (comprueba la decisión 096).
☐ Pagos: registrar un pago a un tratamiento propio; intentar uno a nombre de otra persona desde la API no es posible desde la interfaz (la base lo bloquea). Un pago registrado no se edita, solo se anula. Sin conexión: los pagos exigen internet y lo dicen.

## 8. Corrección de citas completadas (migración 094)
☐ Propietario: en una cita completada aparece «Corregir consulta» con las opciones «Reabrir», «Cancelada», «No asistió»; el botón de registrar sigue **desactivado** hasta escribir un motivo de al menos 10 caracteres.
☐ Odontólogo responsable: solo ve «Reabrir». Odontólogo de otro paciente, recepción y asistente: **no ven** «Corregir consulta».
☐ Tras corregir: la agenda se recarga, el panel se cierra y la nota clínica sigue ahí sin cambios. Doble clic: una sola corrección. Reabrir y volver a finalizar crea una **segunda** nota; la primera no cambia.
☐ Sin conexión: corregir muestra que requiere conexión y no encola nada.

## 9. Formulario de contacto público
☐ Enviar 6 mensajes seguidos con el mismo correo: el 6.º muestra «Se han recibido demasiados mensajes. Inténtalo de nuevo más tarde.» (límite de la migración 102) y no un error técnico.
☐ Firmar una receta, un consentimiento y una referencia como el odontólogo que está en sesión: funciona. (La base rechaza firmar como otro.)
☐ Superadministrador: abrir «Ver clínica» deja un evento `ver_clinica` en la auditoría de esa clínica (lo ve su propietario).
☐ Consola del navegador (pestaña Console): no hay avisos `Content-Security-Policy-Report-Only` de recursos propios de la app; si los hay, anótalos (la CSP aún NO se impone).
☐ Escribir 5,001 caracteres: el campo no deja pasar de 5,000. Enviar un mensaje normal: confirmación y llega UN correo (si configuraste Resend en desarrollo).

## 10. Sin conexión y sincronización (DevTools → Network → «Offline»)
☐ Con la sesión iniciada y datos cargados, activar «Offline» y recargar: la app abre desde el Service Worker (sin pantalla de error del navegador).
☐ Sin conexión: crear una nota o una cita y un paciente; ver el aviso de datos pendientes; las acciones que requieren servidor (corregir citas, pagos, recuperar consulta pendiente) lo explican.
☐ Volver a «Online»: la cola se sincroniza sola; los cambios aparecen una sola vez (sin duplicados) y las notas conservan su fecha de captura.
☐ Cerrar sesión con cambios pendientes: la app lo **impide** y explica por qué; sin conexión tampoco deja cerrar sesión.
☐ Provocar un conflicto (p. ej. cambiar el odontólogo de una cita a uno de otra clínica desde la API mientras hay una operación pendiente): la operación pasa a «conflicto» con el mensaje del servidor y **no se reintenta indefinidamente** (en IndexedDB → cola: el estado queda `conflicto`).
☐ Dispositivo compartido: cerrar sesión (sin pendientes) y entrar con OTRO usuario: no ve datos del anterior (en IndexedDB solo debe quedar la cola de operaciones del anterior si tenía algo sin subir).
☐ Reloj del equipo adelantado unas horas (cambia la hora del sistema): una consulta capturada sin conexión se sincroniza igual; la nota queda con fecha acotada a «ahora».

## 11. Actualización de la aplicación
☐ Desplegar una versión nueva en tu servidor de pruebas: la pestaña abierta sigue funcionando y la nueva versión se activa al recargar; no queda pantalla en blanco ni «Unexpected token <».

## 12. Resultado
Entrega las filas con `✘` (con capturas sin tokens). **Si todas están en ✔ esto sigue sin ser una declaración de «listo para producción»**: faltan las validaciones de `FASE8_VALIDACION_MANUAL_SUPABASE.md`, las decisiones humanas y la autorización.
