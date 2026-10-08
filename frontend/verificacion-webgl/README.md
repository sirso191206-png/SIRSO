# Verificación del odontograma 3D y del service worker en un navegador real

Las pruebas de Vitest corren en Node (sin WebGL ni navegador). Esta carpeta es el complemento: monta el componente REAL en
un Chromium con WebGL (por software, SwiftShader) y mide lo que ninguna prueba de Node puede ver. **No forma parte del
build de SIRO ni de `npm test`**; se ejecuta a mano cuando se toca el odontograma 3D, el service worker o la capa de red.

## Qué mide
| Qué | Cómo se ve un problema |
|---|---|
| Contextos WebGL creados / **vivos** / perdidos | "vivos" debe volver a 0 al desmontar; nunca más de 1 en uso |
| Mensajes `THREE.WebGLRenderer: Context Lost` | **0** en una destrucción normal; 1 por cada pérdida REAL provocada |
| `requestAnimationFrame` pendientes | 0 al desmontar; 0 mientras el contexto está perdido |
| Listeners del DOM, nodos y heap **después de forzar el recolector** | planos al repetir ciclos 3D↔2D (no crecen) |
| Pérdida y restauración reales de contexto (`WEBGL_lose_context`) | aviso visible, bucle detenido, dibujo reanudado con los mismos píxeles |
| Service worker | solo gestiona su origen; un archivo inexistente → 404 (no se cachea); un recurso de otro dominio que falla ya no genera "503 Sin conexión" |

## Cómo ejecutarlo
```bash
# 1) Navegador de pruebas (una sola vez; fuera del proyecto o aquí mismo)
cd frontend/verificacion-webgl/medicion && npm install

# 2) Banco de pruebas con el Odontograma real y un Supabase simulado (latencia y fallos inyectables)
cd frontend
npx vite --config verificacion-webgl/harness/vite.config.mjs                    # desarrollo + StrictMode  → http://localhost:5199
npx vite build   --config verificacion-webgl/harness/vite.config.mjs            # producción (sin StrictMode)
npx vite preview --config verificacion-webgl/harness/vite.config.mjs --port 5198

# 3) Medición
cd verificacion-webgl/medicion
node medir.mjs http://localhost:5199/ "desarrollo"      # recorrido completo (entrar/salir/2D↔3D/paciente/montajes/recarga/pérdida real)
node medir.mjs http://localhost:5198/ "producción"
node heap_largo.mjs                                      # 30 ciclos: el heap debe estabilizarse
node perdida_real.mjs                                    # pérdida real → aviso → restauración → "no se recupera" → Reintentar
node snapshot_real.mjs                                   # ruta de retención en el heap (debe quedar un residuo CONSTANTE, no crecer)

# 4) Service worker: construir y servir la app de verdad, y luego
npm run build && npx vite preview --port 4173
node sw_verificacion.mjs
```

## Lecciones para quien lo use (errores que ya nos costaron tiempo)
* **Libera los `ElementHandle` de puppeteer** (`await handle.dispose()`): un handle sin liberar mantiene vivo el canvas con
  todo su subárbol y parece una fuga de la aplicación. Ya nos pasó.
* Mide siempre **después de forzar el recolector** (`HeapProfiler.collectGarbage`), no en caliente.
* Los frames por segundo son bajos (renderizado por software): sirven para COMPARAR antes y después, no como rendimiento real.
* La fuga que sí era real estaba en una geometría compartida y cacheada (`useGLTF`) a la que three engancha, por cada
  renderer, un listener que captura el contexto y el canvas. Se encontró con la ruta de retención de `snapshot_real.mjs`.
