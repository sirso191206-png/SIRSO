# SIRO — Informe final de auditoría y cierre

**Esto NO declara que SIRO esté listo para producción.** Declara qué se corrigió y se probó, qué solo se revisó, qué no se pudo validar sin acceso a tus servicios y qué sigue abierto. Los números exactos están en `RESULTADOS_DE_PRUEBAS.md`.

## 1. Material y consolidación
* Material único: los ZIP entregados. Base consolidada = `SIRSO-completo-fase7.zip` + `SIRSO-fase8-correcciones.zip` (el incremental reemplazó 12 archivos y añadió 16; no se sobrescribió ninguna corrección con versiones antiguas). No existe un ZIP «fase 9»: no se asumió ninguno. Sobre esa base se aplicó el trabajo de esta fase.
* Migraciones: 107 archivos (001–106; el prefijo 064 está repetido desde el origen). Frontend y funciones coherentes con el esquema: lo comprueban las baterías SQL, PostgREST (87), las guardias de códigos de error entre migraciones y frontend, y las pruebas de las funciones.
* No quedan marcadores temporales (TODO/FIXME/HACK) en el código fuente. Se retiraron del paquete: los metadatos de enlace de la CLI de Supabase (`.temp`, que contenían el ref real, el nombre y la organización del proyecto), un `package-lock.json` vacío de la raíz, dos imágenes sueltas sin uso, un `texto.js` duplicado y `supabase/propuestas` (ya son las migraciones 094–096). Los informes de fases anteriores están en `docs/historico/`, con un aviso de que pueden estar superados.

## 2. Defectos corregidos en esta fase (cada uno reproducido antes de corregirlo)
| # | Defecto | Corrección |
|---|---|---|
| 1 | **Auditoría falsificable**: cualquier usuario podía insertar eventos administrativos a su nombre; `anon` conservaba privilegios sobre la tabla | Migración 100: el navegador solo puede insertar `exportar`, `DATA_EXPORTED` y `cola_offline_descartada` (a nombre propio, propia clínica, detalle ≤ 20,000 bytes); se revocan los privilegios de `anon` y UPDATE/DELETE de `authenticated` |
| 2 | **Firma de documentos como otro odontólogo** (recetas, consentimientos, referencias médicas) dentro de la misma clínica | Migración 101: el firmante es quien está autenticado; solo el propietario puede registrar a nombre de otro odontólogo de su clínica |
| 3 | Formulario público sin límite de **frecuencia** en el servidor | Migración 102: 5 por hora y por correo, 100 por hora en total (configurables) |
| 4 | Edge Functions: errores internos devueltos crudos, entradas sin validar | Módulo `_shared/solicitud.ts` aplicado a 8 funciones: solo se devuelven mensajes escritos por nosotros; el resto, genérico con código `DB_xxxxx` |
| 5 | `admin-ver-clinica` entregaba a la plataforma datos personales de pacientes **sin dejar registro** | El acceso se registra (con la clínica) **antes** de entregar los datos; si no se puede registrar, no se entregan |
| 6 | `crear-usuario` revelaba si un correo existía en cualquier clínica; contraseñas temporales de ~44 bits | Respuesta idéntica ante cualquier fallo de alta (`ALTA_NO_DISPONIBLE`); 16 caracteres con ~93 bits |
| 7 | `sis-cifrar-archivo`: sin límite de tamaño ni validación de `base64`/nombre, errores que revelaban la longitud de la llave, aceptaba cuentas sin perfil | Validaciones, errores genéricos y exige perfil. **No se cambió el algoritmo ni el formato** (los impone la herramienta oficial); el 3DES propio coincide con OpenSSL en 300/300 casos aleatorios |
| 8 | `cambiar-password` sin validar el tipo; `admin-crear-clinica` aceptaba un número como nombre | Validación estricta de tipo y longitud |
| 9 | `sis-mapper.ts` con BOM y 202 apariciones de texto corrupto (38 líneas de mensajes que ve el usuario) | Corregido; guardia que revisa todo el código, migraciones y documentación |
| 10 | `vercel.json` sin cabeceras de seguridad | `nosniff`, anti-clickjacking, política de referencia y de permisos, `no-cache` del Service Worker; CSP solo en modo reporte |
Fases anteriores (resumen): finalización atómica e idempotente de consultas; notas clínicas inmutables y con tres fechas distintas; «Mi día» ya no completa citas sin consulta; autoría y referencias entre clínicas validadas en la base; eliminación recuperable de clínicas con conservación por categorías; privilegios mínimos (`TRUNCATE/REFERENCES/TRIGGER`); logos limitados a la propia clínica; corrección de citas completadas con matriz por rol; cola offline que conserva (no descarta ni reintenta sin fin) los rechazos de integridad; baja de usuarios que nunca deja una cuenta viva huérfana; formulario público con límite de tamaño y envío de correo ligado al mensaje guardado.

