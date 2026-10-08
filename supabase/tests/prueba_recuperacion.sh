#!/bin/bash
# PRUEBA DE RECUPERACIÓN (ambiente controlado, PostgreSQL local — NO es Supabase real).
# 1) siembra datos  2) respalda con pg_dump  3) restaura en OTRA base  4) compara datos, estructura y SEGURIDAD
# 5) corre la auditoría de aislamiento entre clínicas sobre la base restaurada: si las políticas RLS no hubieran
#    sobrevivido al respaldo, esas pruebas fallarían.
# Uso:  ./prueba_recuperacion.sh [base_origen] [base_destino]     (la base de origen ya debe estar migrada)
set -u
ORIG=${1:-siro_test}; DEST=${2:-siro_restaurada}; DUMP=/tmp/siro_respaldo_$$.dump
AQUI="$(cd "$(dirname "$0")" && pwd)"
PG() { su postgres -c "$1"; }
Q() { PG "psql -d $1 -Atc \"$2\""; }
fallos=0; verifica() { if [ "$2" = "$3" ]; then echo "  ✔ $1: $2"; else echo "  ✘ $1: origen=$2 restaurada=$3"; fallos=$((fallos+1)); fi; }

echo "== 1. Datos de demostración en $ORIG =="
PG "psql -q -d $ORIG -f $AQUI/prueba_recuperacion_datos.sql" >/dev/null 2>&1 || { echo "No se pudieron sembrar los datos"; exit 2; }
echo "   pacientes: $(Q $ORIG 'select count(*) from pacientes')  citas: $(Q $ORIG 'select count(*) from citas')  pagos: $(Q $ORIG 'select count(*) from pagos')"

echo "== 2. Respaldo (pg_dump, formato personalizado) =="
PG "pg_dump -Fc -d $ORIG -f $DUMP" || { echo "Falló el respaldo"; exit 2; }
echo "   archivo: $(ls -l $DUMP | awk '{print $5}') bytes"

echo "== 3. Restauración en una base NUEVA ($DEST) =="
PG "psql -q -d postgres -c 'drop database if exists $DEST' -c 'create database $DEST'" >/dev/null
PG "pg_restore -d $DEST --no-owner $DUMP" > /tmp/restore_$$.log 2>&1
echo "   mensajes de pg_restore: $(grep -c . /tmp/restore_$$.log) línea(s) $(grep -ci 'error' /tmp/restore_$$.log) con 'error'"
grep -i error /tmp/restore_$$.log | head -3

echo "== 4. Comparación origen vs restaurada =="
for t in $(Q $ORIG "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1"); do
  verifica "filas de $t" "$(Q $ORIG "select count(*) from public.$t")" "$(Q $DEST "select count(*) from public.$t")"
done
verifica "objetos de Storage" "$(Q $ORIG 'select count(*) from storage.objects')" "$(Q $DEST 'select count(*) from storage.objects')"
verifica "tablas con RLS activo" "$(Q $ORIG "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity")" "$(Q $DEST "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity")"
verifica "políticas RLS (public)" "$(Q $ORIG "select count(*) from pg_policies where schemaname='public'")" "$(Q $DEST "select count(*) from pg_policies where schemaname='public'")"
verifica "políticas sobre Storage" "$(Q $ORIG "select count(*) from pg_policies where schemaname='storage'")" "$(Q $DEST "select count(*) from pg_policies where schemaname='storage'")"
verifica "funciones" "$(Q $ORIG "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")" "$(Q $DEST "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")"
verifica "triggers" "$(Q $ORIG "select count(*) from pg_trigger where not tgisinternal")" "$(Q $DEST "select count(*) from pg_trigger where not tgisinternal")"
verifica "índices" "$(Q $ORIG "select count(*) from pg_indexes where schemaname='public'")" "$(Q $DEST "select count(*) from pg_indexes where schemaname='public'")"
verifica "índice del CURP por clínica" "$(Q $ORIG "select count(*) from pg_indexes where indexname='idx_pacientes_curp_por_clinica'")" "$(Q $DEST "select count(*) from pg_indexes where indexname='idx_pacientes_curp_por_clinica'")"
verifica "interruptores de plataforma" "$(Q $ORIG "select string_agg(clave||'='||valor, ',' order by clave) from plataforma_config")" "$(Q $DEST "select string_agg(clave||'='||valor, ',' order by clave) from plataforma_config")"

echo "== 5. La seguridad sobrevivió: auditoría de aislamiento sobre la base RESTAURADA =="
res=$(PG "psql -d $DEST -f $AQUI/aislamiento_clinicas_test.sql" 2>&1 | grep -E "NOTICE:  RESULTADO" | sed 's|psql:[^ ]* ||')
echo "   $res"
case "$res" in *"36 pasaron, 0 fallaron"*) echo "  ✔ aislamiento A→B sobre la base restaurada";; *) echo "  ✘ el aislamiento NO pasa sobre la base restaurada"; fallos=$((fallos+1));; esac
res2=$(PG "psql -d $DEST -f $AQUI/auditoria_aislamiento_test.sql" 2>&1 | grep -E "NOTICE:  RESULTADO" | sed 's|psql:[^ ]* ||')
echo "   $res2"
case "$res2" in *"0 fallaron"*) echo "  ✔ aislamiento de la auditoría sobre la base restaurada";; *) echo "  ✘ la auditoría NO está aislada en la base restaurada"; fallos=$((fallos+1));; esac

rm -f "$DUMP" /tmp/restore_$$.log
echo; [ $fallos -eq 0 ] && echo "RESULTADO: recuperación correcta (0 diferencias)" || echo "RESULTADO: $fallos diferencia(s) — revisar"
exit $fallos
