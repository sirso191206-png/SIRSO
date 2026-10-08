-- Sesiones por dispositivo (migración 078). PostgreSQL real + capa que imita a Supabase
-- (auth.sessions incluida). Una transacción con ROLLBACK; se actúa con SET ROLE + claims JWT
-- que incluyen `session_id`, como los access tokens reales.
\set ON_ERROR_STOP on
\set QUIET on
begin;
create temp table _res (ok boolean, nombre text);
create function pg_temp.t(p_nombre text, p_cond boolean) returns void language plpgsql as $$
begin insert into _res values (coalesce(p_cond,false), p_nombre); raise notice '% %', case when coalesce(p_cond,false) then 'PASS' else 'FAIL' end, p_nombre; end $$;
-- Ejecuta SQL como un usuario con ESTA sesión. 'OK' o 'ERR|sqlstate|mensaje'.
create function pg_temp.como(p_uid uuid, p_ses uuid, p_sql text) returns text language plpgsql as $$
declare v_m text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'session_id', p_ses)::text, true);
  set local role authenticated;
  begin execute p_sql; reset role; return 'OK';
  exception when others then get stacked diagnostics v_m = message_text; reset role; return 'ERR|'||sqlstate||'|'||v_m; end;
end $$;
create function pg_temp.val(p_uid uuid, p_ses uuid, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'session_id', p_ses)::text, true);
  set local role authenticated;
  begin execute p_sql into v; reset role; return v;
  exception when others then reset role; return 'ERR|'||sqlstate||'|'||sqlerrm; end;
end $$;
create function pg_temp.flag(p text) returns void language sql as $$ update plataforma_config set valor = p where clave = 'control_sesiones_estricto' $$;

-- ---------- Datos ----------
insert into auth.users (id, email) select ('a8000000-0000-0000-0000-0000000000'||lpad(g::text,2,'0'))::uuid, 's'||g||'@x.mx' from generate_series(1,5) g;
insert into clinicas (id, nombre) values ('c8000000-0000-0000-0000-000000000001','Esencial 1 sesión'),('c8000000-0000-0000-0000-000000000002','Profesional 3 sesiones'),('c8000000-0000-0000-0000-000000000003','Plataforma');
select fn_asignar_plan_interno(null,'c8000000-0000-0000-0000-000000000001','esencial','mensual');
select fn_asignar_plan_interno(null,'c8000000-0000-0000-0000-000000000002','profesional','mensual');
select fn_asignar_plan_interno(null,'c8000000-0000-0000-0000-000000000003','empresarial','anual');
insert into usuarios (id, clinica_id, nombre, correo, rol, es_super_admin) values
 ('a8000000-0000-0000-0000-000000000001','c8000000-0000-0000-0000-000000000001','Ana (esencial)','s1@x.mx','owner',false),
 ('a8000000-0000-0000-0000-000000000002','c8000000-0000-0000-0000-000000000002','Beto (profesional)','s2@x.mx','owner',false),
 ('a8000000-0000-0000-0000-000000000003','c8000000-0000-0000-0000-000000000002','Caro (profesional)','s3@x.mx','dentista',false),
 ('a8000000-0000-0000-0000-000000000004','c8000000-0000-0000-0000-000000000003','Super','s4@x.mx','owner',true);
insert into pacientes (clinica_id, nombre_completo) select 'c8000000-0000-0000-0000-000000000001','P1-'||g from generate_series(1,3) g;
insert into pacientes (clinica_id, nombre_completo) select 'c8000000-0000-0000-0000-000000000002','P2-'||g from generate_series(1,2) g;
select set_config('t.ana','a8000000-0000-0000-0000-000000000001',false), set_config('t.beto','a8000000-0000-0000-0000-000000000002',false),
       set_config('t.caro','a8000000-0000-0000-0000-000000000003',false), set_config('t.sup','a8000000-0000-0000-0000-000000000004',false);