## 3. Auditoría por área solicitada
| Área | Qué se hizo | Estado |
|---|---|---|
| Autenticación y autorización | Autorización por rol verificada con roles reales de PostgreSQL y HTTP real (PostgREST); las 10 Edge Functions revisadas y las 10 con pruebas de comportamiento (siete en `edgeFuncionesAdminYUsuarios.test.js`, `eliminar-usuario`, `enviar-contacto` y `admin-eliminar-clinica` en Deno) | Verificado localmente. **Sesiones, JWT, expiración y revocación con Auth real: sin verificar** |
| Aislamiento multi-tenant | RLS en tablas; políticas de Storage; referencias entre clínicas validadas (citas, notas, tratamientos, pagos, recetas, consentimientos, fotografías); `SECURITY DEFINER` con `search_path` fijo (0 sin él); privilegios de `public/anon/authenticated/service_role` auditados | Verificado localmente. **Storage real sin verificar** |
| Auditoría y trazabilidad | Ver defectos 1 y 5; los eventos administrativos los escriben solo disparadores y Edge Functions. Un usuario aún puede registrar a su nombre eventos `exportar` falsos (no atribuibles a otro) | Corregido y probado; riesgo residual menor |
| Recetas y notas | Autor y firmante = quien guarda (101); referencias del mismo paciente y clínica; notas inmutables, sin duplicados por reintento, con evento clínico, fecha declarada y recepción del servidor distintos | Verificado localmente |
| Edge Functions | Ver §2; concurrencia e idempotencia en finalizar, completar, contacto y eliminación | Verificado localmente (simulación de Auth/Storage/clientes) |
| Formulario público | Tamaño (099) y frecuencia (102) en el servidor; correo ligado al mensaje guardado, una sola vez | Verificado; **CAPTCHA/límite por IP: pendiente de entorno** |
| Criptografía | Algoritmo y formato impuestos por la herramienta oficial; implementación contrastada con OpenSSL; la llave nunca llega al navegador ni se describe en errores. 3DES-ECB es débil por diseño pero obligatorio para ese formato | Verificado; la gestión de la llave en Supabase es tuya |

## 4. Flujos críticos
Verificados con pruebas automáticas (SQL, HTTP, Vitest): finalización y recuperación de consultas, corrección de citas completadas, notas, fila de espera, pagos, eliminación y limpieza de clínicas, auditoría, sincronización offline e idempotencia de la cola, aislamiento entre clínicas. **Solo revisados por código y componentes (sin navegador): odontograma 2D/3D, periodontograma, Service Worker en un navegador real, modo sin conexión de punta a punta, accesibilidad y regresiones visuales** → `CHECKLIST_NAVEGADOR.md`.

## 5. Dependencias
`npm audit --omit=dev`: **0 vulnerabilidades en producción**. 14 avisos en herramientas de desarrollo (vitest, vite, tailwind y sus dependencias; 2 críticos, 7 altos, 5 moderados) cuya corrección exige saltos de versión mayor (vite 8, vitest 5, tailwind 4) que no se aplicaron sin su propio ciclo de pruebas. Mitigación: no ejecutes `npm run dev` ni la interfaz de vitest en redes no confiables; compila y prueba en un entorno controlado. Planifica la actualización por separado.

## 6. Riesgos residuales y observaciones (ninguno se ocultó)
1. **Contraseña temporal:** ahora se obliga a cambiarla (migración 103); queda por validar en Supabase real y los usuarios anteriores a la 103 no están marcados (`CAMBIO_PASSWORD_OBLIGATORIO.md`).
2. `cambiar-password` no pide la contraseña actual (una sesión robada puede cambiarla; es el comportamiento habitual de Supabase).
3. El límite global del formulario público (100/hora) puede ser agotado por un atacante que cambie de correo, bloqueando temporalmente a personas legítimas; la defensa completa es un CAPTCHA o un límite por IP.
4. La CSP está solo en modo reporte hasta validarla en un navegador real.
5. `admin-listar-clinicas` hace dos consultas por clínica (escala linealmente con el número de clínicas; solo el superadministrador).
6. La cola offline conserva, a propósito, los cambios sin subir de quien cerró sesión en un equipo compartido (no se muestran a otro usuario, pero permanecen en IndexedDB); las operaciones antiguas sin dueño las puede reenviar cualquiera y, si la base las rechaza, quedan como conflicto.
7. El 3DES-ECB del reporte SIS es débil por diseño, pero el formato es obligatorio.
8. Migración 007: se modificó en una fase anterior para no depender de la 040; solo afecta a instalaciones nuevas. Si tu herramienta guardó un checksum del original verás una diferencia sin efecto de ejecución en una base ya migrada. No la re-ejecutes.
9. Las 14 advertencias de herramientas de desarrollo (§5).

