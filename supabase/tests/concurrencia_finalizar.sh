#!/bin/bash
# Doble clic REAL: dos sesiones de PostgreSQL ejecutan fn_finalizar_consulta a la vez sobre la MISMA cita, con los mismos ids.
# La primera retiene su transacción 2 s; la segunda debe BLOQUEARSE en el FOR UPDATE de la cita, esperar, y al entrar responder
# "ya_finalizada" verificado. Debe quedar UNA nota y UN seguimiento. Uso (sobre una base de pruebas con las migraciones):
#   ./concurrencia_finalizar.sh [base=siro_test]      — escribe datos (con COMMIT): usar solo en una base desechable.
BD=${1:-siro_test}; D=/tmp/concurrencia_$$; mkdir -p $D; chmod 777 $D
q() { su postgres -c "psql -q -At -d $BD $*"; }
# GUARDIA (fase 6): sin una base con las migraciones aplicadas este guion NO debe dar resultados.
q -c "\"select 1 from public.notas_clinicas limit 1\"" >/dev/null 2>&1 || { echo "✘ No hay PostgreSQL alcanzable o la base '$BD' no tiene las migraciones. No se ejecutó nada."; exit 2; }
cat > $D/semilla.sql << 'SQL'
begin;
insert into auth.users (id, email) values ('cc000000-0000-0000-0000-000000000001','cc1@x.mx');
insert into clinicas (id, nombre) values ('cc000000-0000-0000-0000-0000000000a1','Clínica CC');
select fn_asignar_plan_interno(null, 'cc000000-0000-0000-0000-0000000000a1', 'empresarial', 'mensual');
insert into usuarios (id, clinica_id, nombre, correo, rol) values ('cc000000-0000-0000-0000-000000000001','cc000000-0000-0000-0000-0000000000a1','Dentista CC','cc1@x.mx','dentista');
insert into pacientes (id, clinica_id, nombre_completo, dentista_responsable_id) values ('cc000000-0000-0000-0000-0000000000b1','cc000000-0000-0000-0000-0000000000a1','Paciente CC','cc000000-0000-0000-0000-000000000001');
insert into citas (id, paciente_id, dentista_id, inicio, fin, estado) values ('cc000000-0000-0000-0000-0000000000c1','cc000000-0000-0000-0000-0000000000b1','cc000000-0000-0000-0000-000000000001','2034-01-01 09:00+00','2034-01-01 09:30+00','en_consulta');
commit;
SQL
LLAMADA="select fn_finalizar_consulta('cc000000-0000-0000-0000-0000000000c1'::uuid, 'Dolor', '{\"id\":\"cc000000-0000-0000-0000-0000000000d1\",\"contenido\":\"Se atendió\"}'::jsonb, '{\"id\":\"cc000000-0000-0000-0000-0000000000e1\",\"inicio\":\"2034-02-01T10:00:00Z\",\"fin\":\"2034-02-01T10:30:00Z\"}'::jsonb)::text;"
sesion() { # $1 = segundos de retención
  cat << SQL
begin;
select set_config('request.jwt.claims', '{"sub":"cc000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
$LLAMADA
select pg_sleep($1);
commit;
SQL
}
chmod a+r $D/semilla.sql; q -f $D/semilla.sql || { echo "✘ no se pudo sembrar"; exit 2; }
sesion 2 > $D/s1.sql; sesion 0 > $D/s2.sql; chmod a+r $D/*.sql
t0=$(date +%s%N)
( q -f $D/s1.sql > $D/o1.txt 2>&1 ) &
sleep 0.6
t1=$(date +%s%N)
( q -f $D/s2.sql > $D/o2.txt 2>&1; date +%s%N > $D/fin2 ) &
wait
espera=$(( ($(cat $D/fin2) - t1) / 1000000 ))
notas=$(q -c "\"select count(*) from notas_clinicas where cita_id = 'cc000000-0000-0000-0000-0000000000c1'\"")
segs=$(q -c "\"select count(*) from citas where paciente_id = 'cc000000-0000-0000-0000-0000000000b1' and id <> 'cc000000-0000-0000-0000-0000000000c1'\"")
ya1=$(grep -c '"ya_finalizada": false' $D/o1.txt); ya2=$(grep -c '"ya_finalizada": true' $D/o2.txt)
echo "sesión 1: $(grep -o '"ya_finalizada": [a-z]*' $D/o1.txt | head -1) | sesión 2: $(grep -o '"ya_finalizada": [a-z]*' $D/o2.txt | head -1) (esperó ${espera} ms) | notas=$notas seguimientos=$segs"
fallos=0
[ "$notas" = "1" ] || { echo "✘ debía haber UNA nota"; fallos=1; }
[ "$segs" = "1" ] || { echo "✘ debía haber UN seguimiento"; fallos=1; }
[ "$ya1" = "1" ] || { echo "✘ la sesión 1 debía ser la primera finalización"; fallos=1; }
[ "$ya2" = "1" ] || { echo "✘ la sesión 2 debía responder ya_finalizada"; fallos=1; }
[ "$espera" -ge 1000 ] || { echo "✘ la sesión 2 NO esperó: no se serializaron (esperó ${espera} ms)"; fallos=1; }
grep -q "ERROR" $D/o1.txt $D/o2.txt && { echo "✘ hubo errores"; cat $D/o2.txt; fallos=1; }
[ $fallos = 0 ] && echo "✔ doble clic concurrente: una nota, un seguimiento, la segunda sesión esperó y respondió ya_finalizada"
# ---- Parte 2: dos sesiones COMPLETAN a la vez la misma consulta pendiente (cita ya completada sin nota) ----
cat > $D/semilla2.sql << 'SQL'
insert into citas (id, paciente_id, dentista_id, inicio, fin, estado) values ('cc000000-0000-0000-0000-0000000000c2','cc000000-0000-0000-0000-0000000000b1','cc000000-0000-0000-0000-000000000001','2034-06-01 09:00+00','2034-06-01 09:30+00','completada');
SQL
chmod a+r $D/semilla2.sql; q -f $D/semilla2.sql || { echo "✘ no se pudo sembrar la parte 2"; exit 2; }
LLAMADA2="select fn_completar_consulta_pendiente('cc000000-0000-0000-0000-0000000000c2'::uuid, '{\"id\":\"cc000000-0000-0000-0000-0000000000d2\",\"contenido\":\"Nota pendiente\"}'::jsonb)::text;"
ses2() { printf "begin;\nselect set_config('request.jwt.claims', '{\"sub\":\"cc000000-0000-0000-0000-000000000001\",\"role\":\"authenticated\"}', true);\nset local role authenticated;\n%s\nselect pg_sleep(%s);\ncommit;\n" "$LLAMADA2" "$1"; }
ses2 2 > $D/p1.sql; ses2 0 > $D/p2.sql; chmod a+r $D/*.sql
( q -f $D/p1.sql > $D/po1.txt 2>&1 ) & sleep 0.6; t1=$(date +%s%N); ( q -f $D/p2.sql > $D/po2.txt 2>&1; date +%s%N > $D/fin3 ) & wait
espera2=$(( ($(cat $D/fin3) - t1) / 1000000 )); notas2=$(q -c "\"select count(*) from notas_clinicas where cita_id = 'cc000000-0000-0000-0000-0000000000c2'\"")
echo "recuperación: sesión 1: $(grep -o '"ya_existia": [a-z]*' $D/po1.txt | head -1) | sesión 2: $(grep -o '"ya_existia": [a-z]*' $D/po2.txt | head -1) (esperó ${espera2} ms) | notas=$notas2"
[ "$notas2" = "1" ] || { echo "✘ la recuperación concurrente debía dejar UNA nota"; fallos=1; }
grep -q '"ya_existia": false' $D/po1.txt && grep -q '"ya_existia": true' $D/po2.txt || { echo "✘ la 2.ª sesión debía responder ya_existia=true"; fallos=1; }
[ "$espera2" -ge 1000 ] || { echo "✘ las sesiones NO se serializaron (esperó ${espera2} ms)"; fallos=1; }
grep -q "ERROR" $D/po1.txt $D/po2.txt && { echo "✘ hubo errores"; fallos=1; }
[ $fallos = 0 ] && echo "✔ recuperación concurrente: una sola nota, la segunda sesión esperó y respondió ya_existia"
rm -rf $D; exit $fallos
