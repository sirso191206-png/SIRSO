#!/bin/bash
# ============================================================
# SIRO — Ensayo de RESTAURACIÓN en una instancia LOCAL y DESECHABLE de PostgreSQL (no es Supabase).
# Uso:  prueba_restauracion_local.sh <ruta/a/supabase> [directorio_de_evidencias]
# Requiere: PostgreSQL local con el usuario `postgres` accesible (como el resto de supabase/tests/*.sh), pg_dump/pg_restore y las migraciones del paquete.
# Hace: 1) construye una base ORIGEN (todas las migraciones) con datos SINTÉTICOS de dos clínicas; 2) respalda (pg_dump formato custom) y calcula SHA-256;
#       3) comprueba que un respaldo ALTERADO se detecta; 4) restaura en una base NUEVA y distinta; 5) compara esquema y datos (huellas) y ejecuta controles funcionales.
# SEGURIDAD: solo toca bases cuyo nombre empieza por «siro_rest_»; NUNCA la de producción ni ninguna otra. Deja evidencia SOLO con conteos y huellas (sin datos).
# ALCANCE REAL: ejercita PostgreSQL (esquema, datos, RLS, funciones, disparadores, privilegios, restricciones). NO ejercita Supabase Auth real, archivos de Storage, Edge Functions ni
# secretos: eso queda en docs/PLAN_PRUEBA_RESTAURACION.md como PENDIENTE DE ENTORNO REAL.
# ============================================================
set -u
RAIZ="${1:?Uso: $0 <ruta/a/supabase> [directorio_de_evidencias]}"; RAIZ="$(cd "$RAIZ" && pwd)"; OUT="${2:-/tmp/restauracion_evidencias}"
ORIGEN=siro_rest_origen; DESTINO=siro_rest_destino; CORRUPTO=siro_rest_corrupto
W=/tmp/siro_rest_trabajo; rm -rf "$W" "$OUT"; mkdir -p "$W" "$OUT"; chmod 777 "$W"   # el usuario postgres escribe aquí el respaldo
fallos=0; ok() { echo "  ✔ $1"; echo "OK   $1" >> "$OUT/resultado.txt"; }; mal() { echo "  ✘ $1"; echo "FALLA $1" >> "$OUT/resultado.txt"; fallos=$((fallos+1)); }
ahora() { date +%s.%N; }; seg() { awk -v a="$1" -v b="$2" 'BEGIN{printf "%.1f", b-a}'; }
sql() { local f="$W/q_$RANDOM.sql"; printf '%s\n' "$2" > "$f"; chmod 644 "$f"; su postgres -c "psql -q -At -v ON_ERROR_STOP=1 -d $1 -f $f" 2>&1; }
sqlf() { chmod 644 "$2"; su postgres -c "psql -q -At -v ON_ERROR_STOP=1 -d $1 -f $2" 2>&1; }
crear() { su postgres -c "psql -q -d postgres -c 'drop database if exists $1 with (force)' -c 'create database $1 template template0'" >/dev/null 2>&1; }
case "$ORIGEN$DESTINO$CORRUPTO" in *siro_rest_*siro_rest_*siro_rest_*) ;; *) echo "nombres de base no permitidos"; exit 2;; esac
: > "$OUT/resultado.txt"; echo "== SIRO — ensayo de restauración local ($(date -u +%FT%TZ)) ==" | tee -a "$OUT/resultado.txt"

