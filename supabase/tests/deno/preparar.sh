#!/bin/bash
# Prepara el entorno de la prueba de la Edge Function en DENO REAL:
#   1) instala EXACTAMENTE la versión de supabase-js que fija la función (2.45.0) y la empaqueta (esbuild) en un solo módulo;
#   2) genera un mapa de importaciones que sustituye los dos módulos remotos de la función (deno.land y esm.sh) por archivos locales.
# Uso: ./preparar.sh <directorio-de-trabajo> <ruta-a-esbuild>
set -e
D=${1:-/tmp/deno_tests}; ESBUILD=${2:-esbuild}; AQUI=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$D" && cd "$D"
[ -d node_modules/@supabase/supabase-js ] || { echo '{"name":"x","private":true}' > package.json; npm install --no-audit --no-fund --silent @supabase/supabase-js@2.45.0; }
echo "export { createClient } from '@supabase/supabase-js'" > entrada.js
"$ESBUILD" entrada.js --bundle --format=esm --platform=browser --outfile=supabase-js.bundle.js --log-level=error
cp "$AQUI/std_http_shim.ts" "$D/std_http_shim.ts"
cat > import_map.json << JSON
{ "imports": {
  "https://deno.land/std@0.168.0/http/server.ts": "file://$D/std_http_shim.ts",
  "https://esm.sh/@supabase/supabase-js@2.45.0": "file://$D/supabase-js.bundle.js"
} }
JSON
echo "supabase-js $(node -e "console.log(require('$D/node_modules/@supabase/supabase-js/package.json').version)") empaquetado en $D/supabase-js.bundle.js ($(wc -c < supabase-js.bundle.js) bytes)"
