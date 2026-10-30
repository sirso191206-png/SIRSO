-- ============================================================
-- SIRO — 122: saldo con cargos reales, búsqueda sin acentos, teléfonos normalizados y planes públicos.
-- ------------------------------------------------------------
-- 1. SALDO (v_saldo_pacientes). Antes TODO tratamiento no cancelado contaba como deuda —incluidos los «planeado», que son
--    solo una propuesta/presupuesto— y se ignoraba el DESCUENTO capturado en cada tratamiento. Ahora:
--      total_tratamientos (= cargos) = costo − descuento de los tratamientos ACEPTADOS por el paciente: aceptado,
--                                      en_progreso, pausado y completado. «Pagado» no es un estado: se calcula con los pagos.
--      total_pagado                  = sin cambios (pagos no anulados menos reembolsos).
--      saldo                         = cargos − pagado (negativo = a favor del paciente).
--      total_presupuestado (nueva, al final) = costo − descuento de los «planeado»: se muestra, no se cobra.
--    Los cancelados no cuentan (como antes). No se modifica ningún registro: solo cambia el cálculo. Además recepción ya
--    recibe el saldo real (antes, sin ver los tratamientos, su saldo salía sin cargos).
-- 2. BÚSQUEDA SIN ACENTOS. pacientes.busqueda: columna GENERADA (no se escribe a mano; el texto original no cambia) con
--    nombre, apellidos, expediente y correo en minúsculas y sin acentos (unaccent). v_pacientes_seguro la expone al final;
--    a quien no ve los apellidos del paciente se le da sin ellos. Índice trigram para que ilike '%…%' sea rápido.
-- 3. TELÉFONOS. fn_normalizar_telefono: solo dígitos, con «+» inicial si lo traía, SI el valor tiene únicamente dígitos,
--    espacios, guiones, puntos o paréntesis y queda con 10 a 15 dígitos. Cualquier otra cosa (letras, extensiones «ext.»,
--    menos de 10 o más de 15 dígitos) NO se toca: se reporta en v_telefonos_por_revisar. No se asume México: el prefijo
--    internacional se conserva tal cual. Cada cambio queda en telefonos_normalizacion_122 (antes/después) y el rollback
--    los devuelve. Un trigger aplica la misma regla a todo lo que se guarde en adelante.
-- 4. PLANES PÚBLICOS. planes_publicos(): lo que la página pública puede mostrar (planes activos y visibles, precios y
--    funcionalidades incluidas) sin abrir planes_catalogo al rol anónimo.
-- Re-ejecutable. Rollback: supabase/rollback/siro_v3/rollback_122.sql.
-- ============================================================
begin;

-- ---------- 1. Saldo ----------
-- La vista corre con los permisos de su dueño (security_invoker = false) y filtra ella misma qué pacientes ve cada quien:
-- recepción cobra, pero RLS no le deja ver los tratamientos (son clínicos), así que con los permisos de recepción el saldo
-- salía SIN cargos (solo pagos: siempre «a favor»). Aquí recepción recibe el saldo correcto —solo montos, ningún detalle
-- clínico— y la misma regla de siempre para los demás: su clínica, sesión vigente, y el dentista/asistente solo los
-- pacientes que tiene asignados.
drop view if exists v_saldo_pacientes;
create view v_saldo_pacientes
with (security_invoker = false) as
select
  p.id as paciente_id,
  coalesce(sum(t.costo - coalesce(t.descuento, 0)) filter (where t.estado in ('aceptado', 'en_progreso', 'pausado', 'completado')), 0) as total_tratamientos,
  coalesce((select sum(pg.monto) from pagos pg where pg.paciente_id = p.id and pg.tipo <> 'reembolso' and pg.anulado_en is null), 0)
    - coalesce((select sum(pg.monto) from pagos pg where pg.paciente_id = p.id and pg.tipo = 'reembolso' and pg.anulado_en is null), 0) as total_pagado,
  coalesce(sum(t.costo - coalesce(t.descuento, 0)) filter (where t.estado in ('aceptado', 'en_progreso', 'pausado', 'completado')), 0)
    - (coalesce((select sum(pg.monto) from pagos pg where pg.paciente_id = p.id and pg.tipo <> 'reembolso' and pg.anulado_en is null), 0)
       - coalesce((select sum(pg.monto) from pagos pg where pg.paciente_id = p.id and pg.tipo = 'reembolso' and pg.anulado_en is null), 0)) as saldo,
  coalesce(sum(t.costo - coalesce(t.descuento, 0)) filter (where t.estado = 'planeado'), 0) as total_presupuestado
