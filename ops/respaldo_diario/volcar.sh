#!/bin/bash
# ============================================================
# SIRO — Respaldo diario, paso 1 (contenedor postgres:17.6-bookworm, CON red): volcado de SOLO LECTURA de producción.
# Lo invoca respaldo_diario.ps1. Montajes: /conexion (solo lectura: conexion_prod.env) y /trabajo (carpeta temporal del día).
# Valida el destino ANTES de conectar (misma regla que los scripts de despliegue). No imprime credenciales.
# Genera en /trabajo: auth_schema.sql, storage_schema.sql, schema.sql (public), data.sql (public+auth+storage),
#   storage_objetos.tsv (bucket, nombre, tamaño, eTag) y conteos_volcado.txt (filas por tabla CONTADAS EN data.sql).
# ============================================================
set -euo pipefail
DESTINO_ESPERADO=mhqdgvdcupzhatrryapw
sed 's/\r$//' /conexion/conexion_prod.env | grep -E '^PG(HOST|PORT|USER|PASSWORD|DATABASE|SSLMODE)=' > /tmp/c.env
set -a; . /tmp/c.env; set +a; rm -f /tmp/c.env
if [[ "${PGHOST:-}" == "db.$DESTINO_ESPERADO.supabase.co" ]]; then :
elif [[ "${PGHOST:-}" =~ ^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$ ]] && [ "${PGPORT:-}" = 5432 ] && [ "${PGUSER:-}" = "postgres.$DESTINO_ESPERADO" ]; then :
else echo "ERROR: el destino no corresponde a $DESTINO_ESPERADO. No se conecta."; exit 2; fi
case "${PGSSLMODE:-}" in require|verify-ca|verify-full) ;; *) echo "ERROR: PGSSLMODE debe exigir TLS. No se conecta."; exit 2;; esac
export PGOPTIONS='-c default_transaction_read_only=on' PGCONNECT_TIMEOUT=20 PGAPPNAME=siro_respaldo_diario

cd /trabajo
pg_dump --schema-only --schema=auth -f auth_schema.sql
pg_dump --schema-only --schema=storage -f storage_schema.sql
pg_dump --schema-only --schema=public -f schema.sql
# Todo proyecto de Supabase ya tiene el esquema public: sin esta línea el script se puede restaurar tal cual.
sed -i '/^CREATE SCHEMA public;$/d' schema.sql
# Un volcado por esquema (-n) no incluye las extensiones de las que depende (p. ej. btree_gist en public): se anteponen.
psql -X -q -At -v ON_ERROR_STOP=1 -c "select 'CREATE SCHEMA IF NOT EXISTS ' || quote_ident(n.nspname) || '; CREATE EXTENSION IF NOT EXISTS ' || quote_ident(e.extname) || ' WITH SCHEMA ' || quote_ident(n.nspname) || ';' from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname <> 'plpgsql' order by e.extname" > extensiones.sql
cat extensiones.sql schema.sql > schema_con_extensiones.sql && mv schema_con_extensiones.sql schema.sql && rm extensiones.sql
pg_dump --data-only --schema=public --schema=auth --schema=storage -f data.sql
psql -X -q -At -v ON_ERROR_STOP=1 -c "select bucket_id || E'\t' || name || E'\t' || coalesce(metadata->>'size', '') || E'\t' || coalesce(metadata->>'eTag', '') from storage.objects order by bucket_id, name" > storage_objetos.tsv

# Filas por tabla según el PROPIO volcado (consistente: un solo pg_dump = una sola instantánea).
awk '/^COPY /{t=$2; n=0; dentro=1; next} dentro && /^\\\.$/{print t "|" n; dentro=0; next} dentro{n++}' data.sql | tr -d '"' | sort > conteos_volcado.txt
for f in auth_schema.sql storage_schema.sql schema.sql data.sql; do [ -s "$f" ] || { echo "ERROR: $f vacío"; exit 3; }; done
grep -q '^public.pacientes|' conteos_volcado.txt || { echo "ERROR: el volcado no contiene public.pacientes"; exit 3; }
echo "volcado OK: $(wc -l < conteos_volcado.txt) tablas, $(wc -l < storage_objetos.tsv) archivos en Storage"
