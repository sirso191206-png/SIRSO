# Diagnóstico de la suite de pruebas en TU repositorio local

## Por qué hace falta
En el ZIP entregado (`SIRSO-completo-FINAL.zip`), extraído en una carpeta limpia: `npm ci` → `tsc` → lint (0 errores) → **115 archivos / 1,384
pruebas, todas pasan, sin `.env`**. Si en tu repositorio fallan 12 archivos, **tu repositorio no es idéntico a ese ZIP**. Indicio concreto:
la suite que reportas, `planesGatingUI.test.js`, **no existe en el ZIP** (la de planes se llama `planesGatingYUI.test.js`).

Causas habituales de esta diferencia (de más a menos probable):
1. **Archivos sobrantes**: copiar un ZIP *encima* de un repositorio **no borra** lo que ya no existe en la versión nueva. Una prueba antigua
   se sigue ejecutando, ahora contra componentes y funciones que cambiaron o desaparecieron → fallas masivas y `Element type is invalid … undefined`.
2. **Archivos con otro contenido**: parte de los archivos no se sobrescribió, o se sobrescribió con una versión intermedia.
3. **OneDrive**: un repositorio dentro de OneDrive puede generar copias de conflicto (`archivo-NOMBREDEPC.js`, `archivo (1).js`) y bloquear
   archivos. Esas copias aparecen como "solo en tu repositorio". Lo más sano es tener el repositorio fuera de OneDrive.
4. **`vitest.config.ts` desactualizado**: el nuevo define variables ficticias de Supabase (`test.env`). Sin ellas, los archivos de prueba que
   importan el cliente real fallan al cargar con `supabaseUrl is required` si no hay `.env`.

## Inventario de pruebas: qué hay, qué se ejecuta y qué NO está en el ZIP
- **`planesGatingUI.test.js` no existe en ninguna entrega**: se revisaron los 143 ZIP históricos y en todos el archivo se llama
  `planesGatingYUI.test.js`. Si en tu repositorio existe `planesGatingUI.test.js`, es un archivo **que solo existe ahí** (resto de una
  versión intermedia, renombrado o copia de OneDrive). **No se puede recuperar desde el ZIP y no se debe inventar**: es un requisito
  antes de cerrar la corrección que se localice con `git log --follow -- <ruta>` / `git status` y se compare con `planesGatingYUI.test.js`.
- **Hueco de configuración encontrado y corregido**: hasta el 25-ago el `include` de `vitest.config.ts` incluía también
  `src/features/**/*.test.ts` (SIS: mapper, validador, exportador, catálogos; **101 pruebas**). Se perdió al reescribir la lista y esas
  pruebas **llevaron semanas sin ejecutarse** aunque pasan. Ya están de vuelta (la suite pasó de 116 a 122 archivos) y la prueba
  `inventarioDePruebas` falla si alguna prueba existente queda fuera del `include`.
- Resultado de la suite en el ZIP limpio: **122 archivos / 1,505 pruebas** (antes se informaban 116 / 1,400 porque no incluían SIS).

## Paso 1 — comparar tu repositorio con el ZIP (PowerShell)
```powershell
cd C:\Users\Laloi\OneDrive\Kodexa\SIRSO_GIT
Expand-Archive -Path "C:\ruta\a\SIRSO-completo-FINAL.zip" -DestinationPath "$env:TEMP\siro-zip" -Force
# Ajusta si tu repositorio ya ES la carpeta SIRSO (con frontend\ y supabase\ dentro) o la contiene:
node frontend\tools\comparar-arboles.mjs . "$env:TEMP\siro-zip\SIRSO"
```
(Si `tools\` aún no existe en tu repositorio, ejecútala desde la carpeta descomprimida: `node "$env:TEMP\siro-zip\SIRSO\frontend\tools\comparar-arboles.mjs" . "$env:TEMP\siro-zip\SIRSO"`.)

Muestra tres listas: archivos **solo en tu repositorio** (con las pruebas sobrantes marcadas ⚠), archivos que **faltan**, y archivos **distintos**
(compara contenido sin importar CRLF/LF). Ignora `node_modules`, `dist`, `.git`, `.env` y `*.log`.

## Paso 2 — encontrar el "Element type is invalid" sin ejecutar nada
```powershell
cd frontend
npm run diagnostico:importaciones
```
Nombra archivo e importación exactas cuando:
- `import { X } from './a'` y `./a` no exporta `X` (o `import X` sin `export default`, o al revés) → **eso es** un componente `undefined`;
- una prueba hace `vi.mock('./a', () => ({ … }))` sin definir un componente que el código importa.
En el ZIP entregado da **0** hallazgos. Cualquier línea que aparezca en tu repositorio es una causa directa.

## Paso 3 — qué hacer con lo que salga (reglas: no borrar pruebas, no desactivarlas, no falsear mocks)
| Hallazgo | Qué hacer |
|---|---|
| Prueba **solo en tu repositorio** (p. ej. `planesGatingUI.test.js`) | `git log --follow -- <archivo>` y `git status`: ¿quién la creó y cuándo? Si es un **resto de una versión anterior** cuya cobertura ya existe en el ZIP (`planesGatingYUI.test.js`), **muévela fuera del repositorio** (no la borres): queda a salvo y deja de ejecutarse contra código nuevo. Si cubre algo que el ZIP NO cubre, es una prueba válida: se adapta al comportamiento actual (ver tabla de planes) en lugar de quitarla. |
| Archivo de `src/` **distinto** | Si es de `src/lib/planes.js`, `src/components/planes/*`, `src/store/usePlanStore.js`: pon el del ZIP (o revisa el `git diff`); un componente nuevo que importa una función que el archivo viejo no exporta es justo la causa de `undefined`. |
| `vitest.config.ts` distinto | Toma el del ZIP (trae `test.env`). |
| Falta algo del ZIP | Cópialo. |

## Paso 4 — comprobar
```powershell
cd frontend
npm ci
npm run lint                     # 0 errores
npm test -- --run                # objetivo: 0 archivos y 0 pruebas fallidas
npm run build
```
Si tras igualar tu repositorio al ZIP todavía falla algo, **envía**: la salida de los pasos 1 y 2, las primeras 30 líneas del primer error de
cada archivo fallido (`npx vitest run <archivo> 2>&1 | Select-Object -First 40`) y el contenido de `planesGatingUI.test.js`. Con eso se
puede decidir si el defecto está en el código, en la prueba o en un mock.

## Qué NO hacer
No eliminar ni desactivar pruebas (`.skip`, `.only`, `.todo`), no cambiar expectativas para que coincidan con código roto, no inventar planes ni
límites (la fuente de verdad son las migraciones y `GUIA_PLANES.md`), no tocar migraciones históricas, no hacer push ni deploy hasta que todo pase.