from pacientes p
left join tratamientos t on t.paciente_id = p.id
where (select fn_sesion_activa())
  and p.clinica_id = auth_clinica_id()
  and (auth_rol() in ('owner', 'recepcion') or auth_paciente_asignado(p.id))
group by p.id;
revoke all on v_saldo_pacientes from anon;
grant select on v_saldo_pacientes to authenticated;

-- ---------- 2. Búsqueda sin acentos ----------
create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- SECURITY DEFINER: corre al guardar un paciente con los permisos de quien guarda, que no necesariamente puede usar el
-- esquema `extensions`; así la columna generada no depende de ese permiso.
create or replace function fn_sin_acentos(p_texto text)
returns text
language sql immutable parallel safe security definer
set search_path = public, extensions
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_texto, '')))
$$;
grant execute on function fn_sin_acentos(text) to anon, authenticated;

alter table pacientes add column if not exists busqueda text
  generated always as (fn_sin_acentos(coalesce(nombre_completo, '') || ' ' || coalesce(primer_apellido, '') || ' ' || coalesce(segundo_apellido, '') || ' '
                                        || coalesce(numero_expediente, '') || ' ' || coalesce(correo, ''))) stored;
grant select (busqueda) on pacientes to authenticated;
create index if not exists idx_pacientes_busqueda_trgm on pacientes using gin (busqueda extensions.gin_trgm_ops);

-- Igual que la 121 + la columna busqueda al final.
create or replace view v_pacientes_seguro
with (security_invoker = true) as
select
  id, clinica_id, nombre_completo, fecha_nacimiento, telefono, correo,
  direccion, creado_en, creado_por, archivado_en, numero_expediente,
  dentista_responsable_id,
  case when auth_paciente_asignado(id) then contacto_emergencia end as contacto_emergencia,
  case when auth_paciente_asignado(id) then seguro_medico end as seguro_medico,
  case when auth_paciente_asignado(id) then notas_generales end as notas_generales,
  fn_curp_visible(id) as curp,
  case when auth_paciente_asignado(id) or auth_rol() = 'recepcion' then sexo end as sexo,
  case when auth_paciente_asignado(id) or auth_rol() = 'recepcion' then primer_apellido end as primer_apellido,
  case when auth_paciente_asignado(id) or auth_rol() = 'recepcion' then segundo_apellido end as segundo_apellido,
  case when auth_paciente_asignado(id) or auth_rol() = 'recepcion' then tutor_legal end as tutor_legal,
  case when auth_paciente_asignado(id) then estado_civil end as estado_civil,
  case when auth_paciente_asignado(id) then ocupacion end as ocupacion,
  case when auth_paciente_asignado(id) then escolaridad end as escolaridad,
  case when auth_paciente_asignado(id) then nacionalidad end as nacionalidad,
  case when auth_paciente_asignado(id) then telefono_secundario end as telefono_secundario,
  case when auth_paciente_asignado(id) then whatsapp end as whatsapp,
  case when auth_paciente_asignado(id) then calle end as calle,
  case when auth_paciente_asignado(id) then numero_exterior end as numero_exterior,
  case when auth_paciente_asignado(id) then numero_interior end as numero_interior,
  case when auth_paciente_asignado(id) then colonia end as colonia,
  case when auth_paciente_asignado(id) then municipio end as municipio,
  case when auth_paciente_asignado(id) then estado_domicilio end as estado_domicilio,
  case when auth_paciente_asignado(id) then codigo_postal end as codigo_postal,
  case when auth_paciente_asignado(id) then tipo_paciente end as tipo_paciente,
  estado_expediente,
  case when auth_paciente_asignado(id) then referido_por end as referido_por,
  actualizado_en,
  case when auth_paciente_asignado(id) or auth_rol() = 'recepcion' then busqueda
       else fn_sin_acentos(concat_ws(' ', nombre_completo, numero_expediente, correo)) end as busqueda
