-- ============================================================
-- SIRO — 118: inventario de materiales ligado a la consulta.
-- ------------------------------------------------------------
--  * materiales: stock, mínimo, unidad y sucursal (NULL = almacén general de la clínica). El stock NO se escribe desde la
--    API: solo cambia con un movimiento (no hay permiso de columna sobre `stock`). Un material no se borra: se desactiva.
--  * movimientos_inventario: historial inmutable (sin UPDATE ni DELETE para nadie de la API). Entrada, salida o ajuste;
--    guarda cuánto cambió, el stock antes y después, quién (id + nombre, por si el usuario se elimina) y cuándo.
--    `tratamiento_id` va SIN llave foránea a propósito: el historial sobrevive aunque el tratamiento se borre.
--  * receta_materiales: cuánto de cada material consume UNA sesión de un tratamiento del catálogo.
--  * Descuento automático: el disparador trg_inventario_tratamiento (BEFORE INSERT/UPDATE en tratamientos) llama a
--    fn_inventario_descontar_tratamiento en la MISMA transacción que registra la sesión o completa el tratamiento, así
--    que cubre todas las rutas (consulta, ficha del paciente, cola sin conexión). Atómico: si el cambio del tratamiento
--    falla, no queda ningún descuento; dos consultas simultáneas sobre el mismo material se serializan (FOR UPDATE, en
--    orden de id para no provocar interbloqueos).
--      - Sesiones «efectivas» = sesiones_completadas; un tratamiento `completado` cuenta al menos 1.
--      - tratamientos.inventario_sesiones_descontadas recuerda hasta qué sesión ya se descontó: un reintento de la cola
--        offline (mismo valor) o volver a marcar «completado» no descuenta dos veces. La columna la fija SIEMPRE el
--        disparador (lo que mande el cliente se ignora). NULL = tratamiento anterior a la 118: su base es lo que ya tenía.
--      - Sin stock suficiente NO se bloquea la atención: el stock queda en negativo (refleja lo que falta registrar) y
--        fn_inventario_avisos_tratamiento lo informa a la pantalla.
--      - Sin la funcionalidad `inventario` en el plan no se descuenta nada (el contador avanza igual: activar el
--        inventario después no cobra sesiones pasadas).
--  * Plan: funcionalidad `inventario` (aplicación base_de_datos, políticas restrictivas plan_func_*). Se agrega a las
--    plantillas Profesional, Clínica y Empresarial; las suscripciones vigentes NO cambian (GUIA_PLANES §5: una funcionalidad
--    nueva no se activa sola en clínicas existentes).
--  * Roles: propietario y asistente administran el inventario (materiales, recetas, entradas, salidas y ajustes).
--    Odontólogo y recepción no ven las tablas; el descuento lo hace el disparador (SECURITY DEFINER).
-- Requiere 116. Re-ejecutable. Rollback: supabase/rollback/siro_v3/rollback_118.sql.
-- ============================================================
begin;

do $$ begin
  if to_regclass('public.errores_app') is null then raise exception '118 requiere la 116.'; end if;
end $$;

-- ---------- 1. Funcionalidad del plan ----------
insert into funcionalidades (codigo, nombre, descripcion, categoria, aplicacion, nucleo, orden)
values ('inventario', 'Inventario de materiales', 'Materiales, entradas, ajustes y descuento automático desde la consulta.',
        'administrativo', 'base_de_datos', false, 315)
on conflict (codigo) do update set aplicacion = 'base_de_datos';
insert into plan_funcionalidades (plan, funcionalidad, habilitada)
select p.plan, 'inventario', true from planes_catalogo p where p.plan in ('profesional', 'clinica', 'empresarial')
on conflict (plan, funcionalidad) do nothing;

