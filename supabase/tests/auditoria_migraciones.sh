#!/bin/bash
# Auditoría ejecutable de las migraciones 085–106 sobre una base DESECHABLE de pruebas. Comprueba, con evidencia:
#   1) que cada migración se aplica SIN error, en orden (ON_ERROR_STOP);
#   2) que re-ejecutar 085–106 (dos veces) no da error y NO cambia el esquema (funciones, políticas, triggers, privilegios);
#   3) que aplicarlas sobre una base CON DATOS no modifica ni borra NINGUNA fila de NINGUNA tabla (hash de contenido antes/después);
#   4) la matriz de privilegios de las funciones nuevas.
# Uso: ./auditoria_migraciones.sh <ruta/a/supabase>     (usa la base `siro_test`; la reconstruye)
D=${1:?ruta a supabase}; MIG=$D/migrations; TESTS=$D/tests; BD=siro_test
q() { su postgres -c "psql -q -At -d $BD $*"; }
# GUARDIA (fase 6): sin PostgreSQL alcanzable el guion NO debe dar «0 errores». Una conexión rechazada, un archivo ilegible o una base sin construir son FALLOS.
su postgres -c "psql -q -At -d postgres -c 'select 1'" >/dev/null 2>&1 || { echo "✘ No hay PostgreSQL alcanzable: arráncalo antes de auditar (service postgresql start). No se ejecutó nada."; exit 2; }
reconstruir() { su postgres -c "psql -q -d postgres -c 'drop database if exists $BD with (force)' -c 'create database $BD'" >/dev/null 2>&1; q -f $TESTS/supabase_stub.sql >/dev/null 2>&1; }
aplicar() { # $1=desde $2=hasta ; imprime los archivos con error (ignorando 007, preexistente)
  local mal=0; for f in $(ls $MIG/*.sql | sort); do n=$((10#$(basename $f | cut -c1-3))); [ $n -lt $1 ] || [ $n -gt $2 ] && continue
    chmod a+r $f; salida=$(su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $BD -f $f" 2>&1); rc=$?; [ $rc -ne 0 ] && { echo "   FALLA $(basename $f) (código $rc): $(echo "$salida" | grep -m1 -E 'ERROR|error' | cut -c1-150)"; mal=$((mal+1)); }; done; return $mal; }
verificar_base() { n=$(q -c "\"select count(*) from information_schema.tables where table_schema='public'\"" 2>/dev/null); [ -n "$n" ] && [ "$n" -gt 30 ] 2>/dev/null || { echo "✘ La base no se construyó (tablas en public: '${n}'). Resultado NO válido."; exit 2; }; echo "   base construida: $n tablas en public"; }
cat > /tmp/huella_esquema.sql << 'SQL'
select md5(string_agg(x, E'\n' order by x)) from (
  select 'F|' || p.oid::regprocedure || '|' || md5(pg_get_functiondef(p.oid)) || '|' || coalesce(p.proacl::text, '') as x from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind in ('f','p')
  union all select 'P|' || schemaname || '.' || tablename || '.' || policyname || '|' || permissive || '|' || cmd || '|' || roles::text || '|' || coalesce(qual,'') || '|' || coalesce(with_check,'') from pg_policies where schemaname in ('public','storage')
  union all select 'T|' || tgrelid::regclass || '.' || tgname || '|' || md5(pg_get_triggerdef(t.oid)) from pg_trigger t join pg_class c on c.oid = t.tgrelid where not tgisinternal and c.relnamespace = 'public'::regnamespace
  union all select 'G|' || table_name || '|' || grantee || '|' || privilege_type from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon','authenticated','public')
  union all select 'C|' || conrelid::regclass || '|' || conname || '|' || pg_get_constraintdef(oid) || '|' || convalidated from pg_constraint where connamespace = 'public'::regnamespace and contype = 'c') s
SQL
cat > /tmp/huella_datos.sql << 'SQL'
do $$ declare r record; h text; salida text := ''; begin
  for r in select schemaname, tablename from pg_tables where schemaname in ('public') or (schemaname = 'storage' and tablename = 'objects') or (schemaname = 'auth' and tablename = 'users') order by 1, 2 loop
    -- Se excluye SOLO la columna nueva `debe_cambiar_password` (103: NOT NULL DEFAULT false, que sí aparecería en el JSON de cada fila); que ningún usuario existente quedó marcado se comprueba aparte.
    -- jsonb_strip_nulls: añadir una columna NULLABLE (p. ej. 097) no cambia el hash, pero cualquier valor modificado sí. La ÚNICA fila que una migración escribe es la
    -- instantánea de rollback de la 095 en plataforma_config (clave rollback_095_privilegios): se excluye por su nombre exacto.
    execute format('select md5(coalesce(string_agg(jsonb_strip_nulls(to_jsonb(t) - ''debe_cambiar_password'')::text, ''|'' order by jsonb_strip_nulls(to_jsonb(t) - ''debe_cambiar_password'')::text), '''')) || '':'' || count(*) from %I.%I t %s', r.schemaname, r.tablename, case when r.schemaname = 'public' and r.tablename = 'plataforma_config' then 'where t.clave <> ''rollback_095_privilegios''' else '' end) into h;
    salida := salida || r.schemaname || '.' || r.tablename || '=' || h || E'\n'; end loop;
  create temp table if not exists _h (t text); delete from _h; insert into _h select unnest(string_to_array(salida, E'\n')); end $$;
select t from _h where t <> '' order by t;
SQL
chmod a+r /tmp/huella_esquema.sql /tmp/huella_datos.sql; fallo=0
echo "== 1) ORDEN: cada migración 001–106 se aplica en orden, con ON_ERROR_STOP =="; reconstruir; aplicar 1 106; echo "   migraciones con error: $? (esperado 0: desde la fase 6 la 007 ya no depende de la 040; SIN ningún parche manual previo)"
echo "== 2) REPETIBILIDAD: re-ejecutar 085–106 dos veces =="
verificar_base; H1=$(q -f /tmp/huella_esquema.sql); [ -n "$H1" ] || { echo "✘ huella vacía: resultado NO válido"; exit 2; }; aplicar 85 106; e1=$?; aplicar 85 106; e2=$?; H2=$(q -f /tmp/huella_esquema.sql)
echo "   errores en la 2.ª y 3.ª ejecución: $e1 y $e2 (esperado 0 y 0)"; [ "$e1$e2" = "00" ] || fallo=1
[ "$H1" = "$H2" ] && echo "   huella del esquema idéntica antes y después ($H1): funciones, políticas, triggers y privilegios NO cambian" || { echo "   ✘ el esquema CAMBIÓ al re-ejecutar ($H1 → $H2)"; fallo=1; }
echo "== 3) DATOS: aplicar 085–106 sobre una base con datos no modifica ni borra ninguna fila =="
reconstruir; aplicar 1 84 >/dev/null; chmod a+r $TESTS/deno/semilla_deno.sql; q -f $TESTS/deno/semilla_deno.sql >/dev/null 2>&1
# (fase final) Instantánea de legal_documents ANTES de aplicar: las migraciones 105 y 106 añaden versiones nuevas y desactivan las activas (así funciona el versionado); no debe tocar nada más.
printf 'create table public.zz_legal_antes as select * from public.legal_documents;\n' > /tmp/legal_snap.sql; chmod a+r /tmp/legal_snap.sql; q -f /tmp/legal_snap.sql >/dev/null 2>&1
verificar_base; q -f /tmp/huella_datos.sql > /tmp/datos_antes.txt; n_tablas=$(wc -l < /tmp/datos_antes.txt); [ "$n_tablas" -gt 20 ] || { echo "✘ solo $n_tablas tablas con huella: resultado NO válido"; exit 2; }; filas=$(grep -oE ':[0-9]+$' /tmp/datos_antes.txt | tr -d ':' | paste -sd+ | bc)
aplicar 85 106; e3=$?; q -f /tmp/huella_datos.sql > /tmp/datos_despues.txt
# (fase final) Se comparan las tablas que YA EXISTÍAN (las nuevas se listan aparte) y legal_documents se comprueba por separado: sus filas originales deben seguir idénticas salvo `activo`.
cut -d= -f1 /tmp/datos_antes.txt | sort > /tmp/tablas_antes.txt; cut -d= -f1 /tmp/datos_despues.txt | sort > /tmp/tablas_despues.txt
echo "   tablas NUEVAS creadas por las migraciones (informativo): $(comm -13 /tmp/tablas_antes.txt /tmp/tablas_despues.txt | tr '\n' ' ')"
awk -F= 'NR==FNR { existe[$1] = 1; next } ($1 in existe) && $1 != "public.legal_documents"' /tmp/datos_antes.txt /tmp/datos_despues.txt > /tmp/datos_despues_f.txt; grep -v '^public\.legal_documents=' /tmp/datos_antes.txt > /tmp/datos_antes_f.txt
[ -s /tmp/datos_antes_f.txt ] && [ "$(wc -l < /tmp/datos_antes_f.txt)" = "$(wc -l < /tmp/datos_despues_f.txt)" ] || { echo "   ✘ el filtro de tablas no es coherente (antes: $(wc -l < /tmp/datos_antes_f.txt), después: $(wc -l < /tmp/datos_despues_f.txt)): resultado NO válido"; exit 2; }
cp /tmp/datos_antes_f.txt /tmp/datos_antes.txt; cp /tmp/datos_despues_f.txt /tmp/datos_despues.txt
printf "select (select count(*) from public.zz_legal_antes) || '|' || (select count(*) from public.zz_legal_antes a join public.legal_documents l on l.id = a.id and (to_jsonb(a) - 'activo') = (to_jsonb(l) - 'activo')) || '|' || (select count(*) from public.legal_documents);\n" > /tmp/legal_chk.sql; chmod a+r /tmp/legal_chk.sql; LEG=$(q -f /tmp/legal_chk.sql | tail -1)
printf "select count(*) from public.usuarios where debe_cambiar_password;\n" > /tmp/usr_chk.sql; chmod a+r /tmp/usr_chk.sql; MARC=$(q -f /tmp/usr_chk.sql | tail -1)
[ "$MARC" = "0" ] && echo "   ✔ usuarios: tras aplicar la 103 NINGÚN usuario existente quedó marcado con el cambio de contraseña pendiente (valor por omisión false)" || { echo "   ✘ usuarios: $MARC usuarios existentes quedaron marcados"; fallo=1; }
if [ "$(echo "$LEG" | cut -d'|' -f1)" = "$(echo "$LEG" | cut -d'|' -f2)" ] && [ "$(echo "$LEG" | cut -d'|' -f1)" -gt 0 ]; then echo "   ✔ legal_documents: las $(echo "$LEG" | cut -d'|' -f1) filas originales siguen idénticas salvo su indicador activo; ahora hay $(echo "$LEG" | cut -d'|' -f3) versiones (las nuevas se AÑADEN, nada se borra)"; else echo "   ✘ legal_documents: las filas originales cambiaron o no se pudo comprobar ($LEG)"; fallo=1; fi
if diff -q /tmp/datos_antes.txt /tmp/datos_despues.txt >/dev/null && [ "$e3" = "0" ]; then echo "   ✔ $n_tablas tablas, $filas filas: el contenido (hash por tabla) es IDÉNTICO antes y después; las migraciones no borraron ni cambiaron ningún dato"; else echo "   ✘ DIFERENCIAS:"; diff /tmp/datos_antes.txt /tmp/datos_despues.txt | head; fallo=1; fi
echo "== 4) PRIVILEGIOS de las funciones de 085–106 (SECURITY DEFINER, search_path y quién puede ejecutarlas) =="
q -c "\"select rpad(p.proname, 34) || ' secdef=' || p.prosecdef || ' search_path=' || coalesce((select option_value from pg_options_to_table(p.proconfig) where option_name='search_path'),'(sin fijar)') || ' | public=' || has_function_privilege('public',p.oid,'EXECUTE') || ' anon=' || has_function_privilege('anon',p.oid,'EXECUTE') || ' authenticated=' || has_function_privilege('authenticated',p.oid,'EXECUTE') || ' service_role=' || has_function_privilege('service_role',p.oid,'EXECUTE') from pg_proc p where p.proname in ('fn_finalizar_consulta','fn_completar_consulta_pendiente','fn_consultas_sin_nota','fn_eliminar_clinica','fn_clinica_resumen_eliminacion','fn_limpieza_pendiente_clinica','fn_registrar_limpieza_clinica','fn_registrar_intento_eliminacion','fn_politica_anios','fn_validar_nota_cita','fn_bloquear_completar_cita_directo','fn_validar_autoria_nota','fn_validar_referencias_cita','fn_config_horas_positivas','fn_corregir_estado_cita','fn_proteger_cita_completada','fn_validar_dentista_misma_clinica','fn_validar_tratamiento_mismo_paciente','fn_validar_actor','fn_validar_firmante','fn_config_limite','fn_limitar_frecuencia_contacto','fn_proteger_debe_cambiar_password') order by 1\""
sinsp=$(q -c "\"select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and not exists (select 1 from pg_options_to_table(p.proconfig) where option_name='search_path')\""); echo "   SECURITY DEFINER sin search_path en todo public: $sinsp (esperado 0)"; [ "$sinsp" = "0" ] || fallo=1
[ $fallo = 0 ] && echo "RESULTADO: ✔ auditoría de migraciones superada" || echo "RESULTADO: ✘ hay hallazgos"; exit $fallo