from pacientes;

-- Igual que la 121 + 'busqueda' entre lo que no cuenta como cambio (es generada: la recalcula la base).
create or replace function fn_restringir_columnas_pacientes_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_columnas_base text[] := array[
    'nombre_completo', 'primer_apellido', 'segundo_apellido',
    'fecha_nacimiento', 'sexo',
    'telefono', 'telefono_secundario', 'whatsapp', 'correo',
    'direccion', 'calle', 'numero_exterior', 'numero_interior',
    'colonia', 'municipio', 'estado_domicilio', 'codigo_postal',
    'nacionalidad', 'referido_por', 'archivado_en', 'busqueda'
  ];
  v_columnas_permitidas text[];
  v_old_reducido jsonb;
  v_new_reducido jsonb;
  v_clave text;
begin
  if auth_rol() in ('owner', 'dentista') or auth_rol() is null then
    return new;
  end if;

  if auth_rol() = 'recepcion' then
    v_columnas_permitidas := v_columnas_base || array['tipo_paciente', 'tutor_legal'];
  else
    v_columnas_permitidas := v_columnas_base;
  end if;

  v_old_reducido := to_jsonb(old);
  v_new_reducido := to_jsonb(new);
  foreach v_clave in array v_columnas_permitidas loop
    v_old_reducido := v_old_reducido - v_clave;
    v_new_reducido := v_new_reducido - v_clave;
  end loop;

  if v_old_reducido is distinct from v_new_reducido then
    raise exception 'El rol % solo puede modificar los datos administrativos permitidos — no información clínica ni estado_expediente.', auth_rol();
  end if;

  return new;
end;
$$;

-- ---------- 3. Teléfonos ----------
create or replace function fn_normalizar_telefono(p_valor text)
returns text
language sql immutable parallel safe
as $$
  select case
    when p_valor is null then null
    when btrim(p_valor) = '' then p_valor   -- vacío: no se toca (no es un teléfono que corregir)
    when btrim(p_valor) ~ '^\+?[0-9 ().-]+$'
     and length(regexp_replace(p_valor, '[^0-9]', '', 'g')) between 10 and 15
      then (case when btrim(p_valor) like '+%' then '+' else '' end) || regexp_replace(p_valor, '[^0-9]', '', 'g')
    else p_valor
  end
$$;
grant execute on function fn_normalizar_telefono(text) to anon, authenticated;

create table if not exists telefonos_normalizacion_122 (
  id bigserial primary key,
  tabla text not null,
  registro_id uuid not null,
  campo text not null,
  antes text not null,
  despues text not null,
  creado_en timestamptz not null default now()
);
alter table telefonos_normalizacion_122 enable row level security;
revoke all on telefonos_normalizacion_122 from anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'telefonos_normalizacion_122' and policyname = 'sesion_activa_telefonos_normalizacion_122') then
    create policy sesion_activa_telefonos_normalizacion_122 on public.telefonos_normalizacion_122 as restrictive for all to authenticated
      using ((select fn_sesion_activa())) with check ((select fn_sesion_activa()));
  end if;
end $$;

do $$
declare
  v_def record;
  v_n integer;
