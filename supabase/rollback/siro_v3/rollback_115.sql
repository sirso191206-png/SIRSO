-- ROLLBACK de la 115: sin bloqueo por falta de pago. auth_clinica_id() y mi_suscripcion() vuelven a la 103 / 082 y
-- fn_stripe_datos_checkout a la 114 (sin fin_prueba). No toca datos de clínicas ni suscripciones. Re-ejecutable.
begin;
create or replace function public.auth_clinica_id() returns uuid
language sql stable security definer set search_path = public as $$
  select u.clinica_id from usuarios u join clinicas c on c.id = u.clinica_id where u.id = auth.uid() and c.estado = 'activa' and not u.debe_cambiar_password
$$;

create or replace function mi_suscripcion() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_cl uuid := auth_clinica_id_raw();
  v_sus suscripciones%rowtype;
  v_plan_cod text;
  v_ver_precio boolean := (auth_rol() = 'owner' or fn_es_super_admin());
begin
  if v_cl is null then return null; end if;
  select * into v_sus from suscripciones where clinica_id = v_cl and estado <> 'reemplazada';
  v_plan_cod := coalesce(v_sus.plan, (select plan from clinicas where id = v_cl));

  return jsonb_build_object(
    'sin_suscripcion', v_sus.id is null,
    'plan', (select jsonb_build_object('codigo', p.plan, 'nombre', coalesce(p.nombre, p.plan), 'descripcion', p.descripcion)
             from planes_catalogo p where p.plan = v_plan_cod),
    'estado', coalesce(v_sus.estado, (select estado from clinicas where id = v_cl)),
    -- Estado calculado: activa | gracia | vencida | suspendida. Informa; no bloquea ni borra nada.
    'estado_efectivo', case when v_sus.id is null then 'activa' else fn_estado_efectivo(v_sus.estado, v_sus.fecha_fin) end,
    'dias_para_vencer', case when v_sus.fecha_fin is null then null else (v_sus.fecha_fin - current_date) end,
    'dias_gracia', fn_dias_gracia(),
    'modalidad', v_sus.modalidad,
    'precio_contratado', case when v_ver_precio then v_sus.precio_contratado else null end,
    'moneda', v_sus.moneda,
    'fecha_inicio', v_sus.fecha_inicio,
    'fecha_fin', v_sus.fecha_fin,
    'limites', jsonb_build_object(
      'pacientes', fn_limite_efectivo(v_cl, 'pacientes'), 'usuarios', fn_limite_efectivo(v_cl, 'usuarios'),
      'sucursales', fn_limite_efectivo(v_cl, 'sucursales'), 'sesiones', fn_limite_efectivo(v_cl, 'sesiones'),
      'almacenamiento_mb', fn_limite_efectivo(v_cl, 'almacenamiento_mb')),
    'uso', fn_uso_clinica(v_cl),
    'excesos', fn_excesos_clinica(v_cl),
    'funcionalidades', (select coalesce(jsonb_agg(jsonb_build_object('codigo', f.codigo, 'nombre', f.nombre, 'categoria', f.categoria,
         'aplicacion', f.aplicacion, 'habilitada', fn_funcionalidad_contratada(v_cl, f.codigo)) order by f.orden, f.codigo), '[]'::jsonb)
       from funcionalidades f where f.activo));
end $$;

create or replace function fn_stripe_datos_checkout(p_usuario uuid, p_plan text, p_modalidad text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_u usuarios%rowtype; v_p planes_catalogo%rowtype; v_cl clinicas%rowtype; v_sus suscripciones%rowtype; v_price text;
begin
  select * into v_u from usuarios where id = p_usuario;
  if not found or v_u.rol <> 'owner' then raise exception 'Solo el propietario de la clínica puede contratar o pagar el plan.' using hint = 'NO_AUTORIZADO'; end if;
  select * into v_cl from clinicas where id = v_u.clinica_id;
  select * into v_sus from suscripciones where clinica_id = v_cl.id and estado <> 'reemplazada';
  if coalesce(v_sus.estado, v_cl.estado) = 'suspendida' then
    raise exception 'La clínica está suspendida. Contacta al administrador de SIRO.' using hint = 'CLINICA_SUSPENDIDA';
  end if;
  if v_sus.stripe_subscription_id is not null and v_sus.auto_renovacion then
    raise exception 'Tu clínica ya tiene el pago automático activo. Cambia de plan o de tarjeta en «Administrar pago».' using hint = 'YA_TIENE_PAGO';
  end if;
  select * into v_p from planes_catalogo where plan = p_plan and activo and visible;
  if not found then raise exception 'Ese plan no está disponible.' using hint = 'PLAN_NO_DISPONIBLE'; end if;
  v_price := case p_modalidad when 'mensual' then case when v_p.permite_mensual then v_p.stripe_price_mensual end
                              when 'anual' then case when v_p.permite_anual then v_p.stripe_price_anual end end;
  if v_price is null then raise exception 'Ese plan no se puede pagar en línea en esa modalidad.' using hint = 'PLAN_SIN_PAGO_EN_LINEA'; end if;
  return jsonb_build_object('clinica_id', v_cl.id, 'clinica_nombre', v_cl.nombre, 'correo', v_u.correo,
                            'stripe_customer_id', v_cl.stripe_customer_id, 'price', v_price);
end $$;
revoke all on function fn_stripe_datos_checkout(uuid, text, text) from public, anon, authenticated;
grant execute on function fn_stripe_datos_checkout(uuid, text, text) to service_role;

drop function if exists fn_bloqueada_por_pago(uuid);
delete from plataforma_config where clave = 'bloqueo_por_falta_de_pago';
commit;