-- Sesiones reales (más antigua → más reciente)
insert into auth.sessions (id, user_id, created_at, user_agent) values
 ('5e000000-0000-0000-0000-0000000000a1','a8000000-0000-0000-0000-000000000001', now() - interval '3 days', 'Chrome · Windows (PC de la clínica)'),
 ('5e000000-0000-0000-0000-0000000000a2','a8000000-0000-0000-0000-000000000001', now() - interval '1 hour', 'Safari · iOS (celular)'),
 ('5e000000-0000-0000-0000-0000000000b1','a8000000-0000-0000-0000-000000000002', now() - interval '4 days', 'Chrome · Windows'),
 ('5e000000-0000-0000-0000-0000000000b2','a8000000-0000-0000-0000-000000000002', now() - interval '3 days', 'Firefox · Linux'),
 ('5e000000-0000-0000-0000-0000000000b3','a8000000-0000-0000-0000-000000000002', now() - interval '2 days', 'Edge · Windows'),
 ('5e000000-0000-0000-0000-0000000000b4','a8000000-0000-0000-0000-000000000002', now() - interval '1 day',  'Chrome · Android'),
 ('5e000000-0000-0000-0000-0000000000c1','a8000000-0000-0000-0000-000000000003', now() - interval '1 day',  'Chrome · Windows'),
 ('5e000000-0000-0000-0000-0000000000d1','a8000000-0000-0000-0000-000000000004', now() - interval '9 days', 'Chrome · Mac'),
 ('5e000000-0000-0000-0000-0000000000d2','a8000000-0000-0000-0000-000000000004', now() - interval '8 days', 'Chrome · Windows'),
 ('5e000000-0000-0000-0000-0000000000d3','a8000000-0000-0000-0000-000000000004', now() - interval '7 days', 'Safari · Mac');

-- ============================================================ A. Interruptor APAGADO (estado de despliegue)
select pg_temp.t('A1 el interruptor viene APAGADO tras la migración', (select valor from plataforma_config where clave = 'control_sesiones_estricto') = 'off');
select pg_temp.t('A2 con el interruptor apagado la base NO corta nada: una sesión revocada sigue leyendo (inerte hasta que se active)',
  pg_temp.val(current_setting('t.ana')::uuid, '5e000000-0000-0000-0000-0000000000ff', 'select count(*)::text from pacientes') = '3');
select pg_temp.t('A3 ...pero mi_sesion_estado() ya la reporta como revocada (así el dispositivo se entera y se cierra solo)',
  (pg_temp.val(current_setting('t.ana')::uuid, '5e000000-0000-0000-0000-0000000000ff', 'select mi_sesion_estado()::text')::jsonb ->> 'motivo') = 'revocada'
  and (pg_temp.val(current_setting('t.ana')::uuid, '5e000000-0000-0000-0000-0000000000ff', 'select mi_sesion_estado()::text')::jsonb ->> 'estricto') = 'false');

-- ============================================================ B. Interruptor ENCENDIDO: corte real
select pg_temp.flag('on');
select pg_temp.t('B1 sesión válida y dentro del límite → lee y escribe normal (Ana, la más reciente)',
  pg_temp.val(current_setting('t.ana')::uuid, '5e000000-0000-0000-0000-0000000000a2', 'select count(*)::text from pacientes') = '3'
  and pg_temp.como(current_setting('t.ana')::uuid, '5e000000-0000-0000-0000-0000000000a2', $q$update pacientes set telefono='5550000000' where nombre_completo='P1-1'$q$) = 'OK');
select pg_temp.t('B2 plan de 1 sesión: la sesión MÁS ANTIGUA queda inválida (excedida) y NO ve nada de la clínica',
  pg_temp.val(current_setting('t.ana')::uuid, '5e000000-0000-0000-0000-0000000000a1', 'select count(*)::text from pacientes') = '0'
  and pg_temp.val(current_setting('t.ana')::uuid, '5e000000-0000-0000-0000-0000000000a1', 'select count(*)::text from usuarios') = '0'
  and (pg_temp.val(current_setting('t.ana')::uuid, '5e000000-0000-0000-0000-0000000000a1', 'select mi_sesion_estado()::text')::jsonb ->> 'motivo') = 'excedida');
select pg_temp.t('B3 ...tampoco puede ESCRIBIR: INSERT rechazado por RLS y UPDATE/DELETE afectan 0 filas',
  pg_temp.como(current_setting('t.ana')::uuid, '5e000000-0000-0000-0000-0000000000a1', $q$insert into pacientes (clinica_id, nombre_completo) values ('c8000000-0000-0000-0000-000000000001','Colado')$q$) like 'ERR|42501%'
  and pg_temp.val(current_setting('t.ana')::uuid, '5e000000-0000-0000-0000-0000000000a1', $q$with u as (update pacientes set telefono='1' returning 1) select count(*)::text from u$q$) = '0'
  and not exists (select 1 from pacientes where nombre_completo = 'Colado'));