begin
  -- Columnas de texto simples
  for v_def in select * from (values
    ('pacientes', 'telefono'), ('pacientes', 'telefono_secundario'), ('pacientes', 'whatsapp'),
    ('clinicas', 'telefono'), ('sucursales', 'telefono'), ('sucursales', 'whatsapp'), ('solicitudes_cita', 'telefono')
  ) as t(tabla, campo) loop
    execute format(
      'insert into telefonos_normalizacion_122 (tabla, registro_id, campo, antes, despues)
         select %L, id, %L, %I, fn_normalizar_telefono(%I) from %I
         where %I is not null and fn_normalizar_telefono(%I) is distinct from %I
           and not exists (select 1 from telefonos_normalizacion_122 x where x.tabla = %L and x.registro_id = %I.id and x.campo = %L)',
      v_def.tabla, v_def.campo, v_def.campo, v_def.campo, v_def.tabla, v_def.campo, v_def.campo, v_def.campo,
      v_def.tabla, v_def.tabla, v_def.campo);
    execute format('update %I set %I = fn_normalizar_telefono(%I) where %I is not null and fn_normalizar_telefono(%I) is distinct from %I',
      v_def.tabla, v_def.campo, v_def.campo, v_def.campo, v_def.campo, v_def.campo);
    get diagnostics v_n = row_count;
    raise notice 'teléfonos normalizados en %.%: %', v_def.tabla, v_def.campo, v_n;
  end loop;

  -- Dentro de JSON: contacto de emergencia y tutor
  for v_def in select * from (values
    ('contacto_emergencia', 'telefono'), ('contacto_emergencia', 'telefono_alterno'), ('tutor_legal', 'telefono')
  ) as t(campo, llave) loop
    execute format(
      'insert into telefonos_normalizacion_122 (tabla, registro_id, campo, antes, despues)
         select ''pacientes'', id, %L, %I->>%L, fn_normalizar_telefono(%I->>%L) from pacientes
         where %I->>%L is not null and fn_normalizar_telefono(%I->>%L) is distinct from %I->>%L
           and not exists (select 1 from telefonos_normalizacion_122 x where x.tabla = ''pacientes'' and x.registro_id = pacientes.id and x.campo = %L)',
      v_def.campo || '.' || v_def.llave, v_def.campo, v_def.llave, v_def.campo, v_def.llave, v_def.campo, v_def.llave,
      v_def.campo, v_def.llave, v_def.campo, v_def.llave, v_def.campo || '.' || v_def.llave);
    execute format(
      'update pacientes set %I = jsonb_set(%I, %L, to_jsonb(fn_normalizar_telefono(%I->>%L)))
         where %I->>%L is not null and fn_normalizar_telefono(%I->>%L) is distinct from %I->>%L',
      v_def.campo, v_def.campo, array[v_def.llave], v_def.campo, v_def.llave,
      v_def.campo, v_def.llave, v_def.campo, v_def.llave, v_def.campo, v_def.llave);
  end loop;
end $$;

-- En adelante, la misma regla al guardar (también si el dato llega por la API sin pasar por la app).
create or replace function fn_normalizar_telefonos_fila()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'pacientes' then
    new.telefono := fn_normalizar_telefono(new.telefono);
    new.telefono_secundario := fn_normalizar_telefono(new.telefono_secundario);
    new.whatsapp := fn_normalizar_telefono(new.whatsapp);
    if new.contacto_emergencia ? 'telefono' and new.contacto_emergencia->>'telefono' is not null then
      new.contacto_emergencia := jsonb_set(new.contacto_emergencia, '{telefono}', to_jsonb(fn_normalizar_telefono(new.contacto_emergencia->>'telefono')));
    end if;
    if new.contacto_emergencia ? 'telefono_alterno' and new.contacto_emergencia->>'telefono_alterno' is not null then
      new.contacto_emergencia := jsonb_set(new.contacto_emergencia, '{telefono_alterno}', to_jsonb(fn_normalizar_telefono(new.contacto_emergencia->>'telefono_alterno')));
    end if;
    if new.tutor_legal ? 'telefono' and new.tutor_legal->>'telefono' is not null then
      new.tutor_legal := jsonb_set(new.tutor_legal, '{telefono}', to_jsonb(fn_normalizar_telefono(new.tutor_legal->>'telefono')));
    end if;
  elsif tg_table_name = 'sucursales' then
    new.telefono := fn_normalizar_telefono(new.telefono);
    new.whatsapp := fn_normalizar_telefono(new.whatsapp);
  else
    new.telefono := fn_normalizar_telefono(new.telefono);
  end if;
  return new;
