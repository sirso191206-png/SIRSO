# SIRO — Checklist de puesta en producción

Leyenda: ✅ verificado con pruebas automáticas (PostgreSQL local / Vitest) · ⚠️ **PENDIENTE DE VALIDACIÓN REAL** (hay que hacerlo en Supabase real o en un navegador) · ❌ no existe todavía.

## 1. Base de datos
- [ ] Respaldo de la base **antes** de aplicar nada. Anotar fecha y quién.
- [ ] Aplicar las migraciones en orden. Las nuevas son **074, 075, 076, 077, 078, 079, 080, 081, 082, 083, 084** (cada una avisa si falta su requisito).
- [ ] Si aún no estaba: **074 y 077** de inmediato (hotfix de seguridad); **081** de inmediato (fuga de auditoría entre clínicas).
- [ ] Antes de la 076, buscar clínicas sin suscripción (consulta en `GUIA_PLANES.md` §13) y regularizarlas desde el panel de superadmin.
- [ ] Tras aplicar: ejecutar las verificaciones del SQL Editor (`GUIA_SESIONES.md` §Despliegue) y comprobar que `select es_super_admin ...` solo lista a personal de SIRO.
- ✅ Suites SQL contra PostgreSQL local: planes 13 + 83, hotfix 13, sesiones 28, sucursales 10, aislamiento A→B 36, auditoría 17, 082: 36, 083: 11, 084: 25 (272 en total).
- [ ] 084: cada propietario que atiende pacientes activa "Atiendo pacientes como dentista" en Datos profesionales (nadie queda marcado por omisión).
- ⚠️ Esas mismas pruebas **en un Supabase real** (staging) antes de producción. En especial: que el rol de las funciones pueda leer y borrar en `auth.sessions` (078) y crear la política sobre `storage.objects` (082).
- ⚠️ Decidir y encender el control estricto de sesiones (`plataforma_config.control_sesiones_estricto`) **después** de verificar `GUIA_SESIONES.md`.

## 2. Supabase (configuración)
- [ ] Redirect URLs de Auth: incluir `https://<tu-dominio>/restablecer-password`.
- [ ] SMTP propio configurado para los correos de recuperación de contraseña. ⚠️ **Probar el flujo completo** (solicitar → recibir → cambiar; enlace caducado; enlace usado; contraseña inválida).
- [ ] Respaldos: llenar la tabla de `BACKUPS_Y_RECUPERACION.md` con los valores reales y definir el respaldo de Storage. ❌ Hoy no hay respaldo de archivos definido.
- [ ] Hacer una **restauración de prueba en un proyecto de pruebas** (`prueba_recuperacion.sh` ✅ pasa en local con 0 diferencias; falta en Supabase real).
- [ ] Buckets: confirmar topes (fotos 10 MB, documentos 20 MB, logos 2 MB) y tipos permitidos. ⚠️ Probar subir un archivo de cada tipo (incluido HEIC de iPhone) y uno no permitido.

## 3. Edge Functions
- ⚠️ **Nunca se han ejecutado en un Supabase real.** Desplegar en staging y probar cada una (autenticación, autorización, errores): `admin-crear-clinica`, `admin-actualizar-clinica`, `admin-listar-clinicas`, `admin-ver-clinica`, `admin-eliminar-clinica`, `crear-usuario`, `eliminar-usuario`, `cambiar-password`, `enviar-contacto`.
- [ ] Variables/secrets: `SUPABASE_SERVICE_ROLE_KEY` solo en las funciones (✅ no aparece en el frontend, el bundle ni el repositorio), `RESEND_API_KEY` si se usa el formulario de contacto.
- [ ] Volver a desplegar `admin-crear-clinica`, `admin-actualizar-clinica` y `crear-usuario` (cambiaron).