-- ---------- 2. Tablas ----------
create table if not exists materiales (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  sucursal_id uuid references sucursales(id) on delete set null,
  nombre text not null check (length(btrim(nombre)) between 1 and 120),
  categoria text check (categoria is null or length(categoria) <= 60),
  unidad text not null default 'pieza' check (length(btrim(unidad)) between 1 and 30),
  stock numeric(12, 2) not null default 0,
  stock_minimo numeric(12, 2) not null default 0 check (stock_minimo >= 0),
  activo boolean not null default true,
  creado_por uuid references usuarios(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create unique index if not exists uq_materiales_nombre
  on materiales (clinica_id, coalesce(sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(nombre)));
create index if not exists idx_materiales_clinica on materiales (clinica_id) where activo;

create table if not exists movimientos_inventario (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  material_id uuid not null references materiales(id),   -- NO ACTION: un material con historial no se borra (salvo con su clínica)
  tipo text not null check (tipo in ('entrada', 'salida', 'ajuste')),
  cantidad numeric(12, 2) not null,                      -- con signo: lo que cambió el stock
  stock_anterior numeric(12, 2) not null,
  stock_resultante numeric(12, 2) not null,
  motivo text check (motivo is null or length(motivo) <= 300),
  origen text not null default 'manual' check (origen in ('manual', 'tratamiento')),
  tratamiento_id uuid,
  usuario_id uuid references usuarios(id) on delete set null,
  usuario_nombre text,
  creado_en timestamptz not null default now(),
  constraint movimientos_inventario_cuadra check (stock_resultante = stock_anterior + cantidad)
);
create index if not exists idx_movimientos_inventario_material on movimientos_inventario (material_id, creado_en desc);
create index if not exists idx_movimientos_inventario_clinica on movimientos_inventario (clinica_id, creado_en desc);
create index if not exists idx_movimientos_inventario_tratamiento on movimientos_inventario (tratamiento_id) where tratamiento_id is not null;

create table if not exists receta_materiales (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  catalogo_id uuid not null references catalogo_tratamientos(id) on delete cascade,
  material_id uuid not null references materiales(id) on delete cascade,
  cantidad numeric(12, 2) not null check (cantidad > 0),
  creado_en timestamptz not null default now(),
  unique (catalogo_id, material_id)
);
create index if not exists idx_receta_materiales_material on receta_materiales (material_id);

alter table tratamientos add column if not exists inventario_sesiones_descontadas integer;

-- ---------- 3. Integridad: todo en la misma clínica ----------
create or replace function fn_inventario_validar_material() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.clinica_id is null then new.clinica_id := auth_clinica_id(); end if;
  if tg_op = 'UPDATE' then
    if new.clinica_id is distinct from old.clinica_id then
      raise exception 'Un material no puede cambiar de clínica.' using errcode = 'P0001', hint = 'MATERIAL_INCOHERENTE';
    end if;
    new.actualizado_en := now();
  end if;
  if new.sucursal_id is not null and not exists (select 1 from sucursales s where s.id = new.sucursal_id and s.clinica_id = new.clinica_id) then
    raise exception 'La sucursal no pertenece a tu clínica.' using errcode = 'P0001', hint = 'MATERIAL_INCOHERENTE';
  end if;
  new.nombre := btrim(new.nombre);
  new.unidad := btrim(new.unidad);
  return new;
end $$;
revoke all on function fn_inventario_validar_material() from public, anon, authenticated;
drop trigger if exists trg_inventario_validar_material on materiales;
create trigger trg_inventario_validar_material before insert or update on materiales
  for each row execute function fn_inventario_validar_material();

create or replace function fn_inventario_validar_receta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.clinica_id is null then new.clinica_id := auth_clinica_id(); end if;
  if not exists (select 1 from catalogo_tratamientos c where c.id = new.catalogo_id and c.clinica_id = new.clinica_id)
     or not exists (select 1 from materiales m where m.id = new.material_id and m.clinica_id = new.clinica_id) then
    raise exception 'El tratamiento y el material deben ser de tu clínica.' using errcode = 'P0001', hint = 'RECETA_INCOHERENTE';
  end if;
  return new;
end $$;
revoke all on function fn_inventario_validar_receta() from public, anon, authenticated;
drop trigger if exists trg_inventario_validar_receta on receta_materiales;
create trigger trg_inventario_validar_receta before insert or update on receta_materiales
  for each row execute function fn_inventario_validar_receta();

-- ---------- 4. RLS ----------
alter table materiales enable row level security;
alter table movimientos_inventario enable row level security;
alter table receta_materiales enable row level security;
revoke all on materiales, movimientos_inventario, receta_materiales from anon, authenticated;
grant select on materiales, movimientos_inventario, receta_materiales to authenticated;
-- Sin `stock` ni `clinica_id`: el stock solo cambia con movimientos y la clínica la pone la base.
grant insert (sucursal_id, nombre, categoria, unidad, stock_minimo, activo) on materiales to authenticated;
grant update (sucursal_id, nombre, categoria, unidad, stock_minimo, activo) on materiales to authenticated;
grant insert (catalogo_id, material_id, cantidad), update (cantidad), delete on receta_materiales to authenticated;

drop policy if exists materiales_select on materiales;
create policy materiales_select on materiales for select to authenticated
  using (clinica_id = auth_clinica_id() and auth_rol() in ('owner', 'asistente') and auth_sucursal_permitida(sucursal_id));
drop policy if exists materiales_insert on materiales;
create policy materiales_insert on materiales for insert to authenticated
  with check (clinica_id = auth_clinica_id() and auth_rol() in ('owner', 'asistente') and auth_sucursal_permitida(sucursal_id));
drop policy if exists materiales_update on materiales;
create policy materiales_update on materiales for update to authenticated
  using (clinica_id = auth_clinica_id() and auth_rol() in ('owner', 'asistente') and auth_sucursal_permitida(sucursal_id))
  with check (clinica_id = auth_clinica_id() and auth_rol() in ('owner', 'asistente') and auth_sucursal_permitida(sucursal_id));

drop policy if exists movimientos_inventario_select on movimientos_inventario;
create policy movimientos_inventario_select on movimientos_inventario for select to authenticated
  using (clinica_id = auth_clinica_id() and auth_rol() in ('owner', 'asistente')
         and exists (select 1 from materiales m where m.id = material_id));

drop policy if exists receta_materiales_select on receta_materiales;
create policy receta_materiales_select on receta_materiales for select to authenticated
  using (clinica_id = auth_clinica_id() and auth_rol() in ('owner', 'asistente'));
drop policy if exists receta_materiales_write on receta_materiales;
create policy receta_materiales_write on receta_materiales for all to authenticated
  using (clinica_id = auth_clinica_id() and auth_rol() in ('owner', 'asistente'))
  with check (clinica_id = auth_clinica_id() and auth_rol() in ('owner', 'asistente'));

do $$
declare t text;
begin
  foreach t in array array['materiales', 'movimientos_inventario', 'receta_materiales'] loop
    execute format('drop policy if exists %I on public.%I', 'plan_func_' || t, t);
    execute format('create policy %I on public.%I as restrictive for all to authenticated '
                   'using ((select fn_clinica_tiene_funcionalidad(auth_clinica_id(), ''inventario''))) '
                   'with check ((select fn_clinica_tiene_funcionalidad(auth_clinica_id(), ''inventario'')))', 'plan_func_' || t, t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'sesion_activa_' || t) then
      execute format('create policy %I on public.%I as restrictive for all to authenticated '
                     'using ((select fn_sesion_activa())) with check ((select fn_sesion_activa()))', 'sesion_activa_' || t, t);
    end if;
  end loop;
end $$;

-- ---------- 5. Núcleo: aplicar un movimiento (interno) ----------
create or replace function fn_inventario_aplicar(p_material uuid, p_cantidad numeric, p_tipo text, p_motivo text,
                                                 p_origen text, p_tratamiento uuid, p_id uuid default null)
returns movimientos_inventario
language plpgsql security definer set search_path = public as $$
declare v_m materiales%rowtype; v_mov movimientos_inventario%rowtype;
begin
  select * into v_m from materiales where id = p_material for update;
  if not found then raise exception 'Material inexistente.' using errcode = 'P0001', hint = 'MATERIAL_NO_ENCONTRADO'; end if;
  insert into movimientos_inventario (id, clinica_id, material_id, tipo, cantidad, stock_anterior, stock_resultante, motivo, origen,
                                      tratamiento_id, usuario_id, usuario_nombre)
  values (coalesce(p_id, gen_random_uuid()), v_m.clinica_id, v_m.id, p_tipo, p_cantidad, v_m.stock, v_m.stock + p_cantidad,
          left(nullif(btrim(p_motivo), ''), 300), p_origen, p_tratamiento, auth.uid(),
          (select u.nombre from usuarios u where u.id = auth.uid()))
  returning * into v_mov;
  update materiales set stock = v_mov.stock_resultante where id = v_m.id;
  return v_mov;
end $$;
revoke all on function fn_inventario_aplicar(uuid, numeric, text, text, text, uuid, uuid) from public, anon, authenticated;

-- ---------- 6. Entradas, salidas y ajustes desde la pantalla de inventario ----------
-- entrada / salida: `p_cantidad` > 0 (suma / resta). ajuste: `p_cantidad` = stock CONTADO (>= 0); se guarda la diferencia.
-- `p_id` (opcional) hace la llamada idempotente: un reintento con el mismo id y los mismos datos devuelve el movimiento ya
-- registrado; con datos distintos se rechaza (MOVIMIENTO_CONFLICTO). Una salida que deja el stock en negativo se acepta y
-- se avisa (stock_negativo).
create or replace function fn_inventario_registrar_movimiento(p_material uuid, p_tipo text, p_cantidad numeric,
                                                              p_motivo text default null, p_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cl uuid := auth_clinica_id();
  v_m materiales%rowtype;
  v_mov movimientos_inventario%rowtype;
  v_delta numeric;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if auth.uid() is null or v_cl is null then
    raise exception 'Tu sesión no es válida o tu clínica no está activa. Vuelve a iniciar sesión.' using errcode = 'P0001', hint = 'SESION_INVALIDA';
  end if;
  if not fn_sesion_activa() then
    raise exception 'Tu sesión fue cerrada desde otro dispositivo. Vuelve a iniciar sesión.' using errcode = 'P0001', hint = 'SESION_CERRADA';
  end if;
  if coalesce(auth_rol(), '') not in ('owner', 'asistente') then
    raise exception 'Solo el propietario y el asistente registran movimientos de inventario.' using errcode = 'P0001', hint = 'ROL_NO_PERMITIDO';
  end if;
  if not fn_clinica_tiene_funcionalidad(v_cl, 'inventario') then
    raise exception 'Tu plan no incluye el inventario de materiales.' using errcode = 'P0001', hint = 'FUNCIONALIDAD_NO_INCLUIDA';
  end if;
  if p_tipo is null or p_tipo not in ('entrada', 'salida', 'ajuste') then
    raise exception 'Tipo de movimiento no válido.' using errcode = 'P0001', hint = 'MOVIMIENTO_INVALIDO';
  end if;
  if p_cantidad is null or p_cantidad < 0 or (p_tipo <> 'ajuste' and p_cantidad = 0) or p_cantidad > 1000000 then
    raise exception 'La cantidad no es válida.' using errcode = 'P0001', hint = 'MOVIMIENTO_INVALIDO';
  end if;
  if p_tipo in ('salida', 'ajuste') and v_motivo is null then
    raise exception 'Indica el motivo de la salida o del ajuste.' using errcode = 'P0001', hint = 'MOTIVO_REQUERIDO';
  end if;
  -- Mismo mensaje si el material no existe o es de otra clínica/sucursal (sin oráculo).
  select * into v_m from materiales where id = p_material and clinica_id = v_cl for update;
  if not found or not auth_sucursal_permitida(v_m.sucursal_id) then
    raise exception 'No se encontró el material.' using errcode = 'P0001', hint = 'MATERIAL_NO_ENCONTRADO';
  end if;

  if p_id is not null then
    select * into v_mov from movimientos_inventario where id = p_id;
    if found then
      if v_mov.material_id = v_m.id and v_mov.tipo = p_tipo and v_mov.origen = 'manual'
         and (p_tipo = 'ajuste' and v_mov.stock_resultante = p_cantidad
              or p_tipo = 'entrada' and v_mov.cantidad = p_cantidad
              or p_tipo = 'salida' and v_mov.cantidad = -p_cantidad) then
        return jsonb_build_object('ok', true, 'ya_registrado', true, 'movimiento_id', v_mov.id,
                                  'stock', v_m.stock, 'stock_negativo', v_m.stock < 0, 'stock_bajo', v_m.stock <= v_m.stock_minimo);
      end if;
      raise exception 'Ya existe un movimiento con ese identificador y datos distintos. No se registró nada.' using errcode = 'P0001', hint = 'MOVIMIENTO_CONFLICTO';
    end if;
  end if;

  v_delta := case p_tipo when 'entrada' then p_cantidad when 'salida' then -p_cantidad else p_cantidad - v_m.stock end;
  v_mov := fn_inventario_aplicar(v_m.id, v_delta, p_tipo, v_motivo, 'manual', null, p_id);
  return jsonb_build_object('ok', true, 'ya_registrado', false, 'movimiento_id', v_mov.id, 'stock', v_mov.stock_resultante,
                            'stock_negativo', v_mov.stock_resultante < 0, 'stock_bajo', v_mov.stock_resultante <= v_m.stock_minimo);
end $$;
revoke all on function fn_inventario_registrar_movimiento(uuid, text, numeric, text, uuid) from public, anon;
grant execute on function fn_inventario_registrar_movimiento(uuid, text, numeric, text, uuid) to authenticated;

-- ---------- 7. Descuento por tratamiento ----------
create or replace function fn_inventario_sesiones_efectivas(p_estado text, p_sesiones integer) returns integer
language sql immutable set search_path = public as $$
  select case when p_estado = 'completado' then greatest(coalesce(p_sesiones, 0), 1) else greatest(coalesce(p_sesiones, 0), 0) end
$$;

-- Descuenta la receta del tratamiento del catálogo `p_catalogo` × `p_sesiones`. Devuelve cuántos materiales tocó.
create or replace function fn_inventario_descontar_tratamiento(p_tratamiento uuid, p_clinica uuid, p_catalogo uuid,
                                                               p_sesiones integer, p_descripcion text)
returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  if p_catalogo is null or coalesce(p_sesiones, 0) <= 0 or not fn_funcionalidad_contratada(p_clinica, 'inventario') then
    return 0;
  end if;
  for r in
    select rm.material_id, rm.cantidad from receta_materiales rm join materiales m on m.id = rm.material_id
     where rm.catalogo_id = p_catalogo and rm.clinica_id = p_clinica and m.clinica_id = p_clinica and m.activo
     order by rm.material_id                                   -- orden fijo: sin interbloqueos entre consultas simultáneas
  loop
    perform fn_inventario_aplicar(r.material_id, -(r.cantidad * p_sesiones), 'salida',
                                  'Tratamiento: ' || coalesce(p_descripcion, '') || case when p_sesiones > 1 then ' (' || p_sesiones || ' sesiones)' else '' end,
                                  'tratamiento', p_tratamiento);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function fn_inventario_descontar_tratamiento(uuid, uuid, uuid, integer, text) from public, anon, authenticated;

create or replace function fn_inventario_tratamiento() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_prev integer; v_nuevas integer; v_cl uuid;
begin
  -- Un upsert de la cola offline sobre un tratamiento que YA existe pasa por aquí como INSERT y luego como UPDATE:
  -- el descuento lo decide solo el UPDATE (con la fila real como base).
  if tg_op = 'INSERT' then
    if exists (select 1 from tratamientos where id = new.id) then return new; end if;
    v_prev := 0;
  else
    v_prev := coalesce(old.inventario_sesiones_descontadas, fn_inventario_sesiones_efectivas(old.estado, old.sesiones_completadas));
  end if;
  v_nuevas := fn_inventario_sesiones_efectivas(new.estado, new.sesiones_completadas);
  new.inventario_sesiones_descontadas := greatest(v_prev, v_nuevas);
  if v_nuevas > v_prev and new.catalogo_id is not null then
    select clinica_id into v_cl from pacientes where id = new.paciente_id;
    perform fn_inventario_descontar_tratamiento(new.id, v_cl, new.catalogo_id, v_nuevas - v_prev, new.descripcion);
  end if;
  return new;
end $$;
revoke all on function fn_inventario_tratamiento() from public, anon, authenticated;
drop trigger if exists trg_inventario_tratamiento on tratamientos;
create trigger trg_inventario_tratamiento before insert or update on tratamientos
  for each row execute function fn_inventario_tratamiento();

-- ---------- 8. Avisos para la pantalla ----------
-- Tras registrar una sesión: materiales de la receta de ESE tratamiento que quedaron en o bajo el mínimo. Lo puede pedir
-- quien puede ver el tratamiento (el odontólogo asignado incluido). Sin plan o sin acceso: lista vacía.
create or replace function fn_inventario_avisos_tratamiento(p_tratamiento uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_cl uuid := auth_clinica_id(); v_t tratamientos%rowtype;
begin
  if v_cl is null or not fn_clinica_tiene_funcionalidad(v_cl, 'inventario') then return '[]'::jsonb; end if;
  select t.* into v_t from tratamientos t join pacientes p on p.id = t.paciente_id where t.id = p_tratamiento and p.clinica_id = v_cl;
  if not found or not auth_paciente_asignado(v_t.paciente_id) or v_t.catalogo_id is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('material_id', m.id, 'nombre', m.nombre, 'unidad', m.unidad, 'stock', m.stock,
                                                       'stock_minimo', m.stock_minimo, 'agotado', m.stock <= 0) order by m.stock, m.nombre)
                     from receta_materiales rm join materiales m on m.id = rm.material_id
                    where rm.catalogo_id = v_t.catalogo_id and m.clinica_id = v_cl and m.activo and m.stock <= m.stock_minimo), '[]'::jsonb);
end $$;
revoke all on function fn_inventario_avisos_tratamiento(uuid) from public, anon;
grant execute on function fn_inventario_avisos_tratamiento(uuid) to authenticated;

-- Alerta del tablero: materiales activos en o bajo su mínimo (propietario y asistente; respeta la sucursal permitida).
create or replace function fn_inventario_stock_bajo(p_sucursal uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_cl uuid := auth_clinica_id();
begin
  if v_cl is null or coalesce(auth_rol(), '') not in ('owner', 'asistente') or not fn_clinica_tiene_funcionalidad(v_cl, 'inventario') then
    return '[]'::jsonb;
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'nombre', m.nombre, 'unidad', m.unidad, 'stock', m.stock,
                                                       'stock_minimo', m.stock_minimo, 'sucursal_id', m.sucursal_id, 'agotado', m.stock <= 0)
                                    order by (m.stock <= 0) desc, m.stock - m.stock_minimo, m.nombre)
                     from materiales m
                    where m.clinica_id = v_cl and m.activo and m.stock <= m.stock_minimo and auth_sucursal_permitida(m.sucursal_id)
                      and (p_sucursal is null or m.sucursal_id is null or m.sucursal_id = p_sucursal)), '[]'::jsonb);
end $$;
revoke all on function fn_inventario_stock_bajo(uuid) from public, anon;
grant execute on function fn_inventario_stock_bajo(uuid) to authenticated;

commit;