echo "1) Base ORIGEN con todas las migraciones y datos sintéticos"
crear $ORIGEN; sqlf $ORIGEN "$RAIZ/tests/supabase_stub.sql" >/dev/null
n=0; for f in $(ls "$RAIZ"/migrations/*.sql | sort); do chmod a+r "$f"; r=$(su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $ORIGEN -f $f" 2>&1) || { mal "migración $(basename $f) falló: ${r:0:120}"; }; n=$((n+1)); done
[ "$fallos" = 0 ] && ok "$n migraciones aplicadas sin error en la base origen"
chmod a+r "$RAIZ/tests/postgrest/semilla.sql"; sqlf $ORIGEN "$RAIZ/tests/postgrest/semilla.sql" >/dev/null
A=c2000000-0000-0000-0000-00000000000a; B=c2000000-0000-0000-0000-00000000000b; PAC_A=e2000000-0000-0000-0000-00000000000a
cat > "$W/siembra.sql" << SQL
insert into storage.objects (bucket_id, name, metadata) values ('logos-clinicas', '$A/logo.png', '{"size":1}'), ('fotos-clinicas', '$A/$PAC_A/f1.jpg', '{"size":1}'), ('documentos-clinicos', '$A/$PAC_A/d1.pdf', '{"size":1}');
insert into fotografias (paciente_id, url_storage, etiqueta) values ('$PAC_A', '$A/$PAC_A/f1.jpg', 'intraoral');
insert into documentos_clinicos (paciente_id, tipo, nombre, url_storage) values ('$PAC_A', 'documento', 'sintetico', '$A/$PAC_A/d1.pdf');
select fn_establecer_plazo_conservacion('expediente_clinico', 6, 'APROBADA_POR_RESPONSABLE', 'Valor sintético para el ensayo de restauración', null);
select fn_colocar_retencion_legal('$A', null, 'contratos', 'Retención sintética para el ensayo de restauración', 'ENSAYO-1', null);
update usuarios set debe_cambiar_password = true where id = 'd2000000-0000-0000-0000-000000000003';
insert into legal_acceptances (usuario_id, clinica_id, documento_id, documento_version, aceptado_en, metodo) select 'd2000000-0000-0000-0000-000000000003', '$A', id, version, '2026-01-02 03:04:05+00', 'ensayo' from legal_documents where tipo = 'terms' and version = '0.2-borrador' and clinica_id is null;
SQL
r=$(sqlf $ORIGEN "$W/siembra.sql") && ok "datos sintéticos sembrados (2 clínicas, usuarios, pacientes, cita, metadatos de archivos, política y retención, un cambio de contraseña pendiente)" || mal "siembra: ${r:0:160}"

cat > "$W/huella.sql" << 'SQL'
select 'F|' || md5(string_agg(x, '|' order by x)) from (select p.oid::regprocedure::text || ':' || p.prosecdef::text || ':' || coalesce(p.proconfig::text, '') || ':' || md5(p.prosrc) x from pg_proc p where p.pronamespace in ('public'::regnamespace, 'auth'::regnamespace, 'storage'::regnamespace)) s;
select 'P|' || md5(string_agg(x, '|' order by x)) from (select schemaname || '.' || tablename || ':' || policyname || ':' || permissive || ':' || roles::text || ':' || cmd || ':' || coalesce(qual, '') || ':' || coalesce(with_check, '') x from pg_policies) s;
select 'T|' || md5(string_agg(x, '|' order by x)) from (select c.oid::regclass::text || ':' || t.tgname || ':' || pg_get_triggerdef(t.oid) x from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where not t.tgisinternal and n.nspname in ('public', 'auth', 'storage')) s;
-- Restricciones: nombre, tipo y validez EXACTOS; la definición se compara SIN paréntesis, porque PostgreSQL imprime con otros paréntesis el mismo CHECK al recargarlo ((a AND b) AND c frente a a AND b AND c: lógicamente idénticos).
select 'C|' || md5(string_agg(x, '|' order by x)) from (select c.conrelid::regclass::text || ':' || c.conname || ':' || regexp_replace(pg_get_constraintdef(c.oid), '[()]', '', 'g') || ':' || c.contype::text || ':' || c.convalidated::text x from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname in ('public', 'auth', 'storage')) s;
select 'G|' || md5(string_agg(x, '|' order by x)) from (select table_schema || '.' || table_name || ':' || grantee || ':' || privilege_type x from information_schema.role_table_grants where table_schema in ('public', 'auth', 'storage') and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')) s;
select 'R|' || md5(string_agg(x, '|' order by x)) from (select n.nspname || '.' || c.relname || ':' || c.relrowsecurity::text || ':' || c.relforcerowsecurity::text x from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind in ('r', 'p') and n.nspname in ('public', 'auth', 'storage')) s;
select 'K|' || md5(string_agg(x, '|' order by x)) from (select table_schema || '.' || table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, '') x from information_schema.columns where table_schema in ('public', 'auth', 'storage')) s;
select 'I|' || md5(string_agg(indexdef, '|' order by indexdef)) from pg_indexes where schemaname in ('public', 'auth', 'storage');
select 'V|' || md5(string_agg(x, '|' order by x)) from (select schemaname || '.' || viewname || ':' || md5(definition) x from pg_views where schemaname in ('public', 'auth', 'storage')) s;
select 'N|' || count(*) || ' funciones, ' || (select count(*) from pg_policies) || ' políticas, ' || (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where not t.tgisinternal and n.nspname in ('public','auth','storage')) || ' disparadores' from pg_proc where pronamespace = 'public'::regnamespace;
SQL
cat > "$W/datos.sql" << 'SQL'
do $$ declare r record; h text; begin
  for r in select schemaname, tablename from pg_tables where schemaname in ('public', 'auth', 'storage') order by 1, 2 loop
    execute format('select count(*) || '':'' || md5(coalesce(string_agg(t::text, ''|'' order by t::text), '''')) from %I.%I t', r.schemaname, r.tablename) into h;
    raise notice 'D|%.%|%', r.schemaname, r.tablename, h;
  end loop;
end $$;
SQL
huella() { sqlf "$1" "$W/huella.sql" | sort; su postgres -c "psql -q -d $1 -f $W/datos.sql" 2>&1 | grep -o 'D|.*' | sort; }
huella $ORIGEN > "$OUT/huella_origen.txt"; ok "huella del ORIGEN calculada ($(grep -c '^D|' "$OUT/huella_origen.txt") tablas, $(grep '^N|' "$OUT/huella_origen.txt" | cut -d'|' -f2))"

echo "2) Respaldo (pg_dump, formato custom) e integridad (SHA-256)"
DUMP="$W/respaldo.dump"; t0=$(ahora); su postgres -c "pg_dump --format=custom --no-owner -d $ORIGEN -f $DUMP" 2>&1 | head -3; t1=$(ahora); chmod 644 "$DUMP"
if [ -s "$DUMP" ]; then ok "respaldo generado ($(stat -c %s "$DUMP") bytes) en $(seg $t0 $t1) s"; else mal "no se generó el respaldo: se aborta el ensayo (no se comprueba nada más)"; echo "FALLOS=$fallos" >> "$OUT/resultado.txt"; echo "RESULTADO: ✘ ensayo abortado"; exit 1; fi
( cd "$W" && sha256sum respaldo.dump > respaldo.dump.sha256 ) && cp "$W/respaldo.dump.sha256" "$OUT/"; ( cd "$W" && sha256sum -c respaldo.dump.sha256 >/dev/null 2>&1 ) && ok "SHA-256 del respaldo registrado y verificado" || mal "SHA-256 del respaldo"
cp "$DUMP" "$W/alterado.dump"; printf '\xff\xff\xff\xff' | dd of="$W/alterado.dump" bs=1 seek=$(( $(stat -c %s "$DUMP") / 2 )) conv=notrunc 2>/dev/null; cmp -s "$DUMP" "$W/alterado.dump" && mal "no se pudo alterar la copia del respaldo para la prueba de detección"
sed 's/respaldo.dump/alterado.dump/' "$W/respaldo.dump.sha256" > "$W/alterado.sha256"; ( cd "$W" && sha256sum -c alterado.sha256 >/dev/null 2>&1 ) && mal "un respaldo ALTERADO pasó la verificación de SHA-256" || ok "un respaldo alterado (4 bytes) NO pasa la verificación de SHA-256"
crear $CORRUPTO; su postgres -c "pg_restore --no-owner --exit-on-error -d $CORRUPTO $W/alterado.dump" >/dev/null 2>&1 && echo "   (aviso) pg_restore aceptó el respaldo alterado: la protección es el checksum" || echo "   pg_restore también rechazó el respaldo alterado"; su postgres -c "psql -q -d postgres -c 'drop database if exists $CORRUPTO with (force)'" >/dev/null 2>&1

echo "3) Restauración en una base NUEVA y distinta ($DESTINO)"
crear $DESTINO; t0=$(ahora); r=$(su postgres -c "pg_restore --no-owner --exit-on-error -d $DESTINO $DUMP" 2>&1); rc=$?; t1=$(ahora)
[ $rc = 0 ] && ok "restauración completada sin errores en $(seg $t0 $t1) s" || mal "pg_restore terminó con código $rc: ${r:0:200}"
echo "RESTAURACION_SEGUNDOS=$(seg $t0 $t1)" >> "$OUT/resultado.txt"
# SOLO PARA DEMOSTRAR que los controles pueden fallar (no es parte del procedimiento real): SIMULAR_FALLO=politica|dato altera a propósito la base restaurada ANTES de compararla.
case "${SIMULAR_FALLO:-}" in
  politica) sql $DESTINO "do \$\$ declare r record; begin select policyname, tablename into r from pg_policies where schemaname = 'public' and policyname like 'sesion_activa_%' limit 1; execute format('drop policy %I on public.%I', r.policyname, r.tablename); end \$\$;" >/dev/null; echo "   (SIMULAR_FALLO=politica: se eliminó una política RLS de la base restaurada)";;
  dato) sql $DESTINO "update clinicas set nombre = nombre || ' (alterada)' where id = '$A'" >/dev/null; echo "   (SIMULAR_FALLO=dato: se alteró un dato de la base restaurada)";;
esac
huella $DESTINO > "$OUT/huella_destino.txt"
for c in F P T C G R K I V N; do a=$(grep "^$c|" "$OUT/huella_origen.txt"); b=$(grep "^$c|" "$OUT/huella_destino.txt"); nombre=$(case $c in F) echo "funciones";; P) echo "políticas RLS";; T) echo "disparadores";; C) echo "restricciones (incluidas las NOT VALID)";; G) echo "privilegios de tablas";; R) echo "RLS activado por tabla";; K) echo "columnas";; I) echo "índices";; V) echo "vistas";; N) echo "recuentos de objetos";; esac); [ "$a" = "$b" ] && ok "$nombre idénticos al origen" || mal "$nombre DIFIEREN del origen"; done
dif=$(diff <(grep '^D|' "$OUT/huella_origen.txt") <(grep '^D|' "$OUT/huella_destino.txt") | grep -c '^[<>]'); [ "$dif" = 0 ] && ok "los DATOS de todas las tablas (public, auth, storage) son idénticos fila por fila (huella por tabla)" || mal "$dif tablas con datos distintos"

echo "4) Controles funcionales sobre la base RESTAURADA"
cat > "$W/funcional.sql" << SQL
\\set ON_ERROR_STOP off
create or replace function pg_temp.como(p_uid uuid, p_sql text) returns text language plpgsql as \$\$
declare v text; begin perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  begin execute p_sql into v; reset role; return v; exception when others then reset role; return 'ERR ' || sqlstate; end; end \$\$;
select 'V1|' || pg_temp.como('d2000000-0000-0000-0000-000000000001', 'select count(*) from pacientes where clinica_id = ''$B''') || '|' || pg_temp.como('d2000000-0000-0000-0000-000000000001', 'select count(*) from pacientes where clinica_id = ''$A''');
select 'V2|' || pg_temp.como('d2000000-0000-0000-0000-000000000004', 'select count(*) from pacientes where clinica_id = ''$A''') || '|' || pg_temp.como('d2000000-0000-0000-0000-000000000004', 'select count(*) from pacientes where clinica_id = ''$B''');
select 'V3|' || pg_temp.como('d2000000-0000-0000-0000-000000000003', 'select count(*) from pacientes') || '|' || pg_temp.como('d2000000-0000-0000-0000-000000000003', 'select debe_cambiar_password::text from usuarios where id = auth.uid()');
select 'V4|' || pg_temp.como('d2000000-0000-0000-0000-000000000002', \$q\$select (fn_finalizar_consulta(p_cita => 'a2000000-0000-0000-0000-00000000000a', p_motivo => 'Dolor', p_nota => jsonb_build_object('id', 'f2000000-0000-0000-0000-0000000000a1', 'contenido', 'Consulta sintética tras restaurar', 'diagnostico', 'Caries'), p_seguimiento => jsonb_build_object('id', 'f2000000-0000-0000-0000-0000000000a2', 'inicio', '2031-08-01T10:00:00Z', 'fin', '2031-08-01T10:30:00Z', 'motivo', 'Control')) ->> 'ok')\$q\$);
select 'V5|' || pg_temp.como('d2000000-0000-0000-0000-000000000002', \$q\$select (fn_finalizar_consulta(p_cita => 'a2000000-0000-0000-0000-00000000000a', p_motivo => 'Dolor', p_nota => jsonb_build_object('id', 'f2000000-0000-0000-0000-0000000000a1', 'contenido', 'Consulta sintética tras restaurar', 'diagnostico', 'Caries'), p_seguimiento => jsonb_build_object('id', 'f2000000-0000-0000-0000-0000000000a2', 'inicio', '2031-08-01T10:00:00Z', 'fin', '2031-08-01T10:30:00Z', 'motivo', 'Control')) ->> 'ya_finalizada')\$q\$);
select 'V6|' || (select count(*) from notas_clinicas where cita_id = 'a2000000-0000-0000-0000-00000000000a');
select 'V7|' || fn_plazo_expediente_anios() || '|' || (select count(*) from retenciones_legales where liberada_en is null) || '|' || (select count(*) from politicas_conservacion where eliminacion_automatica) || '|' || (select count(*) from conservacion_historial);
select 'V8|' || (select count(*) from fotografias f where not exists (select 1 from storage.objects o where o.name = f.url_storage)) || '|' || (select count(*) from documentos_clinicos d where not exists (select 1 from storage.objects o where o.name = d.url_storage));
select 'V9|' || (select count(*) from usuarios u join auth.users a on a.id = u.id) || '|' || (select count(*) from usuarios u where not exists (select 1 from auth.users a where a.id = u.id)) || '|' || (select count(*) from usuarios u join clinicas c on c.id = u.clinica_id);
select 'V11|' || coalesce((select documento_version || '|' || to_char(aceptado_en at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') || '|' || metodo from legal_acceptances where metodo = 'ensayo'), 'SIN FILA');
select 'V10|' || pg_temp.como('d2000000-0000-0000-0000-000000000001', 'select count(*) from conservacion_historial');
SQL
chmod 644 "$W/funcional.sql"; su postgres -c "psql -q -At -d $DESTINO -f $W/funcional.sql" 2>&1 | grep -E '^V[0-9]+\|' > "$OUT/controles_funcionales.txt"
v() { grep "^$1|" "$OUT/controles_funcionales.txt" | cut -d'|' -f2-; }
nA=$(sql $ORIGEN "select count(*) from pacientes where clinica_id = '$A'"); nB=$(sql $ORIGEN "select count(*) from pacientes where clinica_id = '$B'")
[ "$(v V1)" = "0|$nA" ] && ok "aislamiento: el propietario de A ve sus $nA pacientes y 0 de la clínica B" || mal "aislamiento A→B: $(v V1)"
[ "$(v V2)" = "0|$nB" ] && ok "aislamiento: el propietario de B ve sus $nB pacientes y 0 de la clínica A" || mal "aislamiento B→A: $(v V2)"
[ "$(v V3)" = "0|true" ] && ok "el usuario con cambio de contraseña pendiente SIGUE restringido tras restaurar (0 pacientes, indicador conservado)" || mal "cambio pendiente: $(v V3)"
[ "$(v V4)" = "true" ] && [ "$(v V6)" = "1" ] && ok "una consulta clínica sintética se finaliza en la base restaurada y deja UNA nota" || mal "consulta clínica: ok=$(v V4) notas=$(v V6)"
[ "$(v V5)" = "true" ] && ok "repetir la finalización es idempotente (ya_finalizada, sin duplicar)" || mal "idempotencia: $(v V5)"
[ "$(v V7 | cut -d'|' -f1-3)" = "6|1|0" ] && ok "política de conservación restaurada (plazo 6), retención legal activa conservada y ninguna eliminación automática" || mal "conservación: $(v V7)"
[ "$(v V8)" = "0|0" ] && ok "referencias a archivos: 0 fotografías y 0 documentos apuntan a un objeto de Storage inexistente (metadatos)" || mal "referencias huérfanas: $(v V8)"
[ "$(v V9 | cut -d'|' -f2)" = "0" ] && ok "todos los usuarios de la aplicación tienen su cuenta de Auth y su clínica ($(v V9 | cut -d'|' -f1) usuarios)" || mal "usuarios sin cuenta de Auth: $(v V9)"
[ "$(v V11)" = "0.2-borrador|2026-01-02 03:04:05|ensayo" ] && ok "la evidencia de aceptación legal (versión anterior, fecha original) se conserva TAL CUAL al restaurar" || mal "evidencia de aceptación alterada o ausente: $(v V11)"
[ "$(v V10)" = "ERR 42501" ] && ok "un propietario NO puede leer el historial de conservación (sin acceso para usuarios)" || mal "acceso al historial: $(v V10)"
marc=$(su postgres -c "psql -q -At -d $DESTINO -f $RAIZ/verificacion/marcadores_de_migraciones_solo_lectura.sql" 2>&1 | grep -c '|f$'); [ "$marc" = "0" ] && ok "marcadores de migraciones 085–106: todos aplicados en la base restaurada" || mal "$marc marcadores de migración en false tras restaurar"
lineas=$(su postgres -c "pg_restore -f - $DUMP" 2>/dev/null | wc -l); [ "$lineas" -gt 1000 ] || mal "el análisis de secretos no pudo leer el respaldo ($lineas líneas)"
sec=$(su postgres -c "pg_restore -f - $DUMP" 2>/dev/null | grep -cE 'eyJ[A-Za-z0-9_-]{15,}\.eyJ|-----BEGIN [A-Z ]*PRIVATE KEY|sb(p|_secret)_[A-Za-z0-9]{20,}|re_[A-Za-z0-9]{20,}'); [ "$sec" = "0" ] && [ "$lineas" -gt 1000 ] && ok "el respaldo ($lineas líneas de SQL leídas) no contiene secretos reconocibles (JWT, claves privadas, claves sbp_/re_)" || mal "$sec coincidencias de posibles secretos en el respaldo"

echo "5) Limpieza (las bases del ensayo son desechables)"
if [ -n "${CONSERVAR:-}" ]; then echo "  (CONSERVAR=1: se conservan las bases $ORIGEN y $DESTINO y $W para inspección; elimínalas después)"; else su postgres -c "psql -q -d postgres -c 'drop database if exists $ORIGEN with (force)' -c 'drop database if exists $DESTINO with (force)'" >/dev/null 2>&1; rm -rf "$W"; ok "bases del ensayo y respaldo temporal eliminados"; fi
echo "FALLOS=$fallos" >> "$OUT/resultado.txt"; echo; [ "$fallos" = 0 ] && echo "RESULTADO: ✔ restauración local verificada (evidencia en $OUT)" || echo "RESULTADO: ✘ $fallos comprobaciones fallaron (ver $OUT/resultado.txt)"; exit $fallos
