# SIRO — Estabilidad: errores de consola, red y WebGL (auditoría técnica)

Este documento explica **por qué** aparecían los errores de consola reportados, qué se corrigió y cómo se verificó. Todas las
mediciones se hicieron en un Chromium real con WebGL (ver `frontend/verificacion-webgl/`), no solo con pruebas de Node.

## 1. `503 (Sin conexión)`
**Causa:** el service worker (`public/sw.js`). La combinación estado 503 + texto "Sin conexión" no la produce Supabase, ni las Edge
Functions, ni Vercel: solo ese archivo. El SW interceptaba TODA petición GET salvo las de `supabase.co`, **incluidas las de otros
dominios** (scripts de terceros, extensiones, analíticas). Si una fallaba por un bloqueador, DNS o CSP, fabricaba ese 503 aunque
hubiera Internet; además guardaba en caché código ajeno. Un segundo defecto: un archivo inexistente recibía `index.html` con 200
(reescritura de SPA de Vercel) y el SW lo cacheaba como si fuera ese `.js` o `.glb`.

**Corrección:**
- El SW **solo gestiona su propio origen**; lo demás pasa de largo y el navegador lo trata como siempre.
- "Sin conexión" se dice **solo** si `navigator.onLine` es falso; con red pero sin poder traer el archivo se responde 503 "No disponible".
- Un **archivo** pedido que el servidor contesta con HTML recibe un **404 honesto** y no se guarda.
- Tiempo máximo de 20 s para la red del SW; y 30 s (120 s en subidas) para todas las peticiones a Supabase (`lib/fetchConTimeout.js`).
- `vercel.json` ya no reescribe a `index.html` los archivos (assets, modelos, scripts): si faltan, dan 404 real.
- El SW deja en su consola (`[SIRO SW]`) la URL de lo que no pudo traer, para poder diagnosticarlo.
- Lecturas: `lib/reintento.js` repite SOLO fallos transitorios (red, tiempo agotado, 5xx), con espera creciente y tope; un error de
  permisos o validación no se repite. Mensajes para la persona sin texto técnico (`lib/errorDeRed.js`).

**Qué no se pudo saber:** qué URL concreta lo disparaba en el navegador del usuario (no hay acceso a su despliegue). Si vuelve a aparecer,
`Network → filtrar por estado 503` o la consola del service worker lo dicen.

## 2. `Cannot read properties of undefined (reading 'startTime')` en `reportAllChanges`
**No viene de SIRO.** `reportAllChanges` no existe en el código propio, en `package.json`, en `node_modules` ni en el bundle compilado
(se comprobó con búsqueda en los cuatro). Es de un script que NO es parte de la aplicación; las causas probables son una extensión del
navegador (p. ej. "Web Vitals") o la barra/analíticas de Vercel inyectadas en la página. **No se confirmó cuál.**
Cómo identificarlo: la primera línea completa de la traza (si empieza con `chrome-extension://` es una extensión), o abrir SIRO en una
ventana de incógnito sin extensiones. Si es la barra de Vercel, se apaga en la configuración del proyecto (Vercel Toolbar). Con el cambio
del punto 1, el SW ya no intercepta ni guarda en caché esos scripts de terceros.

## 3. `THREE.WebGLRenderer: Context Lost` y fugas del odontograma 3D
Tres causas distintas, medidas en navegador real (recorrido: entrar al 3D, salir, 6 ciclos 2D↔3D, cambiar de paciente, 4 montajes,
3 cambios de pestaña, recarga, pérdida real de contexto):

| Causa | Antes | Después |
|---|---|---|
| **Churn de contextos**: `useOdontograma.recargar()` ponía `cargando=true` en cada guardado y las pantallas devolvían "Cargando…", así que el `<Canvas>` se destruía y recreaba | 17 contextos creados, 16 mensajes "Context Lost" (cada uno una destrucción normal: R3F llama `forceContextLoss()` y three lo imprime) | `cargando` es solo la carga inicial; el Canvas ya no se destruye al guardar ni al cambiar de paciente |
| **Destrucción desordenada**: nunca se hacía `dispose()` antes de `forceContextLoss()` | el mensaje salía en cada destrucción; la GPU se liberaba a los ~5 s | 0 mensajes en destrucción normal; liberación en <0.5 s (`rendererControlado.js`) |
| **Fuga de listeners de `<Html>` (drei)**: un React root por etiqueta (hasta 64) | 8,384 listeners fugados por ciclo; heap 4.6 → 32 MB | una sola capa de etiquetas (`CapaEtiquetas3D.jsx` + `proyeccionEtiquetas.js`): estables |
| **Fuga por geometría compartida**: three engancha a cada geometría que dibuja un listener que captura el renderer, su contexto y su canvas; la geometría cacheada de `useGLTF` nunca se liberaba | cada visita al 3D dejaba un renderer completo retenido | cada montaje clona y libera sus geometrías y materiales (`clonEscenaGLB.js`); residuo constante (64 nodos con 2, 6 o 12 visitas) |
| **Sin manejo de pérdida real** | el bucle pedía 36 frames/600 ms sobre un contexto muerto | pausa el bucle, avisa, y al restaurarse reanuda con el MISMO renderer (mismos píxeles); si no se recupera en 4 s ofrece Reintentar o Usar vista 2D |

Otros hallazgos corregidos:
- **Sin `ErrorBoundary`** en la vista 3D: si el `.glb` no cargaba (503 del SW, o `index.html` en lugar del modelo) se caía TODA la interfaz.
  Ahora `ErrorVista3D` lo contiene, con "Reintentar" (limpia la caché fallida de `useGLTF`) o "Recargar página" si el archivo de la app ya no existe.
- **Respuestas viejas**: al cambiar de paciente rápido, la respuesta del anterior podía pintarse sobre el nuevo. Se descartan; al cambiar de paciente se limpian al instante.
- **Peticiones sin `catch`**: un fallo dejaba un error sin capturar y "Cargando…" para siempre. Ahora hay reintentos acotados y un mensaje con "Reintentar".
- **Peticiones duplicadas**: cada alternancia 2D↔3D volvía a pedir los mismos datos; ahora los pide una vez el padre y los comparten.
- `focusOnTooth` usaba `requestAnimationFrame` propio (dos animaciones podían pelear por la cámara y seguir corriendo tras desmontar): ahora va por `useFrame`.
- El **modelo no era el problema**: el GLB pesa 1 MB (32 mallas, 2 materiales, sin texturas ni animaciones).
- **No se desactivó StrictMode** ni WebGL, ni se filtró la consola.

### Cómo se verificó (y una advertencia)
`frontend/verificacion-webgl/README.md`. Una advertencia aprendida: un `ElementHandle` de puppeteer sin liberar mantiene vivo el canvas y
parece una fuga de la aplicación; las primeras cifras de nodos/heap de esta auditoría estaban infladas por eso y se corrigieron.

## Pruebas automáticas añadidas
`useOdontogramaHook` (13, con un renderizador real de React), `estabilidadWebglYRed` (41), `serviceWorker` (18, ejecuta `public/sw.js`
real), `ownerDentistaFrontend` (16) y 25 pruebas SQL de la 084. Más de 130 mutaciones del código nuevo, todas detectadas.