## 7. Pendiente de entorno real (no se pudo probar aquí)
Auth, Storage, Edge Runtime y CLI de migraciones de Supabase reales; que la URL pública del logo siga cargando tras la migración 096; el efecto real de `ban_duration` en `eliminar-usuario`; el despliegue de las funciones con importaciones remotas; el envío real con Resend; el comportamiento de Vercel (cabeceras, reescrituras); todo el navegador; un respaldo y una restauración reales; rendimiento con 2,000–5,000 pacientes. Cada uno tiene su procedimiento en `VERIFICACION_SUPABASE.md`, `CHECKLIST_NAVEGADOR.md` o `RESPALDO_Y_RECUPERACION.md`.

## 8. Decisiones humanas (detalle en `CONFIGURACION_PENDIENTE.md`)
Conservación clínica, fiscal y contractual (sin valor: la eliminación de clínicas con datos sigue bloqueada); límite de retrofecha de las notas; quién corrige consultas completadas y quién firma por otro odontólogo (implementados, ajustables); fila de espera; revisión jurídica de los 8 documentos legales; cambio obligatorio de la contraseña temporal; CAPTCHA/límite por IP y CSP obligatoria. **No se declara cumplimiento de la NOM-004-SSA3-2012 ni de otra norma**: esa conclusión requiere una revisión legal.

## 9. Integridad del paquete
`docs/MANIFIESTO_SHA256.txt` lista el SHA-256 de cada archivo; el SHA-256 del ZIP completo viaja en un archivo `.sha256` junto al ZIP (no puede ir dentro de sí mismo). `docs/INVENTARIO_DE_MIGRACIONES.md` lista cada migración con su suma, su rollback y si es re-ejecutable.

## 10. Cierre de cuatro pendientes críticos (entrega actual)
| Pendiente | Estado | Evidencia |
|---|---|---|
| 1. Cambio obligatorio de la contraseña temporal | **Implementado en código y verificado con pruebas locales.** No validado en Supabase real | `CAMBIO_PASSWORD_OBLIGATORIO.md` (migración 103) |
| 2. Documentos legales para el abogado | **Borradores v2 preparados** (migración 105), contrastados con el software y con las fuentes consultadas. **PENDIENTE DE ABOGADO**: ningún documento está aprobado ni se declara cumplimiento; las fuentes del marco legal (LFPDPPP 2025, NOM-004, CFF) son secundarias salvo la reproducción de la NOM-004 y su texto oficial no se consultó | `MATRIZ_REVISION_JURIDICA.md`, `PENDIENTES_LEGALES.md` |
| 3. Política de conservación | **Mecanismo implementado y verificado con pruebas locales; la política NO está aprobada**: todos los plazos sin valor y en PENDIENTE_DE_ABOGADO. **Faltan por implementar:** el bloqueo como estado técnico, la anonimización y la limpieza de archivos de Storage por paciente | `POLITICA_CONSERVACION_DATOS.md` (migración 104) |
| 4. Restauración de respaldos | **PROCEDIMIENTO PREPARADO; RESTAURACIÓN REAL EN SUPABASE PENDIENTE.** Ensayo de restauración de PostgreSQL ejecutado en una instancia local desechable (0 fallos), que no ejercita Auth real, Storage, Edge Functions ni secretos. RPO y RTO sin acordar | `PLAN_PRUEBA_RESTAURACION.md`, `RESULTADO_PRUEBA_RESTAURACION.md` |
Hallazgos de esta entrega: crear un paciente genera un expediente y 64 piezas en blanco; las 15 relaciones hacia `pacientes` son `ON DELETE CASCADE` (un borrado privilegiado destruía todo el expediente; ahora está protegido); `pacientes → clinicas` no es cascada; los borradores legales afirmaban funciones inexistentes (integraciones de WhatsApp, recordatorios, IP) y omitían los datos clínicos guardados en el dispositivo; y varios códigos y guardas obligaron a declarar las tablas nuevas. Nada de lo anterior sustituye a la revisión de un abogado ni a la validación en Supabase real.

## 11. Integración de los documentos legales (migración 106)
Los nueve documentos legales quedan como versión 1.0 vigente, con la identidad de Eduardo Heriberto Iglesias Arines (persona física) como texto fijo, sin advertencias editoriales, contrastados con el **texto oficial** de la LFPDPPP vigente (reforma DOF 14-11-2025) y de la NOM-004-SSA3-2012, y con un registro de aceptación cuya versión y fecha fija el servidor. Detalle, fuentes verificadas y no verificadas, instalación y decisiones que requieren datos reales de SIRO: `INTEGRACION_LEGAL_SIRO.md`. **No consta la validación de un abogado**; el Código Fiscal de la Federación y la NOM-024-SSA3-2012 no se verificaron en texto oficial y los documentos no citan sus plazos.
