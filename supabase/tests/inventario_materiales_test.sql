-- Migración 117: inventario de materiales ligado a la consulta. Datos sintéticos; todo con ROLLBACK.
-- Clínica A (Empresarial: incluye inventario), clínica B (Profesional, para aislamiento), clínica E (Esencial: sin inventario).
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
  exception when others then reset role; return 'ERR|' || sqlstate || '|' || sqlerrm; end;
end $$;
create function pg_temp.como(p_uid uuid, p_sql text) returns text language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin execute p_sql; get diagnostics n = row_count; reset role; return 'OK:'||n;
  exception when others then reset role; return 'ERR|' || sqlstate || '|' || sqlerrm; end;
end $$;
-- El hint (código de negocio) del error de una llamada.
create function pg_temp.hint_de(p_uid uuid, p_sql text) returns text language plpgsql as $$
declare h text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin execute p_sql; reset role; return 'SIN_ERROR';
  exception when others then get stacked diagnostics h = pg_exception_hint; reset role; return coalesce(nullif(h, ''), 'ERR|' || sqlstate); end;
end $$;
create function pg_temp.stock(p_nombre text, p_cl uuid) returns numeric language sql as $$
  select stock from materiales where nombre = p_nombre and clinica_id = p_cl
$$;

insert into auth.users (id, email) select ('a1170000-0000-0000-0000-0000000000'||lpad(g::text,2,'0'))::uuid, 'inv_'||g||'@x.mx' from generate_series(1,7) g;
insert into clinicas (id, nombre) values ('c1170000-0000-0000-0000-00000000000a','Clínica A'),('c1170000-0000-0000-0000-00000000000b','Clínica B'),
                                         ('c1170000-0000-0000-0000-00000000000e','Clínica E');
select fn_asignar_plan_interno(null, 'c1170000-0000-0000-0000-00000000000a', 'empresarial', 'mensual'),
       fn_asignar_plan_interno(null, 'c1170000-0000-0000-0000-00000000000b', 'profesional', 'mensual'),
       fn_asignar_plan_interno(null, 'c1170000-0000-0000-0000-00000000000e', 'esencial', 'mensual');
insert into usuarios (id, clinica_id, nombre, correo, rol) values
 ('a1170000-0000-0000-0000-000000000001','c1170000-0000-0000-0000-00000000000a','Olga Owner A','inv_1@x.mx','owner'),
 ('a1170000-0000-0000-0000-000000000002','c1170000-0000-0000-0000-00000000000a','Ana Asistente A','inv_2@x.mx','asistente'),
 ('a1170000-0000-0000-0000-000000000003','c1170000-0000-0000-0000-00000000000a','Dante Dentista A','inv_3@x.mx','dentista'),
 ('a1170000-0000-0000-0000-000000000004','c1170000-0000-0000-0000-00000000000a','Rita Recepción A','inv_4@x.mx','recepcion'),
 ('a1170000-0000-0000-0000-000000000005','c1170000-0000-0000-0000-00000000000b','Owner B','inv_5@x.mx','owner'),
 ('a1170000-0000-0000-0000-000000000006','c1170000-0000-0000-0000-00000000000e','Owner E','inv_6@x.mx','owner');
\set OA '''a1170000-0000-0000-0000-000000000001'''
\set AA '''a1170000-0000-0000-0000-000000000002'''
\set DA '''a1170000-0000-0000-0000-000000000003'''
\set RA '''a1170000-0000-0000-0000-000000000004'''
\set OB '''a1170000-0000-0000-0000-000000000005'''
\set OE '''a1170000-0000-0000-0000-000000000006'''
\set CA '''c1170000-0000-0000-0000-00000000000a'''
\set CB '''c1170000-0000-0000-0000-00000000000b'''
insert into pacientes (id, clinica_id, nombre_completo, dentista_responsable_id) values
 ('b1170000-0000-0000-0000-00000000000a','c1170000-0000-0000-0000-00000000000a','Paciente A','a1170000-0000-0000-0000-000000000003'),
 ('b1170000-0000-0000-0000-00000000000e','c1170000-0000-0000-0000-00000000000e','Paciente E',null);
insert into catalogo_tratamientos (id, clinica_id, nombre, precio) values
 ('d1170000-0000-0000-0000-000000000001','c1170000-0000-0000-0000-00000000000a','Resina', 800),
 ('d1170000-0000-0000-0000-000000000002','c1170000-0000-0000-0000-00000000000a','Extracción', 600),
 ('d1170000-0000-0000-0000-000000000003','c1170000-0000-0000-0000-00000000000b','Resina B', 700);
