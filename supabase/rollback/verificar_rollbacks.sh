#!/bin/bash
# Prueba que el ROLLBACK de cada migración 094–106 (la 105 solo añade versiones de documentos: no tiene rollback) devuelve el esquema EXACTO al de antes de aplicarla (funciones, políticas, triggers y privilegios).
# Para cada N: construye la base DESECHABLE `siro_test` con las migraciones hasta N-1, toma una huella, aplica la N y su rollback, y compara.
# Uso: ./verificar_rollbacks.sh <ruta/a/supabase>
D=${1:?ruta a supabase}; BD=siro_test; q() { su postgres -c "psql -q -At -d $BD $*"; }
su postgres -c "psql -q -At -d postgres -c 'select 1'" >/dev/null 2>&1 || { echo "✘ No hay PostgreSQL alcanzable"; exit 2; }
cat > /tmp/rb_huella.sql << 'SQL'
select md5(string_agg(x, E'\n' order by x)) from (
  select 'F|' || p.oid::regprocedure || '|' || md5(pg_get_functiondef(p.oid)) || '|' || coalesce(p.proacl::text, '') as x from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind in ('f','p')
  union all select 'P|' || schemaname || '.' || tablename || '.' || policyname || '|' || permissive || '|' || cmd || '|' || roles::text || '|' || coalesce(qual,'') || '|' || coalesce(with_check,'') from pg_policies where schemaname in ('public','storage')
  union all select 'T|' || tgrelid::regclass || '.' || tgname || '|' || md5(pg_get_triggerdef(t.oid)) from pg_trigger t join pg_class c on c.oid = t.tgrelid where not tgisinternal and c.relnamespace = 'public'::regnamespace
  union all select 'G|' || table_name || '|' || grantee || '|' || privilege_type from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon','authenticated','public')
  union all select 'C|' || conrelid::regclass || '|' || conname || '|' || pg_get_constraintdef(oid) || '|' || convalidated from pg_constraint where connamespace = 'public'::regnamespace and contype = 'c'
  union all select 'D|' || defaclobjtype::text || '|' || coalesce(defaclacl::text, '') from pg_default_acl where defaclnamespace = 'public'::regnamespace) s
SQL
chmod a+r /tmp/rb_huella.sql; fallo=0
LISTA="094 095 096 097 098 099 100 101 102 103 104 106"
for N in $LISTA; do
  su postgres -c "psql -q -d postgres -c 'drop database if exists $BD with (force)' -c 'create database $BD'" >/dev/null 2>&1; q -f $D/tests/supabase_stub.sql >/dev/null 2>&1
  for f in $(ls $D/migrations/*.sql | sort); do n=$(basename $f | cut -c1-3); [ "$n" \< "$N" ] || continue; chmod a+r $f; su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $BD -f $f" >/dev/null 2>&1 || { echo "✘ falló $(basename $f) al preparar la base"; exit 2; }; done
  A=$(q -f /tmp/rb_huella.sql); [ -n "$A" ] || { echo "✘ huella vacía"; exit 2; }
  m=$(ls $D/migrations/${N}_*.sql); chmod a+r $m $D/rollback/${N}_rollback.sql
  su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $BD -f $m" >/dev/null 2>&1 || { echo "✘ no se aplicó $N"; fallo=1; continue; }
  M=$(q -f /tmp/rb_huella.sql)
  su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $BD -f $D/rollback/${N}_rollback.sql" >/dev/null 2>&1 || { echo "✘ el rollback de $N falló"; fallo=1; continue; }
  B=$(q -f /tmp/rb_huella.sql)
  su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $BD -f $D/rollback/${N}_rollback.sql" >/dev/null 2>&1 || { echo "✘ el rollback de $N no es re-ejecutable"; fallo=1; continue; }
  C=$(q -f /tmp/rb_huella.sql)
  [ "$A" != "$M" ] && cambia="la migración SÍ cambia el esquema" || cambia="⚠ la migración no cambió el huella (¿vacía?)"
  if [ "$A" = "$B" ] && [ "$B" = "$C" ]; then echo "✔ $N: $cambia; tras el rollback el esquema es IDÉNTICO al anterior (y re-ejecutar el rollback no cambia nada)"; else echo "✘ $N: el esquema tras el rollback NO coincide ($A → $M → $B)"; fallo=1; fi
done
[ $fallo = 0 ] && echo "RESULTADO: ✔ los $(echo $LISTA | wc -w) rollbacks verificados ($LISTA)" || echo "RESULTADO: ✘ hay hallazgos"; exit $fallo
