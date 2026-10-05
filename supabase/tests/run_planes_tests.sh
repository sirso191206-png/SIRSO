#!/bin/bash
# Corre TODA la verificación SQL del sistema de planes contra un PostgreSQL local.
# Requiere: postgres con usuario "postgres" accesible por `su postgres` (o ajusta PSQL).
# NO toca Supabase: usa una base temporal "siro_test" con una capa que imita auth/storage.
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
MIG="$DIR/../migrations"
PSQL="su postgres -c"
run() { $PSQL "psql -q -d siro_test -f $1" 2>&1; }

rebuild_until() {   # aplica el stub y las migraciones hasta ANTES de $1 (o todas si vacío)
  $PSQL "psql -q -d postgres -c 'drop database if exists siro_test' -c 'create database siro_test'" >/dev/null 2>&1
  run "$DIR/supabase_stub.sql" >/dev/null
  for f in $(ls "$MIG"/*.sql | sort); do
    [ -n "${1:-}" ] && [ "$(basename "$f")" = "$1" ] && break
    [ "$(basename "$f")" = "007_sirso_fase5_folio.sql" ] && $PSQL "psql -q -d siro_test -c 'alter table pacientes add column if not exists archivado_en timestamptz'" >/dev/null 2>&1
    run "$f" >/dev/null
  done
}

echo "== 1/3  Migración sobre clínicas heredadas =="
rebuild_until "075_sirso_planes_suscripciones.sql"
run "$DIR/planes_backfill_1_antes.sql" | grep -E "ANTES|ERROR"
run "$MIG/075_sirso_planes_suscripciones.sql" | grep ERROR
run "$DIR/planes_backfill_2_despues.sql" > /tmp/backfill.log 2>&1
grep -E "NOTICE:  (FAIL|RESULTADO)|ERROR" /tmp/backfill.log | sed 's|psql:[^ ]* ||'
echo "   PASS: $(grep -c 'NOTICE:  PASS' /tmp/backfill.log)"

echo "== 2/3  Re-ejecutar 075 es seguro (idempotente) y no pisa lo editado =="
$PSQL "psql -q -d siro_test -c \"update planes_catalogo set precio_mensual = 1234 where plan='profesional'\"" >/dev/null
$PSQL "psql -q -d siro_test -c \"update plan_funcionalidades set habilitada=false where plan='esencial' and funcionalidad='caja'\"" >/dev/null
run "$MIG/075_sirso_planes_suscripciones.sql" | grep ERROR
$PSQL "psql -d siro_test -Atc \"select 'precio editado conservado: '||(precio_mensual=1234), 'caja sigue desactivada: '||(not habilitada) from planes_catalogo p, plan_funcionalidades f where p.plan='profesional' and f.plan='esencial' and f.funcionalidad='caja'\""
$PSQL "psql -d siro_test -Atc \"select 'suscripciones vigentes duplicadas: '||count(*) from (select clinica_id from suscripciones where estado<>'reemplazada' group by 1 having count(*)>1) x\""

echo "== 3/3  Pruebas del sistema completo =="
rebuild_until ""
run "$DIR/planes_suscripciones_test.sql" > /tmp/planes.log 2>&1
grep -E "NOTICE:  (FAIL|RESULTADO)|ERROR" /tmp/planes.log | sed 's|psql:[^ ]* ||'