insert into sucursales (id, clinica_id, nombre) values ('e1170000-0000-0000-0000-00000000000b','c1170000-0000-0000-0000-00000000000b','Sucursal de B');

-- ============================================================ A. Plan
select pg_temp.t('A1 la funcionalidad inventario existe (base de datos) y la traen Profesional, Clínica y Empresarial, no Esencial',
  exists (select 1 from funcionalidades where codigo = 'inventario' and aplicacion = 'base_de_datos' and activo)
  and (select count(*) from plan_funcionalidades where funcionalidad = 'inventario' and habilitada and plan in ('profesional','clinica','empresarial')) = 3
  and not exists (select 1 from plan_funcionalidades where funcionalidad = 'inventario' and plan = 'esencial' and habilitada));
select pg_temp.t('A2 las tres tablas tienen RLS, su política restrictiva de sesión (D1) y la de plan',
  (select count(*) from pg_class c where c.relname in ('materiales','movimientos_inventario','receta_materiales') and c.relrowsecurity
     and exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polname = 'sesion_activa_' || c.relname and not p.polpermissive)
     and exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polname = 'plan_func_' || c.relname and not p.polpermissive)) = 3);

-- ============================================================ M. Materiales
-- (la comprobación va en una sentencia APARTE: una sentencia no ve lo que escribe la función llamada dentro de ella)
select set_config('t.m1', pg_temp.como(:OA, $q$insert into materiales (nombre, unidad, stock_minimo) values ('Resina A2', 'jeringa', 3)$q$), false);
select pg_temp.t('M1 el propietario crea un material: la clínica la pone la base y el stock empieza en 0',
  current_setting('t.m1') = 'OK:1'
  and (select clinica_id = 'c1170000-0000-0000-0000-00000000000a' and stock = 0 from materiales where nombre = 'Resina A2'));
select pg_temp.t('M2 el asistente también crea materiales',
  pg_temp.como(:AA, $q$insert into materiales (nombre, unidad, stock_minimo) values ('Guantes', 'caja', 1)$q$) = 'OK:1');
select pg_temp.t('M3 nadie escribe el stock directamente: ni al crear ni al editar (42501)',
  pg_temp.como(:OA, $q$insert into materiales (nombre, unidad, stock) values ('Truco', 'pieza', 99)$q$) like 'ERR|42501|%'
  and pg_temp.como(:OA, $q$update materiales set stock = 500 where nombre = 'Resina A2'$q$) like 'ERR|42501|%'
  and pg_temp.stock('Resina A2', :CA) = 0);
select pg_temp.t('M4 ni la clínica (no se puede mover un material a otra clínica)',
  pg_temp.como(:OA, $q$update materiales set clinica_id = 'c1170000-0000-0000-0000-00000000000b' where nombre = 'Resina A2'$q$) like 'ERR|42501|%');
select pg_temp.t('M5 un material no se borra (se desactiva)',
  pg_temp.como(:OA, $q$delete from materiales where nombre = 'Guantes'$q$) like 'ERR|42501|%'
  and pg_temp.como(:OA, $q$update materiales set activo = false, stock_minimo = 2 where nombre = 'Guantes'$q$) = 'OK:1'
  and pg_temp.como(:OA, $q$update materiales set activo = true, stock_minimo = 1 where nombre = 'Guantes'$q$) = 'OK:1');
select pg_temp.t('M6 la sucursal debe ser de la propia clínica (MATERIAL_INCOHERENTE o rechazo)',
  pg_temp.como(:OA, $q$insert into materiales (nombre, sucursal_id) values ('Ajeno', 'e1170000-0000-0000-0000-00000000000b')$q$) like 'ERR|%');
select pg_temp.t('M7 odontólogo y recepción no ven ni crean materiales',
  pg_temp.val(:DA, 'select count(*)::text from materiales') = '0' and pg_temp.val(:RA, 'select count(*)::text from materiales') = '0'
  and pg_temp.como(:DA, $q$insert into materiales (nombre) values ('X')$q$) like 'ERR|%'
  and pg_temp.como(:RA, $q$insert into materiales (nombre) values ('Y')$q$) like 'ERR|%');
