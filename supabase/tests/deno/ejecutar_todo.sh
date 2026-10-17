#!/bin/bash
# Reconstruye la base de pruebas desde las migraciones, la siembra, arranca PostgREST y ejecuta la integración en Deno.
# Variables: DENO (binario), REPO (raíz del repo), PGRST (script que arranca PostgREST), RESET_DB (script que reconstruye la base con las migraciones)
set -e; AQUI=$(cd "$(dirname "$0")" && pwd)
${PGRST_STOP:-true}; sleep 1; ${RESET_DB:?define RESET_DB}; chmod a+r "$AQUI/semilla_deno.sql"
su postgres -c "psql -q -d ${PGDATABASE:-siro_test} -f $AQUI/semilla_deno.sql" > /dev/null
( setsid nohup ${PGRST:?define PGRST} > /dev/null 2>&1 < /dev/null & ); sleep 6
"$AQUI/preparar.sh" "${DENO_TEST_DIR:-/tmp/deno_tests}" "${ESBUILD:-esbuild}" > /dev/null
DENO=${DENO:?define DENO} node "$AQUI/edge_deno_integration.mjs"
