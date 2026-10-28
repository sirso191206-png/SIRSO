#!/bin/bash
# SIRO — Restauración de prueba, paso B (contenedor public.ecr.aws/supabase/postgres:17.6.1.165, SIN red, desechable).
# Restaura el respaldo descifrado (/v) como en un proyecto de Supabase nuevo y compara las filas de CADA tabla con las que
# contiene el volcado. Procedimiento validado el 28/10/2026 con el respaldo real del 17/10 (49/49 conteos idénticos).
# El esquema auth/storage de la imagen se reemplaza por el de producción (las versiones de Auth difieren).
set -euo pipefail
export PGPASSWORD="$POSTGRES_PASSWORD"
for i in $(seq 1 90); do pg_isready -h localhost -U postgres -q && break; sleep 2; done
sleep 5
P="psql -h localhost -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1"
$P -c 'drop schema if exists auth cascade' -c 'drop schema if exists storage cascade' > /tmp/limpiar.log 2>&1
$P --single-transaction -f /v/auth_schema.sql -f /v/schema.sql -f /v/storage_schema.sql \
   -c 'SET session_replication_role = replica' -f /v/data.sql > /tmp/restaurar.log 2>&1 \
  || { echo "ERROR: la restauración falló: $(grep -m1 -E 'ERROR|FATAL' /tmp/restaurar.log | cut -c1-200)"; exit 4; }
dif=0; n=0
while IFS='|' read -r tabla esperado; do
  n=$((n+1))
  real=$($P -At -c "select count(*) from $tabla" 2>/dev/null || echo ERR)
  if [ "$real" != "$esperado" ]; then dif=$((dif+1)); echo "  diferencia: $tabla esperado=$esperado restaurado=$real"; fi
done < /v/conteos_volcado.txt
rls=$($P -At -c "select count(*) filter (where relrowsecurity) || '/' || count(*) from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind = 'r'")
pol=$($P -At -c "select count(*) from pg_policies")
echo "restauración: $n tablas comparadas, $dif diferencias; RLS $rls; $pol políticas"
[ "$dif" = 0 ] || exit 5