select pg_temp.t('M8 no se repite el nombre en la misma sucursal',
  pg_temp.como(:OA, $q$insert into materiales (nombre) values (' resina a2 ')$q$) like 'ERR|23505|%');

select set_config('t.resina', (select id::text from materiales where nombre = 'Resina A2'), false),
       set_config('t.guantes', (select id::text from materiales where nombre = 'Guantes'), false);

-- ============================================================ V. Movimientos manuales
select set_config('t.v1', pg_temp.val(:OA, format('select fn_inventario_registrar_movimiento(%L, ''entrada'', 10, ''Compra'')::text', current_setting('t.resina'))), false);
select pg_temp.t('V1 entrada de 10: stock 10, con quién (id y nombre) y cuándo',
  (current_setting('t.v1')::jsonb ->> 'stock')::numeric = 10 and pg_temp.stock('Resina A2', :CA) = 10
  and exists (select 1 from movimientos_inventario where material_id = current_setting('t.resina')::uuid and tipo = 'entrada' and cantidad = 10
                and stock_anterior = 0 and stock_resultante = 10 and usuario_id = :OA and usuario_nombre = 'Olga Owner A' and creado_en is not null));
select set_config('t.v2', pg_temp.val(:AA, format('select fn_inventario_registrar_movimiento(%L, ''ajuste'', 7, ''Conteo físico'')::text', current_setting('t.resina'))), false);
select pg_temp.t('V2 el asistente ajusta al conteo físico (7): se guarda la diferencia (-3)',
  pg_temp.stock('Resina A2', :CA) = 7
  and exists (select 1 from movimientos_inventario where tipo = 'ajuste' and cantidad = -3 and stock_resultante = 7 and usuario_id = :AA));
select pg_temp.t('V3 salida y ajuste exigen motivo (MOTIVO_REQUERIDO); cantidades inválidas se rechazan',
  pg_temp.hint_de(:OA, format('select fn_inventario_registrar_movimiento(%L, ''ajuste'', 5)', current_setting('t.resina'))) = 'MOTIVO_REQUERIDO'
  and pg_temp.hint_de(:OA, format('select fn_inventario_registrar_movimiento(%L, ''salida'', 1, ''  '')', current_setting('t.resina'))) = 'MOTIVO_REQUERIDO'
  and pg_temp.hint_de(:OA, format('select fn_inventario_registrar_movimiento(%L, ''entrada'', 0)', current_setting('t.resina'))) = 'MOVIMIENTO_INVALIDO'
  and pg_temp.hint_de(:OA, format('select fn_inventario_registrar_movimiento(%L, ''entrada'', -4)', current_setting('t.resina'))) = 'MOVIMIENTO_INVALIDO'
  and pg_temp.hint_de(:OA, format('select fn_inventario_registrar_movimiento(%L, ''regalo'', 4)', current_setting('t.resina'))) = 'MOVIMIENTO_INVALIDO'
  and pg_temp.stock('Resina A2', :CA) = 7);
select pg_temp.t('V4 odontólogo y recepción no registran movimientos (ROL_NO_PERMITIDO)',
  pg_temp.hint_de(:DA, format('select fn_inventario_registrar_movimiento(%L, ''entrada'', 1)', current_setting('t.resina'))) = 'ROL_NO_PERMITIDO'
  and pg_temp.hint_de(:RA, format('select fn_inventario_registrar_movimiento(%L, ''entrada'', 1)', current_setting('t.resina'))) = 'ROL_NO_PERMITIDO');
-- Idempotencia (cola sin conexión): mismo id → mismo movimiento
select pg_temp.val(:OA, format('select fn_inventario_registrar_movimiento(%L, ''entrada'', 2, null, ''f1170000-0000-0000-0000-000000000001'')::text', current_setting('t.resina')));
select set_config('t.v5', pg_temp.val(:OA, format('select fn_inventario_registrar_movimiento(%L, ''entrada'', 2, null, ''f1170000-0000-0000-0000-000000000001'')::text', current_setting('t.resina'))), false);
select pg_temp.t('V5 reintentar la misma entrada (mismo id) no suma dos veces: responde ya_registrado',
  (current_setting('t.v5')::jsonb ->> 'ya_registrado')::boolean and pg_temp.stock('Resina A2', :CA) = 9
  and (select count(*) from movimientos_inventario where id = 'f1170000-0000-0000-0000-000000000001') = 1);
