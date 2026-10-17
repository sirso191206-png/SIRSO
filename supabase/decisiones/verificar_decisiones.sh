#!/bin/bash
# Prueba de extremo a extremo de los scripts de decisión sobre una base DESECHABLE `siro_test` con las migraciones aplicadas:
# sin valores o con valores inválidos NO escriben nada; con valores válidos los escriben y la base los interpreta (fn_politica_anios, fn_config_horas_positivas).
# Uso: ./verificar_decisiones.sh <ruta/a/supabase>
D=${1:?ruta a supabase}; BD=siro_test; Q() { su postgres -c "psql -q -At -d $BD $*"; }; fallo=0
# QV: pasa los argumentos CITADOS (printf %q) para poder probar valores hostiles (con ; ' espacios) sin que el shell los interprete.
QV() { su postgres -c "$(printf '%q ' psql -q -At -d $BD "$@")"; }
Q -c "\"select 1 from plataforma_config limit 1\"" >/dev/null 2>&1 || { echo "✘ No hay PostgreSQL alcanzable o la base '$BD' no tiene las migraciones"; exit 2; }
chmod a+r $D/decisiones/*.sql
Q -c "\"delete from plataforma_config where clave in ('retencion_expediente_anios','retencion_fiscal_anios','retencion_contractual_anios','nota_retrofecha_max_horas')\"" >/dev/null
cnt() { Q -c "\"select count(*) from plataforma_config where clave in ('retencion_expediente_anios','retencion_fiscal_anios','retencion_contractual_anios','nota_retrofecha_max_horas')\""; }
chk() { # $1=descripción $2=esperado-escribe(0/1) resto=argumentos de psql
  local d=$1 esp=$2; shift 2; local antes=$(cnt); QV "$@" >/tmp/dec_out.txt 2>&1; local despues=$(cnt)
  if [ "$esp" = "0" ]; then [ "$antes" = "$despues" ] && grep -q "No se escribió nada" /tmp/dec_out.txt && echo "  ✔ $d → no escribió nada y lo explicó" || { echo "  ✘ $d: escribió o no avisó ($antes → $despues)"; fallo=1; }
  else [ "$despues" -gt "$antes" ] && echo "  ✔ $d → escribió" || { echo "  ✘ $d no escribió"; fallo=1; }; fi; }
C=$D/decisiones/aplicar_politicas_conservacion.sql; R=$D/decisiones/aplicar_limite_retrofecha.sql
echo "políticas de conservación:"; chk "sin ningún valor" 0 -f $C; chk "falta fiscal" 0 -v expediente=5 -f $C; chk "falta expediente" 0 -v fiscal=7 -f $C
for v in abc 0 -5 1.5 1000 "" "5 años" "5;drop table clinicas" "5' or '1'='1"; do chk "expediente='$v'" 0 -v "expediente=$v" -v fiscal=7 -f $C; done; chk "fiscal inválido" 0 -v expediente=5 -v fiscal=x -f $C; chk "contractual inválido" 0 -v expediente=5 -v fiscal=7 -v contractual=0 -f $C
chk "valores válidos (EJEMPLO DE PRUEBA, no una recomendación legal)" 1 -v expediente=6 -v fiscal=8 -v contractual=4 -f $C
[ "$(Q -c "\"select fn_politica_anios('retencion_expediente_anios') || ',' || fn_politica_anios('retencion_fiscal_anios') || ',' || fn_politica_anios('retencion_contractual_anios')\"")" = "6,8,4" ] && echo "  ✔ la base interpreta los valores (6,8,4)" || { echo "  ✘ la base no los interpreta"; fallo=1; }
QV -v expediente=7 -v fiscal=8 -f $C >/dev/null 2>&1; [ "$(Q -c "\"select fn_politica_anios('retencion_expediente_anios')\"")" = "7" ] && echo "  ✔ re-ejecutar REEMPLAZA el valor (7), no lo duplica ($(Q -c "\"select count(*) from plataforma_config where clave = 'retencion_expediente_anios'\"") fila)" || { echo "  ✘ no se reemplazó"; fallo=1; }
echo "límite de retrofecha:"; Q -c "\"delete from plataforma_config where clave = 'nota_retrofecha_max_horas'\"" >/dev/null
chk "sin horas" 0 -f $R; for v in abc 0 -5 1.5 1234567 "" "72 horas" "1;delete from pacientes"; do chk "horas='$v'" 0 -v "horas=$v" -f $R; done
chk "horas válidas (EJEMPLO DE PRUEBA)" 1 -v horas=72 -f $R; [ "$(Q -c "\"select fn_config_horas_positivas('nota_retrofecha_max_horas')\"")" = "72" ] && echo "  ✔ la base interpreta el límite (72)" || { echo "  ✘ la base no lo interpreta"; fallo=1; }
Q -f $D/decisiones/quitar_limite_retrofecha.sql >/dev/null 2>&1; [ "$(Q -c "\"select coalesce(fn_config_horas_positivas('nota_retrofecha_max_horas')::text, 'sin límite')\"")" = "sin límite" ] && echo "  ✔ quitar el límite vuelve a «sin límite»" || { echo "  ✘ no se quitó"; fallo=1; }
Q -c "\"delete from plataforma_config where clave in ('retencion_expediente_anios','retencion_fiscal_anios','retencion_contractual_anios','nota_retrofecha_max_horas')\"" >/dev/null
[ $fallo = 0 ] && echo "RESULTADO: ✔ scripts de decisión verificados" || echo "RESULTADO: ✘ hay hallazgos"; exit $fallo