select pg_temp.t('B4 una sesión REVOCADA (borrada de auth.sessions) con un token aún vigente deja de funcionar de inmediato',
  pg_temp.val(current_setting('t.beto')::uuid, '5e000000-0000-0000-0000-0000000000ee', 'select count(*)::text from pacientes') = '0'
  and (pg_temp.val(current_setting('t.beto')::uuid, '5e000000-0000-0000-0000-0000000000ee', 'select mi_sesion_estado()::text')::jsonb ->> 'motivo') = 'revocada');
select pg_temp.t('B5 plan de 3 sesiones con 4 abiertas: solo la más antigua (b1) queda inválida; b2, b3 y b4 siguen',
  pg_temp.val(current_setting('t.beto')::uuid, '5e000000-0000-0000-0000-0000000000b1', 'select count(*)::text from pacientes') = '0'
  and pg_temp.val(current_setting('t.beto')::uuid, '5e000000-0000-0000-0000-0000000000b2', 'select count(*)::text from pacientes') = '2'
  and pg_temp.val(current_setting('t.beto')::uuid, '5e000000-0000-0000-0000-0000000000b3', 'select count(*)::text from pacientes') = '2'
  and pg_temp.val(current_setting('t.beto')::uuid, '5e000000-0000-0000-0000-0000000000b4', 'select count(*)::text from pacientes') = '2');
select pg_temp.t('B6 sin claim session_id (service_role, tokens antiguos) NO se corta: no es identificable → válida',
  pg_temp.val(current_setting('t.ana')::uuid, null, 'select count(*)::text from pacientes') = '3');
select pg_temp.t('B7 el límite de UN usuario no afecta a otro: la sesión de Caro (otro usuario) sigue válida',
  (pg_temp.val(current_setting('t.caro')::uuid, '5e000000-0000-0000-0000-0000000000c1', 'select mi_sesion_estado()::text')::jsonb ->> 'motivo') = 'activa'
  -- (una dentista solo ve a SUS pacientes por otra política; lo que sí debe ver es su propia fila)
  and pg_temp.val(current_setting('t.caro')::uuid, '5e000000-0000-0000-0000-0000000000c1', 'select count(*)::text from usuarios') >= '1');
select pg_temp.t('B8 una sesión de OTRO usuario no vale: el session_id de Ana usado con el usuario Caro es "revocada"',
  (pg_temp.val(current_setting('t.caro')::uuid, '5e000000-0000-0000-0000-0000000000a2', 'select mi_sesion_estado()::text')::jsonb ->> 'motivo') = 'revocada');
select pg_temp.t('B9 superadmin (límite ilimitado): sus 3 sesiones valen, y una revocada no',
  pg_temp.val(current_setting('t.sup')::uuid, '5e000000-0000-0000-0000-0000000000d1', 'select (mi_sesion_estado()::jsonb ->> $$valida$$)') = 'true'
  and pg_temp.val(current_setting('t.sup')::uuid, '5e000000-0000-0000-0000-0000000000d3', 'select (mi_sesion_estado()::jsonb ->> $$valida$$)') = 'true'
  and pg_temp.val(current_setting('t.sup')::uuid, '5e000000-0000-0000-0000-0000000000dd', 'select (mi_sesion_estado()::jsonb ->> $$valida$$)') = 'false');

-- Cambio de plan: el límite sale de la suscripción, sin ninguna acción sobre las sesiones
select pg_temp.como(current_setting('t.sup')::uuid, '5e000000-0000-0000-0000-0000000000d3', $q$select sa_ajustar_condiciones_clinica('c8000000-0000-0000-0000-000000000002','{"max_sesiones":1}','{}')$q$);
select pg_temp.t('B10 bajar el límite del plan a 1 deja SOLA solo la sesión más reciente (b4); las demás quedan inválidas sin tocarlas',
  pg_temp.val(current_setting('t.beto')::uuid, '5e000000-0000-0000-0000-0000000000b4', 'select count(*)::text from pacientes') = '2'
  and pg_temp.val(current_setting('t.beto')::uuid, '5e000000-0000-0000-0000-0000000000b3', 'select count(*)::text from pacientes') = '0'
  and pg_temp.val(current_setting('t.beto')::uuid, '5e000000-0000-0000-0000-0000000000b2', 'select count(*)::text from pacientes') = '0');
select pg_temp.como(current_setting('t.sup')::uuid, '5e000000-0000-0000-0000-0000000000d3', $q$select sa_ajustar_condiciones_clinica('c8000000-0000-0000-0000-000000000002','{"max_sesiones":3}','{}')$q$);
select pg_temp.t('B11 y al subirlo de nuevo a 3 vuelven a valer (no se perdió nada, solo se restablece el cupo)',
  pg_temp.val(current_setting('t.beto')::uuid, '5e000000-0000-0000-0000-0000000000b2', 'select count(*)::text from pacientes') = '2');