end;
$$;
do $$
declare v_tabla text;
begin
  foreach v_tabla in array array['pacientes', 'clinicas', 'sucursales', 'solicitudes_cita'] loop
    execute format('drop trigger if exists trg_normalizar_telefonos on %I', v_tabla);
    execute format('create trigger trg_normalizar_telefonos before insert or update on %I for each row execute function fn_normalizar_telefonos_fila()', v_tabla);
  end loop;
end $$;

-- Lo que no se pudo normalizar con seguridad, para revisarlo a mano (cada quien ve lo de su clínica: RLS de cada tabla).
create or replace view v_telefonos_por_revisar
with (security_invoker = true) as
select 'paciente' as tipo, p.id, p.clinica_id, p.nombre_completo as nombre, c.campo, c.valor
from pacientes p
cross join lateral (values ('telefono', p.telefono), ('telefono_secundario', p.telefono_secundario), ('whatsapp', p.whatsapp),
  ('contacto_emergencia.telefono', p.contacto_emergencia->>'telefono'), ('tutor_legal.telefono', p.tutor_legal->>'telefono')) as c(campo, valor)
where nullif(btrim(c.valor), '') is not null and c.valor !~ '^\+?[0-9]{10,15}$'
union all
select 'sucursal', s.id, s.clinica_id, s.nombre, c.campo, c.valor
from sucursales s cross join lateral (values ('telefono', s.telefono), ('whatsapp', s.whatsapp)) as c(campo, valor)
where nullif(btrim(c.valor), '') is not null and c.valor !~ '^\+?[0-9]{10,15}$'
union all
select 'clinica', cl.id, cl.id, cl.nombre, 'telefono', cl.telefono
from clinicas cl
where nullif(btrim(cl.telefono), '') is not null and cl.telefono !~ '^\+?[0-9]{10,15}$';
revoke all on v_telefonos_por_revisar from anon;
grant select on v_telefonos_por_revisar to authenticated;

-- ---------- 4. Planes públicos ----------
create or replace function planes_publicos()
returns table (plan text, nombre text, descripcion text, precio_mensual numeric, precio_anual numeric, moneda text,
               permite_mensual boolean, permite_anual boolean, recomendado boolean, orden integer, max_pacientes integer,
               max_usuarios integer, max_almacenamiento_mb integer, limite_sucursales integer, funcionalidades text[])
language sql stable security definer set search_path = public
as $$
  select pc.plan, pc.nombre, pc.descripcion, pc.precio_mensual, pc.precio_anual, pc.moneda, pc.permite_mensual, pc.permite_anual,
         pc.recomendado, pc.orden, pc.max_pacientes, pc.max_usuarios, pc.max_almacenamiento_mb, pc.limite_sucursales,
         coalesce((select array_agg(f.nombre order by f.orden, f.nombre)
                   from plan_funcionalidades pf join funcionalidades f on f.codigo = pf.funcionalidad
                   where pf.plan = pc.plan and pf.habilitada and f.activo), '{}')
  from planes_catalogo pc
  where pc.activo and pc.visible
  order by pc.orden, pc.precio_mensual
$$;
revoke all on function planes_publicos() from public;
grant execute on function planes_publicos() to anon, authenticated;

commit;
