-- AISLAMIENTO ENTRE CLÍNICAS (clínica A → clínica B), por rol, bajo RLS real.
-- Cada rol de A debe VER lo suyo (control positivo) y NADA de B, ni leer, ni modificar, ni borrar, ni
-- insertar apuntando a B. Incluye Storage (archivos clínicos y logos) y un barrido genérico de TODAS las
-- tablas y vistas con clinica_id / paciente_id. Una transacción con ROLLBACK.
\set ON_ERROR_STOP on
\set QUIET on
begin;
create temp table _res (ok boolean, nombre text);
create function pg_temp.t(p_nombre text, p_cond boolean) returns void language plpgsql as $$
begin insert into _res values (coalesce(p_cond,false), p_nombre); raise notice '% %', case when coalesce(p_cond,false) then 'PASS' else 'FAIL' end, p_nombre; end $$;
create function pg_temp.val(p_uid uuid, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin execute p_sql into v; reset role; return v;
  exception when others then reset role; return 'ERR|'||sqlstate; end;
end $$;
create function pg_temp.como(p_uid uuid, p_sql text) returns text language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin execute p_sql; get diagnostics n = row_count; reset role; return 'OK:'||n;
  exception when others then reset role; return 'ERR|'||sqlstate; end;
end $$;

-- ---------- Datos: dos clínicas con todo ----------
insert into auth.users (id, email) select ('a6000000-0000-0000-0000-0000000000'||lpad(g::text,2,'0'))::uuid, 'u'||g||'@x.mx' from generate_series(1,8) g;
insert into clinicas (id, nombre) values ('c6000000-0000-0000-0000-00000000000a','Clínica A'),('c6000000-0000-0000-0000-00000000000b','Clínica B');
select fn_asignar_plan_interno(null,'c6000000-0000-0000-0000-00000000000a','empresarial','mensual'), fn_asignar_plan_interno(null,'c6000000-0000-0000-0000-00000000000b','empresarial','mensual');
insert into usuarios (id, clinica_id, nombre, correo, rol) values
 ('a6000000-0000-0000-0000-000000000001','c6000000-0000-0000-0000-00000000000a','Owner A','u1@x.mx','owner'),
 ('a6000000-0000-0000-0000-000000000002','c6000000-0000-0000-0000-00000000000a','Dentista A','u2@x.mx','dentista'),
 ('a6000000-0000-0000-0000-000000000003','c6000000-0000-0000-0000-00000000000a','Recepción A','u3@x.mx','recepcion'),
 ('a6000000-0000-0000-0000-000000000004','c6000000-0000-0000-0000-00000000000a','Asistente A','u4@x.mx','asistente'),
 ('a6000000-0000-0000-0000-000000000005','c6000000-0000-0000-0000-00000000000b','Owner B','u5@x.mx','owner'),
 ('a6000000-0000-0000-0000-000000000006','c6000000-0000-0000-0000-00000000000b','Dentista B','u6@x.mx','dentista');
insert into pacientes (id, clinica_id, nombre_completo, dentista_responsable_id) values
 ('b6000000-0000-0000-0000-00000000000a','c6000000-0000-0000-0000-00000000000a','Paciente de A','a6000000-0000-0000-0000-000000000002'),
 ('b6000000-0000-0000-0000-00000000000b','c6000000-0000-0000-0000-00000000000b','Paciente de B','a6000000-0000-0000-0000-000000000006');
create function pg_temp.sembrar(p_pac uuid, p_cl uuid, p_dent uuid) returns void language plpgsql as $$
declare v_exp uuid;
begin
  insert into citas (paciente_id, inicio, fin, dentista_id) values (p_pac, now(), now() + interval '1 hour', p_dent);
  insert into tratamientos (paciente_id, descripcion, costo) values (p_pac, 'Trat', 100);
  insert into pagos (paciente_id, monto) values (p_pac, 50);
  insert into recetas (paciente_id) values (p_pac);
  insert into consentimientos_informados (paciente_id, procedimiento) values (p_pac, 'Extracción');
  insert into fotografias (paciente_id, url_storage) values (p_pac, p_pac||'/f.jpg');
  insert into documentos_clinicos (paciente_id, tipo, nombre, url_storage) values (p_pac, 'estudio', 'Doc', p_pac||'/d.pdf');
  insert into signos_vitales (paciente_id) values (p_pac);
  insert into horarios_bloqueados (clinica_id, tipo, inicio, fin) values (p_cl, 'comida', now(), now() + interval '1 hour');
  insert into lista_espera (clinica_id, paciente_id) values (p_cl, p_pac);
  insert into sucursales (clinica_id, nombre) values (p_cl, 'Sucursal '||p_cl::text);
  select id into v_exp from expedientes where paciente_id = p_pac;
  insert into notas_clinicas (expediente_id, contenido, usuario_id) values (v_exp, 'Nota', p_dent);
  insert into storage.objects (bucket_id, name) values ('fotos-clinicas', p_pac||'/f.jpg'), ('documentos-clinicos', p_pac||'/d.pdf'), ('logos-clinicas', p_cl||'/logo.png');
end $$;
select pg_temp.sembrar('b6000000-0000-0000-0000-00000000000a','c6000000-0000-0000-0000-00000000000a','a6000000-0000-0000-0000-000000000002');
select pg_temp.sembrar('b6000000-0000-0000-0000-00000000000b','c6000000-0000-0000-0000-00000000000b','a6000000-0000-0000-0000-000000000006');
-- Tablas sin clinica_id/paciente_id (se enlazan por sucursal, pieza, usuario o suscripción): se siembran aparte.
create function pg_temp.sembrar2(p_cl uuid, p_pac uuid, p_owner uuid, p_etq text) returns void language plpgsql as $$
declare v_suc uuid; v_con uuid; v_od uuid; v_pe uuid;
begin
  select id into v_suc from sucursales where clinica_id = p_cl limit 1;
  insert into consultorios (sucursal_id, nombre) values (v_suc, 'Consultorio '||p_etq) returning id into v_con;
  insert into sillones (consultorio_id, nombre) values (v_con, 'Sillón '||p_etq);
  insert into sucursal_usuarios (sucursal_id, usuario_id) values (v_suc, p_owner);
  select id into v_od from odontograma_piezas where paciente_id = p_pac order by numero_pieza limit 1;
  insert into odontograma_caras (pieza_id, cara) values (v_od, 'oclusal') on conflict do nothing;
  insert into odontograma_historial (pieza_id, estado_nuevo) values (v_od, 'caries');
  select id into v_pe from periodontograma_piezas where paciente_id = p_pac order by numero_pieza limit 1;
  -- (las caras del odontograma y los sitios del periodontograma ya los crea la base con cada paciente)
  insert into periodontograma_historial (pieza_id, campo, valor_nuevo) values (v_pe, 'sangrado', 'true');
  insert into sesiones_usuario (usuario_id, dispositivo) values (p_owner, 'Dispositivo '||p_etq);
  perform set_config('t.suc_'||p_etq, v_suc::text, false);
  perform set_config('t.con_'||p_etq, v_con::text, false);
  perform set_config('t.od_'||p_etq, v_od::text, false);
  perform set_config('t.pe_'||p_etq, v_pe::text, false);
end $$;
select pg_temp.sembrar2('c6000000-0000-0000-0000-00000000000a','b6000000-0000-0000-0000-00000000000a','a6000000-0000-0000-0000-000000000001','a');
select pg_temp.sembrar2('c6000000-0000-0000-0000-00000000000b','b6000000-0000-0000-0000-00000000000b','a6000000-0000-0000-0000-000000000005','b');
insert into mensajes_contacto (nombre, correo, mensaje) values ('Persona', 'p@x.mx', 'Mensaje del formulario público');
select set_config('t.oa','a6000000-0000-0000-0000-000000000001',false), set_config('t.da','a6000000-0000-0000-0000-000000000002',false),
       set_config('t.ra','a6000000-0000-0000-0000-000000000003',false), set_config('t.aa','a6000000-0000-0000-0000-000000000004',false),
       set_config('t.ob','a6000000-0000-0000-0000-000000000005',false),
       set_config('t.pa','b6000000-0000-0000-0000-00000000000a',false), set_config('t.pb','b6000000-0000-0000-0000-00000000000b',false),
       set_config('t.ca','c6000000-0000-0000-0000-00000000000a',false), set_config('t.cb','c6000000-0000-0000-0000-00000000000b',false);
select set_config('t.eb', (select id::text from expedientes where paciente_id = current_setting('t.pb')::uuid), false);

-- tabla → filtro que identifica filas de la clínica B / de la clínica A (con ids literales, NO subconsultas: bajo RLS una subconsulta vacía haría trivial la prueba)
create temp table _tablas (tabla text, filtro_b text, filtro_a text, positivo boolean default true);
insert into _tablas (tabla, filtro_b, filtro_a) select * from (values
 ('pacientes',                  format('id = %L', current_setting('t.pb')),            format('id = %L', current_setting('t.pa'))),
 ('citas',                      format('paciente_id = %L', current_setting('t.pb')),   format('paciente_id = %L', current_setting('t.pa'))),
 ('tratamientos',               format('paciente_id = %L', current_setting('t.pb')),   format('paciente_id = %L', current_setting('t.pa'))),
 ('pagos',                      format('paciente_id = %L', current_setting('t.pb')),   format('paciente_id = %L', current_setting('t.pa'))),
 ('recetas',                    format('paciente_id = %L', current_setting('t.pb')),   format('paciente_id = %L', current_setting('t.pa'))),
 ('consentimientos_informados', format('paciente_id = %L', current_setting('t.pb')),   format('paciente_id = %L', current_setting('t.pa'))),
 ('fotografias',                format('paciente_id = %L', current_setting('t.pb')),   format('paciente_id = %L', current_setting('t.pa'))),
 ('documentos_clinicos',        format('paciente_id = %L', current_setting('t.pb')),   format('paciente_id = %L', current_setting('t.pa'))),
 ('signos_vitales',             format('paciente_id = %L', current_setting('t.pb')),   format('paciente_id = %L', current_setting('t.pa'))),
 ('expedientes',                format('paciente_id = %L', current_setting('t.pb')),   format('paciente_id = %L', current_setting('t.pa'))),
 ('notas_clinicas',             format('expediente_id = %L', current_setting('t.eb')), format('expediente_id = (select id from expedientes where paciente_id = %L)', current_setting('t.pa'))),
 ('horarios_bloqueados',        format('clinica_id = %L', current_setting('t.cb')),    format('clinica_id = %L', current_setting('t.ca'))),
 ('lista_espera',               format('clinica_id = %L', current_setting('t.cb')),    format('clinica_id = %L', current_setting('t.ca'))),
 ('sucursales',                 format('clinica_id = %L', current_setting('t.cb')),    format('clinica_id = %L', current_setting('t.ca'))),
 ('usuarios',                   format('clinica_id = %L', current_setting('t.cb')),    format('clinica_id = %L', current_setting('t.ca'))),
 ('clinicas',                   format('id = %L', current_setting('t.cb')),            format('id = %L', current_setting('t.ca'))),
 ('suscripciones',              format('clinica_id = %L', current_setting('t.cb')),    format('clinica_id = %L', current_setting('t.ca'))),
 ('auditoria',                  format('clinica_id = %L', current_setting('t.cb')),    format('clinica_id = %L', current_setting('t.ca'))),
 ('consultorios',               format('sucursal_id = %L', current_setting('t.suc_b')), format('sucursal_id = %L', current_setting('t.suc_a'))),
 ('sillones',                   format('consultorio_id = %L', current_setting('t.con_b')), format('consultorio_id = %L', current_setting('t.con_a'))),
 ('sucursal_usuarios',          format('sucursal_id = %L', current_setting('t.suc_b')), format('sucursal_id = %L', current_setting('t.suc_a'))),
 ('odontograma_piezas',         format('paciente_id = %L', current_setting('t.pb')),   format('paciente_id = %L', current_setting('t.pa'))),
 ('odontograma_caras',          format('pieza_id = %L', current_setting('t.od_b')),    format('pieza_id = %L', current_setting('t.od_a'))),
 ('odontograma_historial',      format('pieza_id = %L', current_setting('t.od_b')),    format('pieza_id = %L', current_setting('t.od_a'))),
 ('periodontograma_piezas',     format('paciente_id = %L', current_setting('t.pb')),   format('paciente_id = %L', current_setting('t.pa'))),
 ('periodontograma_sitios',     format('pieza_id = %L', current_setting('t.pe_b')),    format('pieza_id = %L', current_setting('t.pe_a'))),
 ('periodontograma_historial',  format('pieza_id = %L', current_setting('t.pe_b')),    format('pieza_id = %L', current_setting('t.pe_a'))),
 ('sesiones_usuario',           format('usuario_id = %L', 'a6000000-0000-0000-0000-000000000005'), format('usuario_id = %L', 'a6000000-0000-0000-0000-000000000001')),
 ('suscripcion_limites',        format('suscripcion_id in (select id from suscripciones where clinica_id = %L)', current_setting('t.cb')), format('suscripcion_id in (select id from suscripciones where clinica_id = %L)', current_setting('t.ca'))),
 ('suscripcion_funcionalidades',format('suscripcion_id in (select id from suscripciones where clinica_id = %L)', current_setting('t.cb')), format('suscripcion_id in (select id from suscripciones where clinica_id = %L)', current_setting('t.ca')))
) v;
-- Contactos del formulario público: solo el superadmin los lee; ningún owner (ni de A ni de B).
insert into _tablas (tabla, filtro_b, filtro_a, positivo) values ('mensajes_contacto', 'true', 'true', false);

select pg_temp.t('0 hay datos reales de la clínica B en todas las tablas auditadas (si no, las pruebas serían vacías)',
  (select bool_and((xpath('/row/c/text()', query_to_xml(format('select count(*) c from %I where %s', tabla, filtro_b), false, true, '')))[1]::text::int > 0) from _tablas));
select pg_temp.t('0b y los de la clínica A también (control positivo de la siembra)',
  (select bool_and((xpath('/row/c/text()', query_to_xml(format('select count(*) c from %I where %s', tabla, filtro_a), false, true, '')))[1]::text::int > 0) from _tablas where positivo));

-- ============================================================ LECTURA: cada rol de A ve 0 filas de B
create function pg_temp.filas_de_b(p_uid uuid) returns text language plpgsql as $$
declare r record; n text; malas text := '';
begin
  for r in select * from _tablas loop
    n := pg_temp.val(p_uid, format('select count(*)::text from %I where %s', r.tabla, r.filtro_b));
    if n is distinct from '0' then malas := malas || r.tabla || '=' || coalesce(n,'null') || ' '; end if;
  end loop;
  return malas;
end $$;
select pg_temp.t('L1 OWNER de A: 0 filas de B en todas las tablas auditadas — ' || coalesce(nullif(pg_temp.filas_de_b(current_setting('t.oa')::uuid),''),'ninguna'), pg_temp.filas_de_b(current_setting('t.oa')::uuid) = '');
select pg_temp.t('L2 DENTISTA de A: 0 filas de B', pg_temp.filas_de_b(current_setting('t.da')::uuid) = '');
select pg_temp.t('L3 RECEPCIÓN de A: 0 filas de B', pg_temp.filas_de_b(current_setting('t.ra')::uuid) = '');
select pg_temp.t('L4 ASISTENTE de A: 0 filas de B', pg_temp.filas_de_b(current_setting('t.aa')::uuid) = '');
select pg_temp.t('L5 y al revés: el OWNER de B no ve nada de A',
  (select bool_and(pg_temp.val(current_setting('t.ob')::uuid, format('select count(*)::text from %I where %s', tabla, filtro_a)) = '0') from _tablas where positivo));
-- controles positivos: cada rol sí ve lo que le corresponde (si no, "0 de B" no probaría aislamiento)
select pg_temp.t('P1 el OWNER de A SÍ ve lo suyo en todas las tablas donde corresponde (' || (select count(*) from _tablas where positivo) || ')',
  (select bool_and(pg_temp.val(current_setting('t.oa')::uuid, format('select (count(*) > 0)::text from %I where %s', tabla, filtro_a)) = 'true') from _tablas where positivo));
select pg_temp.t('P2 el DENTISTA de A SÍ ve a su paciente asignado, sus citas y su expediente',
  pg_temp.val(current_setting('t.da')::uuid, format('select count(*)::text from pacientes where id = %L', current_setting('t.pa'))) = '1'
  and pg_temp.val(current_setting('t.da')::uuid, format('select count(*)::text from citas where paciente_id = %L', current_setting('t.pa'))) = '1'
  and pg_temp.val(current_setting('t.da')::uuid, format('select count(*)::text from expedientes where paciente_id = %L', current_setting('t.pa'))) = '1');
select pg_temp.t('P3 el dentista de B ve a SU paciente (el aislamiento no es "nadie ve nada")',
  pg_temp.val('a6000000-0000-0000-0000-000000000006', format('select count(*)::text from pacientes where id = %L', current_setting('t.pb'))) = '1');
select pg_temp.t('P4 RECEPCIÓN de A ve pacientes y citas de SU clínica',
  pg_temp.val(current_setting('t.ra')::uuid, format('select count(*)::text from pacientes where id = %L', current_setting('t.pa'))) = '1'
  and pg_temp.val(current_setting('t.ra')::uuid, format('select count(*)::text from citas where paciente_id = %L', current_setting('t.pa'))) = '1');

-- ============================================================ ESCRITURA hacia B
create function pg_temp.escrituras_a_b(p_uid uuid) returns text language plpgsql as $$
declare malas text := ''; r text; s text;
begin
  for s in select unnest(array[
    format('update pacientes set telefono = ''5550000000'' where id = %L', current_setting('t.pb')),
    format('delete from pacientes where id = %L', current_setting('t.pb')),
    format('update citas set motivo_consulta = ''x'' where paciente_id = %L', current_setting('t.pb')),
    format('delete from citas where paciente_id = %L', current_setting('t.pb')),
    format('update pagos set monto = 1 where paciente_id = %L', current_setting('t.pb')),
    format('delete from pagos where paciente_id = %L', current_setting('t.pb')),
    format('update tratamientos set costo = 1 where paciente_id = %L', current_setting('t.pb')),
    format('delete from tratamientos where paciente_id = %L', current_setting('t.pb')),
    format('update clinicas set nombre = ''Secuestrada'' where id = %L', current_setting('t.cb')),
    format('delete from clinicas where id = %L', current_setting('t.cb')),
    format('update usuarios set rol = ''asistente'' where clinica_id = %L', current_setting('t.cb')),
    format('delete from usuarios where clinica_id = %L', current_setting('t.cb')),
    format('update notas_clinicas set contenido = ''x'' where expediente_id = %L', current_setting('t.eb')),
    format('delete from notas_clinicas where expediente_id = %L', current_setting('t.eb')),
    format('update suscripciones set plan = ''empresarial'' where clinica_id = %L', current_setting('t.cb')),
    format('delete from auditoria where clinica_id = %L', current_setting('t.cb')),
    format('delete from recetas where paciente_id = %L', current_setting('t.pb')),
    format('delete from fotografias where paciente_id = %L', current_setting('t.pb')),
    format('delete from documentos_clinicos where paciente_id = %L', current_setting('t.pb'))
  ]) loop
    r := pg_temp.como(p_uid, s);
    -- bien = rechazado (ERR) o 0 filas afectadas (OK:0); mal = tocó filas
    if r not in ('OK:0') and r not like 'ERR|%' then malas := malas || left(s, 40) || '→' || r || '; '; end if;
  end loop;
  return malas;
end $$;
create function pg_temp.inserciones_a_b(p_uid uuid) returns text language plpgsql as $$
declare malas text := ''; r text; s text;
begin
  for s in select unnest(array[
    format('insert into pagos (paciente_id, monto) values (%L, 1)', current_setting('t.pb')),
    format('insert into citas (paciente_id, inicio, fin) values (%L, now(), now() + interval ''1 hour'')', current_setting('t.pb')),
    format('insert into tratamientos (paciente_id, descripcion, costo) values (%L, ''X'', 1)', current_setting('t.pb')),
    format('insert into recetas (paciente_id) values (%L)', current_setting('t.pb')),
    format('insert into notas_clinicas (expediente_id, contenido, usuario_id) values (%L, ''X'', auth.uid())', current_setting('t.eb')),
    format('insert into consentimientos_informados (paciente_id, procedimiento) values (%L, ''X'')', current_setting('t.pb')),
    format('insert into fotografias (paciente_id, url_storage) values (%L, ''x.jpg'')', current_setting('t.pb')),
    format('insert into documentos_clinicos (paciente_id, tipo, nombre, url_storage) values (%L, ''estudio'', ''X'', ''x.pdf'')', current_setting('t.pb')),
    format('insert into signos_vitales (paciente_id) values (%L)', current_setting('t.pb')),
    format('insert into usuarios (id, clinica_id, nombre, correo, rol) values (gen_random_uuid(), %L, ''Intruso'', ''i@x.mx'', ''owner'')', current_setting('t.cb')),
    format('insert into sucursales (clinica_id, nombre) values (%L, ''Intrusa'')', current_setting('t.cb')),
    format('insert into horarios_bloqueados (clinica_id, tipo, inicio, fin) values (%L, ''x'', now(), now() + interval ''1 hour'')', current_setting('t.cb')),
    format('insert into lista_espera (clinica_id, paciente_id) values (%L, %L)', current_setting('t.cb'), current_setting('t.pb')),
    format('insert into suscripciones (clinica_id, plan, modalidad) values (%L, ''empresarial'', ''mensual'')', current_setting('t.cb'))
  ]) loop
    r := pg_temp.como(p_uid, s);
    if r not like 'ERR|%' then malas := malas || left(s, 45) || '→' || r || '; '; end if;
  end loop;
  return malas;
end $$;
select pg_temp.t('E1 OWNER de A: no modifica ni borra NADA de B (19 operaciones) — ' || coalesce(nullif(pg_temp.escrituras_a_b(current_setting('t.oa')::uuid),''),'ninguna filtrada'), pg_temp.escrituras_a_b(current_setting('t.oa')::uuid) = '');
select pg_temp.t('E2 DENTISTA de A: no modifica ni borra nada de B', pg_temp.escrituras_a_b(current_setting('t.da')::uuid) = '');
select pg_temp.t('E3 RECEPCIÓN de A: no modifica ni borra nada de B', pg_temp.escrituras_a_b(current_setting('t.ra')::uuid) = '');
select pg_temp.t('E4 ASISTENTE de A: no modifica ni borra nada de B', pg_temp.escrituras_a_b(current_setting('t.aa')::uuid) = '');
select pg_temp.t('I1 OWNER de A: no puede INSERTAR apuntando a B (14 inserciones) — ' || coalesce(nullif(pg_temp.inserciones_a_b(current_setting('t.oa')::uuid),''),'todas rechazadas'), pg_temp.inserciones_a_b(current_setting('t.oa')::uuid) = '');
select pg_temp.t('I2 DENTISTA de A: no puede insertar apuntando a B', pg_temp.inserciones_a_b(current_setting('t.da')::uuid) = '');
select pg_temp.t('I3 RECEPCIÓN de A: no puede insertar apuntando a B', pg_temp.inserciones_a_b(current_setting('t.ra')::uuid) = '');
select pg_temp.t('I4 ASISTENTE de A: no puede insertar apuntando a B', pg_temp.inserciones_a_b(current_setting('t.aa')::uuid) = '');
select pg_temp.t('E5 tras todos esos ataques, B quedó INTACTA (nada modificado, borrado ni agregado)',
  (select nombre from clinicas where id = current_setting('t.cb')::uuid) = 'Clínica B'
  and (select count(*) from usuarios where clinica_id = current_setting('t.cb')::uuid) = 2
  and (select count(*) from pacientes where clinica_id = current_setting('t.cb')::uuid) = 1
  and (select count(*) from pagos where paciente_id = current_setting('t.pb')::uuid) = 1
  and (select monto from pagos where paciente_id = current_setting('t.pb')::uuid) = 50
  and (select count(*) from recetas where paciente_id = current_setting('t.pb')::uuid) = 1
  and (select count(*) from fotografias where paciente_id = current_setting('t.pb')::uuid) = 1
  and (select count(*) from sucursales where clinica_id = current_setting('t.cb')::uuid) = 1
  and (select count(*) from auditoria where clinica_id = current_setting('t.cb')::uuid and accion = 'cerrar_sesion_remota') = 0);
-- Un paciente creado "en nombre de B" por un usuario de A cae en A (o se rechaza), nunca en B
select pg_temp.como(current_setting('t.oa')::uuid, format('insert into pacientes (clinica_id, nombre_completo) values (%L, ''Colado'')', current_setting('t.cb')));
select pg_temp.t('I5 un paciente creado por A indicando la clínica B NO queda en B (cae en A o se rechaza)',
  not exists (select 1 from pacientes where nombre_completo = 'Colado' and clinica_id = current_setting('t.cb')::uuid));

-- ============================================================ STORAGE: archivos de A vs B (política por paciente asignado / clínica)
create function pg_temp.storage_visible(p_uid uuid, p_prefijo text) returns text language sql as $$
  select pg_temp.val(p_uid, format('select count(*)::text from storage.objects where name like %L', p_prefijo || '%'))
$$;
select pg_temp.t('S1 OWNER de A: ve los archivos de SU paciente (fotos y documentos) y NINGUNO del paciente de B',
  pg_temp.val(current_setting('t.oa')::uuid, format('select count(*)::text from storage.objects where bucket_id in (''fotos-clinicas'',''documentos-clinicos'') and name like %L', current_setting('t.pa') || '/%')) = '2'
  and pg_temp.val(current_setting('t.oa')::uuid, format('select count(*)::text from storage.objects where bucket_id in (''fotos-clinicas'',''documentos-clinicos'') and name like %L', current_setting('t.pb') || '/%')) = '0');
select pg_temp.t('S2 DENTISTA de A: ve las fotos de su paciente asignado y nada de B; RECEPCIÓN y ASISTENTE no ven los archivos del paciente de B',
  pg_temp.val(current_setting('t.da')::uuid, format('select count(*)::text from storage.objects where bucket_id = ''fotos-clinicas'' and name like %L', current_setting('t.pa') || '/%')) = '1'
  and pg_temp.storage_visible(current_setting('t.da')::uuid, current_setting('t.pb') || '/') = '0'
  and pg_temp.storage_visible(current_setting('t.ra')::uuid, current_setting('t.pb') || '/') = '0'
  and pg_temp.storage_visible(current_setting('t.aa')::uuid, current_setting('t.pb') || '/') = '0');
select pg_temp.t('S3 NO se puede SUBIR un archivo a la carpeta del paciente de B (fotos ni documentos), con ningún rol',
  (select bool_and(pg_temp.como(u, format('insert into storage.objects (bucket_id, name) values (%L, %L)', b, current_setting('t.pb') || '/colado.bin')) like 'ERR|%')
   from unnest(array[current_setting('t.oa')::uuid, current_setting('t.da')::uuid, current_setting('t.ra')::uuid, current_setting('t.aa')::uuid]) u,
        unnest(array['fotos-clinicas','documentos-clinicos']) b));
select pg_temp.t('S4 LOGOS: el owner de A no puede subir, cambiar ni borrar el logo de B; sí sube el suyo',
  pg_temp.como(current_setting('t.oa')::uuid, format('insert into storage.objects (bucket_id, name) values (''logos-clinicas'', %L)', current_setting('t.cb') || '/hack.png')) like 'ERR|%'
  and pg_temp.como(current_setting('t.oa')::uuid, format('update storage.objects set name = name where bucket_id = ''logos-clinicas'' and name like %L', current_setting('t.cb') || '/%')) in ('OK:0')
  and pg_temp.como(current_setting('t.oa')::uuid, format('delete from storage.objects where bucket_id = ''logos-clinicas'' and name like %L', current_setting('t.cb') || '/%')) in ('OK:0')
  and pg_temp.como(current_setting('t.oa')::uuid, format('insert into storage.objects (bucket_id, name) values (''logos-clinicas'', %L)', current_setting('t.ca') || '/nuevo.png')) = 'OK:1'
  and (select count(*) from storage.objects where bucket_id = 'logos-clinicas' and name like current_setting('t.cb') || '/%') = 1);
select pg_temp.t('S5 DENTISTA y RECEPCIÓN no pueden subir logos de ninguna clínica (solo el owner)',
  pg_temp.como(current_setting('t.da')::uuid, format('insert into storage.objects (bucket_id, name) values (''logos-clinicas'', %L)', current_setting('t.ca') || '/d.png')) like 'ERR|%'
  and pg_temp.como(current_setting('t.ra')::uuid, format('insert into storage.objects (bucket_id, name) values (''logos-clinicas'', %L)', current_setting('t.ca') || '/r.png')) like 'ERR|%');
select pg_temp.t('S6 RECEPCIÓN y ASISTENTE no suben documentos clínicos ni siquiera de su propia clínica (solo owner/dentista); el dentista no sube al paciente de otro dentista',
  pg_temp.como(current_setting('t.ra')::uuid, format('insert into storage.objects (bucket_id, name) values (''documentos-clinicos'', %L)', current_setting('t.pa') || '/r.pdf')) like 'ERR|%'
  and pg_temp.como(current_setting('t.aa')::uuid, format('insert into storage.objects (bucket_id, name) values (''documentos-clinicos'', %L)', current_setting('t.pa') || '/a.pdf')) like 'ERR|%'
  and pg_temp.como(current_setting('t.da')::uuid, format('insert into storage.objects (bucket_id, name) values (''documentos-clinicos'', %L)', current_setting('t.pa') || '/d.pdf')) = 'OK:1');
select pg_temp.t('S7 DOCUMENTADO: los archivos clínicos NO tienen política de UPDATE ni DELETE para clientes (los objetos no se pueden borrar desde la app; ver informe)',
  not exists (select 1 from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'storage' and c.relname = 'objects' and p.polcmd in ('w','d') and p.polname ~ 'fotos|documentos'));

-- ============================================================ BARRIDO GENÉRICO de TODA tabla y vista con clinica_id / paciente_id
create temp table _barrido (objeto text, columna text, valor_b text);
insert into _barrido
 select c.relname, a.attname, case when a.attname = 'clinica_id' then current_setting('t.cb') else current_setting('t.pb') end
   from pg_class c join pg_namespace n on n.oid = c.relnamespace join pg_attribute a on a.attrelid = c.oid and not a.attisdropped
  where n.nspname = 'public' and c.relkind in ('r','p','v') and a.attname in ('clinica_id','paciente_id')
    and (c.relkind = 'v' or c.relrowsecurity)
    and c.relname not in (select tabla from _tablas where false);
select pg_temp.t('B1 el barrido genérico cubre al menos 28 tablas/vistas con clinica_id o paciente_id (hoy: 28; las demás con RLS se cubren explícitamente arriba)', (select count(distinct objeto) from _barrido) >= 28);
create function pg_temp.barrido(p_uid uuid) returns text language plpgsql as $$
declare r record; n text; malas text := '';
begin
  for r in select * from _barrido loop
    n := pg_temp.val(p_uid, format('select count(*)::text from %I where %I = %L', r.objeto, r.columna, r.valor_b));
    if n not in ('0') and n not like 'ERR|%' then malas := malas || r.objeto || '.' || r.columna || '=' || n || ' '; end if;
  end loop;
  return malas;
end $$;
select pg_temp.t('B2 BARRIDO owner A: ninguna tabla/vista devuelve filas de B — ' || coalesce(nullif(pg_temp.barrido(current_setting('t.oa')::uuid),''),'limpio'), pg_temp.barrido(current_setting('t.oa')::uuid) = '');
select pg_temp.t('B3 BARRIDO dentista A', pg_temp.barrido(current_setting('t.da')::uuid) = '');
select pg_temp.t('B4 BARRIDO recepción A', pg_temp.barrido(current_setting('t.ra')::uuid) = '');
select pg_temp.t('B5 BARRIDO asistente A', pg_temp.barrido(current_setting('t.aa')::uuid) = '');

-- ============================================================ COBERTURA: ninguna tabla con RLS queda sin probar
select pg_temp.t('C1 TODA tabla con RLS está cubierta por la lista explícita, por el barrido o declarada como catálogo global/sin acceso (si se agrega una tabla nueva, esta prueba obliga a decidirlo)',
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r','p') and c.relrowsecurity
       and c.relname not in (select tabla from _tablas)
       and c.relname not in (select objeto from _barrido)
       -- catálogos globales (solo lectura para clínicas) y tablas sin acceso por la API
       and c.relname not in ('funcionalidades','plan_funcionalidades','planes_catalogo','plataforma_config','legal_documents')
  ));

-- ============================================================ FUNCIONES expuestas
select pg_temp.t('F1 mi_suscripcion() de A muestra solo SU plan/uso y no el de B',
  (pg_temp.val(current_setting('t.oa')::uuid, 'select (mi_suscripcion() -> ''uso'' ->> ''pacientes'')') = '1')
  and pg_temp.val(current_setting('t.ob')::uuid, 'select (mi_suscripcion() -> ''uso'' ->> ''pacientes'')') = '1');
select pg_temp.t('F2 las funciones sa_* siguen cerradas a los roles de clínica (owner, dentista, recepción, asistente)',
  (select bool_and(pg_temp.val(u, 'select sa_listar_planes()::text') like 'ERR|%') from unnest(array[current_setting('t.oa')::uuid, current_setting('t.da')::uuid, current_setting('t.ra')::uuid, current_setting('t.aa')::uuid]) u));

do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO AISLAMIENTO: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 160), ' | ') from _res where not ok); end if;
end $$;
rollback;