-- ============================================================ C. Cerrar UNA sesión de otro dispositivo
select pg_temp.t('C1 mis_sesiones_activas: Ana ve SOLO las suyas (2), marca la actual y cuál está vigente',
  pg_temp.val(current_setting('t.ana')::uuid, '5e000000-0000-0000-0000-0000000000a2', 'select count(*)::text from mis_sesiones_activas()') = '2'
  and pg_temp.val(current_setting('t.ana')::uuid, '5e000000-0000-0000-0000-0000000000a2', $q$select count(*)::text from mis_sesiones_activas() where es_actual and id = '5e000000-0000-0000-0000-0000000000a2'$q$) = '1'
  and pg_temp.val(current_setting('t.ana')::uuid, '5e000000-0000-0000-0000-0000000000a2', $q$select (select vigente from mis_sesiones_activas() where id='5e000000-0000-0000-0000-0000000000a1')::text$q$) = 'false'
  and pg_temp.val(current_setting('t.ana')::uuid, '5e000000-0000-0000-0000-0000000000a2', $q$select count(*)::text from mis_sesiones_activas() where user_agent is not null$q$) = '2');
select pg_temp.t('C2 no se filtran sesiones de otros usuarios (Beto no ve ninguna de Ana ni de Caro)',
  pg_temp.val(current_setting('t.beto')::uuid, '5e000000-0000-0000-0000-0000000000b4', $q$select count(*)::text from mis_sesiones_activas() where id in ('5e000000-0000-0000-0000-0000000000a1','5e000000-0000-0000-0000-0000000000c1')$q$) = '0');
select set_config('t.c3', pg_temp.como(current_setting('t.beto')::uuid, '5e000000-0000-0000-0000-0000000000b4', $q$select cerrar_sesion_remota('5e000000-0000-0000-0000-0000000000b2')$q$), false);
select pg_temp.t('C3 cerrar_sesion_remota borra ESA sesión (b2) de auth.sessions → ya no puede renovarse ni leer; las demás siguen',
  current_setting('t.c3') = 'OK'
  and not exists (select 1 from auth.sessions where id = '5e000000-0000-0000-0000-0000000000b2')
  and exists (select 1 from auth.sessions where id in ('5e000000-0000-0000-0000-0000000000b3','5e000000-0000-0000-0000-0000000000b4'))
  and pg_temp.val(current_setting('t.beto')::uuid, '5e000000-0000-0000-0000-0000000000b2', 'select count(*)::text from pacientes') = '0'
  and (pg_temp.val(current_setting('t.beto')::uuid, '5e000000-0000-0000-0000-0000000000b2', 'select mi_sesion_estado()::text')::jsonb ->> 'motivo') = 'revocada'
  and pg_temp.val(current_setting('t.beto')::uuid, '5e000000-0000-0000-0000-0000000000b4', 'select count(*)::text from pacientes') = '2');
select pg_temp.t('C4 queda auditado (quién y qué sesión)',
  exists (select 1 from auditoria where accion = 'cerrar_sesion_remota' and usuario_id = current_setting('t.beto')::uuid and entidad_id = '5e000000-0000-0000-0000-0000000000b2'));
select pg_temp.t('C5 NO se puede cerrar la sesión actual por esta vía (para eso está "Cerrar sesión")',
  pg_temp.como(current_setting('t.beto')::uuid, '5e000000-0000-0000-0000-0000000000b4', $q$select cerrar_sesion_remota('5e000000-0000-0000-0000-0000000000b4')$q$) like 'ERR|P0001|Esa es la sesión de este dispositivo%'
  and exists (select 1 from auth.sessions where id = '5e000000-0000-0000-0000-0000000000b4'));
select pg_temp.t('C6 NO se puede cerrar la sesión de OTRO usuario (Beto contra la de Caro): "no se encontró" y la sesión sigue',
  pg_temp.como(current_setting('t.beto')::uuid, '5e000000-0000-0000-0000-0000000000b4', $q$select cerrar_sesion_remota('5e000000-0000-0000-0000-0000000000c1')$q$) like 'ERR|P0001|No se encontró esa sesión%'
  and exists (select 1 from auth.sessions where id = '5e000000-0000-0000-0000-0000000000c1'));