## 4. Frontend
- [ ] `cd frontend && npm ci && npm run build` y subir `dist/`.
- ✅ `npx tsc --noEmit` sin errores · ✅ `npm run lint`: 0 errores (17 avisos de limpieza) · ✅ 1,384 pruebas de Vitest (115 archivos) · ✅ build correcto (paquete inicial 575 kB, 48 archivos precacheados para uso sin conexión).
- ⚠️ `react-router-dom` se actualizó a la 7.x: **recorrer la navegación completa en un navegador real** (login, menú, rutas por rol, atrás/adelante, recargar en una subpágina, pantalla de "no tienes acceso").
- ⚠️ Service Worker: tras el despliegue, abrir con la versión anterior en caché y comprobar que actualiza (hay una pantalla de recuperación si un archivo ya no existe).
- [ ] `frontend/.env` no se sube al repositorio ni a los ZIP (solo contiene la URL y la llave pública).

## 4b. Service worker y despliegue (cambiaron en la auditoría de estabilidad — ver `ESTABILIDAD_Y_ERRORES_DE_CONSOLA.md`)
- [ ] Desplegar también `public/sw.js` y `vercel.json` (este último: los archivos inexistentes ahora dan 404 real en lugar de `index.html`).
- ⚠️ Tras el despliegue, abrir SIRO en un navegador que ya lo tenía instalado y comprobar que **actualiza** el service worker (DevTools → Application → Service Workers).
- ⚠️ Validar en **Vercel real** que `vercel.json` se comporta como se espera (la expresión está probada, el despliegue no): `/pacientes/123` abre la app; `/assets/algo-inexistente.js` da 404.
- ✅ Verificado en Chromium real (build de producción): un recurso de otro dominio que falla ya no genera "503 Sin conexión"; un archivo inexistente da 404 y no se cachea; el modelo 3D y las rutas se sirven bien.
- ⚠️ El error `startTime`/`reportAllChanges` de la consola **no es de SIRO** (probable extensión del navegador o barra de Vercel): identificar la fuente con la primera línea de la traza o en incógnito.
- ✅ Odontograma 3D medido en navegador real (contextos, listeners, heap, pérdida y restauración de contexto): `frontend/verificacion-webgl/`. Repetir si se toca el 3D.
- [ ] `npm ci` (cambió `package.json`: `react-test-renderer` como dependencia de desarrollo).

## 5. Dependencias (`npm audit`)
- ✅ 14 hallazgos restantes (de 16), **ninguno en dependencias que viajan al navegador**. Son herramientas de desarrollo: `vite`, `vitest`, `tailwindcss` y su cadena (el arreglo exige saltos de versión mayor).
- [ ] Planear la actualización de esas herramientas en un cambio aparte, con su propia revisión.

## 6. Validación manual (hacer con datos de prueba, en staging)
- [ ] Dos clínicas, un usuario de cada rol: intentar entrar a pantallas ajenas por URL y comprobar el aviso.
- [ ] Crear paciente en línea → editarlo sin conexión → reconectar → una sola ficha, sin duplicados (CURP).
- [ ] Intentar un CURP repetido: debe quedar un conflicto con mensaje claro.
- [ ] Llegar al límite de pacientes/usuarios/sucursales de un plan de prueba: el botón desaparece y la base rechaza el alta.
- [ ] Bajar un plan con más datos que el nuevo límite: no se borra nada, se puede consultar, no se puede dar de alta.
- [ ] Cerrar una sesión de otro dispositivo (y con el control estricto encendido, comprobar el corte inmediato).
- [ ] Vencimiento: poner `fecha_fin` en el pasado y ver los avisos (gracia y vencida); el uso no se bloquea.
- [ ] Subir fotos/documentos; llegar al tope de almacenamiento de un plan de prueba.
- [ ] Reportes: filtros, exportación CSV y que la exportación aparezca en la auditoría.
- [ ] Auditoría: un owner solo ve su clínica.
- [ ] Probar en teléfono y tablet: ⚠️ **responsive no se ha medido** (menú, tablas, modales, odontograma, dashboard).
- [ ] Rendimiento con 500, 2,000 y 5,000 pacientes y expedientes con muchas fotos: ⚠️ **no medido**. Las consultas del dashboard ya leen por lotes (no se truncan en 1,000 filas).

## 7. Después del lanzamiento
- [ ] Vigilar errores del navegador y de Supabase la primera semana.
- [ ] Revisar `plataforma_config` y la lista de superadmins mensualmente.
- [ ] Repetir la restauración de prueba cada trimestre.