select pg_temp.t('V6 el mismo id con otra cantidad se rechaza (MOVIMIENTO_CONFLICTO) y no cambia nada',
  pg_temp.hint_de(:OA, format('select fn_inventario_registrar_movimiento(%L, ''entrada'', 5, null, ''f1170000-0000-0000-0000-000000000001'')', current_setting('t.resina'))) = 'MOVIMIENTO_CONFLICTO'
  and pg_temp.stock('Resina A2', :CA) = 9);
select pg_temp.t('V7 el historial es inmutable: nadie lo edita, borra ni escribe directo',
  pg_temp.como(:OA, 'update movimientos_inventario set cantidad = 100') like 'ERR|42501|%'
  and pg_temp.como(:OA, 'delete from movimientos_inventario') like 'ERR|42501|%'
  and pg_temp.como(:OA, format($q$insert into movimientos_inventario (clinica_id, material_id, tipo, cantidad, stock_anterior, stock_resultante) values (%L, %L, 'entrada', 1, 0, 1)$q$, :CA, current_setting('t.resina'))) like 'ERR|42501|%');
select pg_temp.t('V8 las funciones internas no se pueden llamar por la API',
  not has_function_privilege('authenticated', 'fn_inventario_aplicar(uuid,numeric,text,text,text,uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'fn_inventario_descontar_tratamiento(uuid,uuid,uuid,integer,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'fn_inventario_registrar_movimiento(uuid,text,numeric,text,uuid)', 'EXECUTE'));

-- ============================================================ R. Receta por tratamiento del catálogo
select pg_temp.t('R1 el propietario define la receta: 2 jeringas de resina por sesión de «Resina»; 1 caja de guantes por «Extracción»',
  pg_temp.como(:OA, format($q$insert into receta_materiales (catalogo_id, material_id, cantidad) values ('d1170000-0000-0000-0000-000000000001', %L, 2)$q$, current_setting('t.resina'))) = 'OK:1'
  and pg_temp.como(:AA, format($q$insert into receta_materiales (catalogo_id, material_id, cantidad) values ('d1170000-0000-0000-0000-000000000002', %L, 1)$q$, current_setting('t.guantes'))) = 'OK:1');
select pg_temp.t('R2 cantidad 0 o negativa se rechaza; el odontólogo no edita recetas',
  pg_temp.como(:OA, format($q$update receta_materiales set cantidad = 0 where material_id = %L$q$, current_setting('t.resina'))) like 'ERR|%'
  and pg_temp.como(:DA, format($q$insert into receta_materiales (catalogo_id, material_id, cantidad) values ('d1170000-0000-0000-0000-000000000002', %L, 1)$q$, current_setting('t.resina'))) like 'ERR|%');

-- ============================================================ T. Descuento al registrar la consulta / completar el tratamiento
insert into tratamientos (id, paciente_id, descripcion, costo, catalogo_id, numero_sesiones, dentista_id) values
 ('71170000-0000-0000-0000-000000000001','b1170000-0000-0000-0000-00000000000a','Resina 36', 800,'d1170000-0000-0000-0000-000000000001', 2,'a1170000-0000-0000-0000-000000000003'),
 ('71170000-0000-0000-0000-000000000002','b1170000-0000-0000-0000-00000000000a','Extracción 48', 600,'d1170000-0000-0000-0000-000000000002', 1,'a1170000-0000-0000-0000-000000000003'),
 ('71170000-0000-0000-0000-000000000003','b1170000-0000-0000-0000-00000000000a','Resina sin catálogo', 500, null, 1,'a1170000-0000-0000-0000-000000000003');
select pg_temp.t('T0 crear un tratamiento planeado no descuenta nada', pg_temp.stock('Resina A2', :CA) = 9
  and not exists (select 1 from movimientos_inventario where origen = 'tratamiento'));
select set_config('t.t1', pg_temp.como(:DA, $q$update tratamientos set sesiones_completadas = 1 where id = '71170000-0000-0000-0000-000000000001'$q$), false);
select pg_temp.t('T1 el ODONTÓLOGO registra la sesión 1: se descuentan 2 jeringas (9 → 7) en la misma operación, ligadas al tratamiento',
  current_setting('t.t1') = 'OK:1' and pg_temp.stock('Resina A2', :CA) = 7
  and exists (select 1 from movimientos_inventario where origen = 'tratamiento' and tipo = 'salida' and cantidad = -2
                and tratamiento_id = '71170000-0000-0000-0000-000000000001' and usuario_id = :DA and motivo like 'Tratamiento: Resina 36%'));
select pg_temp.como(:DA, $q$update tratamientos set sesiones_completadas = 1 where id = '71170000-0000-0000-0000-000000000001'$q$);
select pg_temp.t('T2 repetir el mismo cambio (reintento de la cola sin conexión) NO descuenta dos veces', pg_temp.stock('Resina A2', :CA) = 7);
select pg_temp.como(:DA, $q$update tratamientos set sesiones_completadas = 2, estado = 'completado', completado_en = now() where id = '71170000-0000-0000-0000-000000000001'$q$);
select pg_temp.t('T3 sesión 2 + completado: 2 más (7 → 5); el contador queda en 2',
  pg_temp.stock('Resina A2', :CA) = 5
  and (select inventario_sesiones_descontadas from tratamientos where id = '71170000-0000-0000-0000-000000000001') = 2);
select pg_temp.como(:DA, $q$update tratamientos set estado = 'en_progreso' where id = '71170000-0000-0000-0000-000000000001'$q$);
select pg_temp.como(:DA, $q$update tratamientos set estado = 'completado', inventario_sesiones_descontadas = 0 where id = '71170000-0000-0000-0000-000000000001'$q$);
select pg_temp.t('T4 reabrir y volver a completar, aun mandando el contador en 0, no descuenta otra vez (el contador lo fija la base)',
  pg_temp.stock('Resina A2', :CA) = 5
  and (select inventario_sesiones_descontadas from tratamientos where id = '71170000-0000-0000-0000-000000000001') = 2);
-- Sin stock: guantes en 0
select set_config('t.t5', pg_temp.como(:DA, $q$update tratamientos set estado = 'completado', completado_en = now() where id = '71170000-0000-0000-0000-000000000002'$q$), false);
select pg_temp.t('T5 SIN stock la atención NO se bloquea: el tratamiento se completa y el stock queda en -1',
  current_setting('t.t5') = 'OK:1'
  and (select estado from tratamientos where id = '71170000-0000-0000-0000-000000000002') = 'completado'
  and pg_temp.stock('Guantes', :CA) = -1);
select set_config('t.t6', pg_temp.val(:DA, $q$select fn_inventario_avisos_tratamiento('71170000-0000-0000-0000-000000000002')::text$q$), false);
select pg_temp.t('T6 y se avisa: el odontólogo recibe «Guantes» agotado para ese tratamiento',
  jsonb_array_length(current_setting('t.t6')::jsonb) = 1
  and current_setting('t.t6')::jsonb -> 0 ->> 'nombre' = 'Guantes' and (current_setting('t.t6')::jsonb -> 0 ->> 'agotado')::boolean);
select pg_temp.t('T7 un tratamiento sin catálogo no descuenta nada',
  pg_temp.como(:DA, $q$update tratamientos set estado = 'completado' where id = '71170000-0000-0000-0000-000000000003'$q$) = 'OK:1'
  and not exists (select 1 from movimientos_inventario where tratamiento_id = '71170000-0000-0000-0000-000000000003'));
-- Atomicidad: si el cambio del tratamiento falla, no queda descuento
insert into tratamientos (id, paciente_id, descripcion, costo, catalogo_id, numero_sesiones, dentista_id) values
 ('71170000-0000-0000-0000-000000000004','b1170000-0000-0000-0000-00000000000a','Resina 11', 800,'d1170000-0000-0000-0000-000000000001', 3,'a1170000-0000-0000-0000-000000000003');
select set_config('t.t8', pg_temp.como(:DA, $q$update tratamientos set sesiones_completadas = 1, estado = 'inexistente' where id = '71170000-0000-0000-0000-000000000004'$q$), false);
select pg_temp.t('T8 ATÓMICO: si el cambio del tratamiento se rechaza, no queda ningún descuento ni movimiento',
  current_setting('t.t8') like 'ERR|%' and pg_temp.stock('Resina A2', :CA) = 5
  and not exists (select 1 from movimientos_inventario where tratamiento_id = '71170000-0000-0000-0000-000000000004'));
-- Upsert de la cola offline sobre un tratamiento existente
select pg_temp.como(:DA, $q$insert into tratamientos (id, paciente_id, descripcion, costo, catalogo_id, numero_sesiones, sesiones_completadas, estado, dentista_id)
  values ('71170000-0000-0000-0000-000000000001','b1170000-0000-0000-0000-00000000000a','Resina 36', 800,'d1170000-0000-0000-0000-000000000001', 2, 2, 'completado','a1170000-0000-0000-0000-000000000003')
  on conflict (id) do update set sesiones_completadas = excluded.sesiones_completadas, estado = excluded.estado$q$);
select pg_temp.t('T9 un upsert (cola sin conexión) de un tratamiento ya completado no vuelve a descontar',
  pg_temp.stock('Resina A2', :CA) = 5 and (select count(*) from movimientos_inventario where tratamiento_id = '71170000-0000-0000-0000-000000000001') = 2);
-- Tratamiento anterior a la 117 (contador NULL): solo cuenta lo nuevo
alter table tratamientos disable trigger trg_inventario_tratamiento;
update tratamientos set sesiones_completadas = 2, inventario_sesiones_descontadas = null where id = '71170000-0000-0000-0000-000000000004';
alter table tratamientos enable trigger trg_inventario_tratamiento;
select pg_temp.como(:DA, $q$update tratamientos set sesiones_completadas = 3 where id = '71170000-0000-0000-0000-000000000004'$q$);
select pg_temp.t('T10 un tratamiento que ya llevaba 2 sesiones antes de la 117 solo descuenta la sesión nueva (5 → 3)',
  pg_temp.stock('Resina A2', :CA) = 3
  and (select count(*) from movimientos_inventario where tratamiento_id = '71170000-0000-0000-0000-000000000004') = 1);
insert into tratamientos (id, paciente_id, descripcion, costo, catalogo_id, numero_sesiones, sesiones_completadas, estado, dentista_id) values
 ('71170000-0000-0000-0000-000000000005','b1170000-0000-0000-0000-00000000000a','Resina capturada completa', 800,'d1170000-0000-0000-0000-000000000001', 1, 1, 'completado','a1170000-0000-0000-0000-000000000003');
select pg_temp.t('T11 un tratamiento que se crea ya completado descuenta su sesión (3 → 1)', pg_temp.stock('Resina A2', :CA) = 1);
select pg_temp.t('T12 un material desactivado deja de descontarse',
  pg_temp.como(:OA, format('update materiales set activo = false where id = %L', current_setting('t.guantes'))) = 'OK:1'
  and pg_temp.como(:DA, $q$insert into tratamientos (paciente_id, descripcion, costo, catalogo_id, estado, dentista_id) values ('b1170000-0000-0000-0000-00000000000a','Extracción 18', 600,'d1170000-0000-0000-0000-000000000002','completado','a1170000-0000-0000-0000-000000000003')$q$) = 'OK:1'
  and pg_temp.stock('Guantes', :CA) = -1
  and pg_temp.como(:OA, format('update materiales set activo = true where id = %L', current_setting('t.guantes'))) = 'OK:1');

-- ============================================================ S. Alerta de stock bajo (tablero)
select set_config('t.s1', pg_temp.val(:OA, 'select fn_inventario_stock_bajo()::text'), false);
select pg_temp.t('S1 el tablero del propietario lista lo que está en o bajo el mínimo: Guantes (agotado) primero y Resina A2 (1 ≤ 3)',
  jsonb_array_length(current_setting('t.s1')::jsonb) = 2
  and current_setting('t.s1')::jsonb -> 0 ->> 'nombre' = 'Guantes' and current_setting('t.s1')::jsonb -> 1 ->> 'nombre' = 'Resina A2');
select pg_temp.t('S2 el asistente lo ve; odontólogo y recepción reciben lista vacía',
  jsonb_array_length(pg_temp.val(:AA, 'select fn_inventario_stock_bajo()::text')::jsonb) = 2
  and pg_temp.val(:DA, 'select fn_inventario_stock_bajo()::text') = '[]'
  and pg_temp.val(:RA, 'select fn_inventario_stock_bajo()::text') = '[]');

-- ============================================================ I. Aislamiento entre clínicas
select pg_temp.t('I1 el propietario de B no ve materiales, movimientos ni recetas de A',
  pg_temp.val(:OB, 'select count(*)::text from materiales') = '0'
  and pg_temp.val(:OB, 'select count(*)::text from movimientos_inventario') = '0'
  and pg_temp.val(:OB, 'select count(*)::text from receta_materiales') = '0'
  and pg_temp.val(:OB, 'select fn_inventario_stock_bajo()::text') = '[]');
select pg_temp.t('I2 B no puede mover el stock de A (mismo mensaje que si no existiera) ni modificar sus materiales',
  pg_temp.hint_de(:OB, format('select fn_inventario_registrar_movimiento(%L, ''entrada'', 50)', current_setting('t.resina'))) = 'MATERIAL_NO_ENCONTRADO'
  and pg_temp.hint_de(:OB, $q$select fn_inventario_registrar_movimiento('00000000-0000-0000-0000-000000000123', 'entrada', 50)$q$) = 'MATERIAL_NO_ENCONTRADO'
  and pg_temp.como(:OB, format('update materiales set nombre = ''Robado'', stock_minimo = 99 where id = %L', current_setting('t.resina'))) = 'OK:0'
  and pg_temp.stock('Resina A2', :CA) = 1);
select pg_temp.t('I3 B no puede armar una receta con el catálogo o los materiales de A',
  pg_temp.como(:OB, format($q$insert into receta_materiales (catalogo_id, material_id, cantidad) values ('d1170000-0000-0000-0000-000000000003', %L, 1)$q$, current_setting('t.resina'))) like 'ERR|%'
  and pg_temp.como(:OB, format($q$insert into receta_materiales (clinica_id, catalogo_id, material_id, cantidad) values (%L, 'd1170000-0000-0000-0000-000000000001', %L, 1)$q$, :CA, current_setting('t.resina'))) like 'ERR|%'
  and pg_temp.como(:OB, $q$delete from receta_materiales$q$) = 'OK:0');
select pg_temp.t('I4 B no puede crear materiales a nombre de A',
  pg_temp.como(:OB, format($q$insert into materiales (clinica_id, nombre) values (%L, 'Colado')$q$, :CA)) like 'ERR|%'
  and not exists (select 1 from materiales where nombre = 'Colado'));
select pg_temp.t('I5 B no recibe avisos de un tratamiento de A',
  pg_temp.val(:OB, $q$select fn_inventario_avisos_tratamiento('71170000-0000-0000-0000-000000000002')::text$q$) = '[]');

-- ============================================================ P. Plan sin inventario (Esencial)
select pg_temp.t('P1 Esencial: no ve ni crea materiales, y el registro de movimientos dice FUNCIONALIDAD_NO_INCLUIDA',
  pg_temp.como(:OE, $q$insert into materiales (nombre) values ('Esencial')$q$) like 'ERR|42501|%'
  and pg_temp.hint_de(:OE, format('select fn_inventario_registrar_movimiento(%L, ''entrada'', 1)', current_setting('t.resina'))) = 'FUNCIONALIDAD_NO_INCLUIDA'
  and pg_temp.val(:OE, 'select fn_inventario_stock_bajo()::text') = '[]');
insert into catalogo_tratamientos (id, clinica_id, nombre, precio) values ('d1170000-0000-0000-0000-00000000000e','c1170000-0000-0000-0000-00000000000e','Limpieza', 400);
insert into materiales (id, clinica_id, nombre, stock) values ('e1170000-0000-0000-0000-0000000000e1','c1170000-0000-0000-0000-00000000000e','Pasta', 5);
insert into receta_materiales (clinica_id, catalogo_id, material_id, cantidad) values ('c1170000-0000-0000-0000-00000000000e','d1170000-0000-0000-0000-00000000000e','e1170000-0000-0000-0000-0000000000e1', 1);
insert into tratamientos (paciente_id, descripcion, costo, catalogo_id, estado) values ('b1170000-0000-0000-0000-00000000000e','Limpieza', 400,'d1170000-0000-0000-0000-00000000000e','completado');
select pg_temp.t('P2 sin inventario en el plan, completar un tratamiento no descuenta (aunque hubiera receta de antes)',
  (select stock from materiales where id = 'e1170000-0000-0000-0000-0000000000e1') = 5);

do $$ declare v_f int; v_o int; begin
  select count(*) filter (where ok), count(*) filter (where not ok) into v_o, v_f from _res;
  raise notice 'RESULTADO 117: % pasaron, % fallaron (de %)', v_o, v_f, v_o + v_f;
  if v_f > 0 then raise exception 'FALLARON: %', (select string_agg(left(nombre, 150), ' | ') from _res where not ok); end if;
end $$;
rollback;