select pg_temp.t('C7 una sesión que no existe, o un id nulo, se rechaza',
  pg_temp.como(current_setting('t.beto')::uuid, '5e000000-0000-0000-0000-0000000000b4', $q$select cerrar_sesion_remota('5e000000-0000-0000-0000-0000000000f0')$q$) like 'ERR|%'
  and pg_temp.como(current_setting('t.beto')::uuid, '5e000000-0000-0000-0000-0000000000b4', $q$select cerrar_sesion_remota(null)$q$) like 'ERR|%');
do $$ declare v text; begin
  perform set_config('request.jwt.claims','{"role":"anon"}', true); set local role anon;
  begin perform cerrar_sesion_remota('5e000000-0000-0000-0000-0000000000a1'); v := 'OK'; exception when others then v := 'ERR|'||sqlstate; end;
  reset role; perform set_config('t.c8', v, false);
end $$;
select pg_temp.t('C8 un anónimo no puede cerrar ni listar sesiones (EXECUTE no concedido)', current_setting('t.c8') like 'ERR|%');
select pg_temp.t('C9 el interruptor y su tabla no son accesibles por la API: ni leer ni cambiar plataforma_config',
  pg_temp.val(current_setting('t.sup')::uuid, '5e000000-0000-0000-0000-0000000000d3', 'select count(*)::text from plataforma_config') like 'ERR|42501%'
  and pg_temp.como(current_setting('t.sup')::uuid, '5e000000-0000-0000-0000-0000000000d3', $q$update plataforma_config set valor='off'$q$) like 'ERR|42501%'
  and (select valor from plataforma_config where clave = 'control_sesiones_estricto') = 'on');

-- ============================================================ D. Cobertura y seguridad de la infraestructura
select pg_temp.t('D1 TODA tabla de public con RLS (salvo plataforma_config) tiene su política restrictiva de sesión',
  not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relkind in ('r','p') and c.relrowsecurity and c.relname <> 'plataforma_config'
                and not exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polname = 'sesion_activa_' || c.relname and not p.polpermissive)));
select pg_temp.t('D2 las funciones internas no son ejecutables por la API (solo fn_sesion_activa y fn_sesion_jwt, que usan las políticas)',
  not has_function_privilege('authenticated', 'fn_estado_sesion(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'fn_estado_sesion(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'fn_proteger_tablas_con_sesion()', 'EXECUTE'));
create temp table _rec (tabla text, op text);
do $$
declare t record; col text; o text; q text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('t.beto'), 'role', 'authenticated', 'session_id', '5e000000-0000-0000-0000-0000000000b4')::text, true);
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity order by 1 loop
    select column_name into col from information_schema.columns where table_schema='public' and table_name=t.relname order by ordinal_position limit 1;
    foreach o in array array['select','insert','update','delete'] loop
      q := case o when 'select' then format('select 1 from %I where false', t.relname) when 'update' then format('update %I set %I = %I where false', t.relname, col, col)
                  when 'delete' then format('delete from %I where false', t.relname) else format('insert into %I select * from %I where false', t.relname, t.relname) end;
      begin set local role authenticated; execute q; reset role;
      exception when others then reset role; if sqlerrm ilike '%recursion%' then insert into _rec values (t.relname, o); end if; end;
    end loop;
  end loop;
end $$;
select pg_temp.t('D3 ninguna tabla da "infinite recursion" con SELECT/INSERT/UPDATE/DELETE bajo las políticas nuevas (barrido de todas)', not exists (select 1 from _rec));
select pg_temp.flag('off');
select pg_temp.t('D4 al APAGAR el interruptor se restablece el acceso (la sesión excedida de Ana vuelve a leer)',
  pg_temp.val(current_setting('t.ana')::uuid, '5e000000-0000-0000-0000-0000000000a1', 'select count(*)::text from pacientes') = '3');
select pg_temp.flag('on');

-- ============================================================ E. Falla ABIERTA
alter table auth.sessions rename to sessions_renombrada;
select pg_temp.t('E1 si auth.sessions no se puede leer, el estado es "no verificable" y la sesión se considera VÁLIDA (nunca deja a todos afuera)',
  (fn_estado_sesion(current_setting('t.ana')::uuid, '5e000000-0000-0000-0000-0000000000a1') ->> 'valida') = 'true'
  and (fn_estado_sesion(current_setting('t.ana')::uuid, '5e000000-0000-0000-0000-0000000000a1') ->> 'motivo') = 'no_verificable'
  and pg_temp.val(current_setting('t.ana')::uuid, '5e000000-0000-0000-0000-0000000000a1', 'select count(*)::text from pacientes') = '3');
alter table auth.sessions_renombrada rename to sessions;

do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO SESIONES: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(nombre, ' | ') from _res where not ok); end if;
end $$;
rollback;
