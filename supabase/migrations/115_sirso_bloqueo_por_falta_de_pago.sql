-- ============================================================
-- SIRO — 115: bloqueo automático por falta de pago y periodo de prueba desde el alta.
-- ------------------------------------------------------------
-- Decisión del responsable (27/10/2026): cuando una clínica no paga, al terminar su vencimiento + los días de gracia
-- (plataforma_config.dias_gracia_suscripcion, 7) queda SUSPENDIDA POR COMPLETO hasta que pague. Pagar la reactiva sola.
--  * fn_bloqueada_por_pago(clinica): la suscripción vigente está `activa` y su estado efectivo (082) es `vencida`.
--    Se calcula al leer (sin tareas programadas): en cuanto Stripe mueve fecha_fin al pagar, el bloqueo desaparece.
--  * auth_clinica_id() (030) devuelve NULL también para una clínica bloqueada por pago → las mismas políticas RLS que
--    aplican la suspensión manual bloquean lectura y escritura. Los superadmin no se bloquean.
--  * Lo que el owner necesita para PAGAR sigue funcionando: mi_suscripcion y mi_cobro usan auth_clinica_id_raw(), y
--    stripe-checkout / stripe-portal usan service_role. stripe-checkout solo rechaza la suspensión MANUAL.
--  * Una clínica sin fecha_fin nunca vence (convenios a la medida). Desde esta versión el alta exige fecha de fin
--    (= fin del periodo de prueba); las clínicas ya existentes no se tocan.
--  * Interruptor: plataforma_config.bloqueo_por_falta_de_pago = 'off' lo desactiva al instante ('on' por defecto).
--  * Periodo de prueba en Stripe: fn_stripe_datos_checkout devuelve `fin_prueba` (la fecha_fin vigente, si nunca ha
--    pagado y aún no vence) para que el primer cobro sea al terminar la prueba, no al registrar la tarjeta.
--  * mi_suscripcion agrega `bloqueada_por_pago` y `pago_automatico` (para la pantalla de bloqueo y el aviso de agregar
--    un método de pago tras el primer paciente).
-- Requiere 030, 075, 082 y 114. Re-ejecutable. Rollback: supabase/rollback/siro_v3/rollback_115.sql.
-- ============================================================
begin;

do $$ begin
  if to_regclass('public.pagos_suscripcion') is null then raise exception '115 requiere la 114.'; end if;
end $$;

insert into plataforma_config (clave, valor) values ('bloqueo_por_falta_de_pago', 'on') on conflict (clave) do nothing;

-- ---------- 1. ¿Bloqueada por falta de pago? ----------
-- Falla ABIERTA (como el control de almacenamiento de la 082): si no se puede evaluar, NO bloquea. Un problema de
-- infraestructura no debe dejar fuera a todas las clínicas; auth_clinica_id() depende de esta función.
create or replace function fn_bloqueada_por_pago(p_clinica uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce((select valor from plataforma_config where clave = 'bloqueo_por_falta_de_pago'), 'on') = 'on'
     and exists (select 1 from suscripciones s
                  where s.clinica_id = p_clinica and s.estado = 'activa'
                    and fn_estado_efectivo(s.estado, s.fecha_fin) = 'vencida');
exception when others then
  return false;
end $$;
revoke all on function fn_bloqueada_por_pago(uuid) from public, anon;
grant execute on function fn_bloqueada_por_pago(uuid) to authenticated, service_role;

-- ---------- 2. auth_clinica_id(): la clínica bloqueada por pago deja de "existir" para RLS, como la suspendida ----------
-- Es la definición de la 103 (que ya excluye el cambio de contraseña pendiente) con una sola condición más.
create or replace function public.auth_clinica_id() returns uuid
language sql stable security definer set search_path = public as $$
  select u.clinica_id from usuarios u join clinicas c on c.id = u.clinica_id where u.id = auth.uid() and c.estado = 'activa' and not u.debe_cambiar_password
     and (u.es_super_admin or not fn_bloqueada_por_pago(u.clinica_id))
$$;

-- ---------- 3. mi_suscripcion(): + bloqueada_por_pago y pago_automatico (resto idéntico a 082) ----------
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
    -- Estado calculado: activa | gracia | vencida | suspendida. Desde la 115, `vencida` BLOQUEA (ver bloqueada_por_pago).
    'estado_efectivo', case when v_sus.id is null then 'activa' else fn_estado_efectivo(v_sus.estado, v_sus.fecha_fin) end,
    'bloqueada_por_pago', fn_bloqueada_por_pago(v_cl) and not fn_es_super_admin(),
    'pago_automatico', v_sus.stripe_subscription_id is not null and coalesce(v_sus.auto_renovacion, false),
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

-- ---------- 4. Checkout: + fin_prueba (resto idéntico a 114) ----------
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
                            'stripe_customer_id', v_cl.stripe_customer_id, 'price', v_price,
                            -- Prueba: si nunca ha pagado y su fecha de fin aún no llega, el primer cobro es al terminar la prueba.
                            'fin_prueba', case when v_sus.stripe_subscription_id is null and v_sus.fecha_fin > current_date
                                                 and not exists (select 1 from pagos_suscripcion g where g.clinica_id = v_cl.id and g.estado = 'pagado')
                                               then v_sus.fecha_fin end);
end $$;
revoke all on function fn_stripe_datos_checkout(uuid, text, text) from public, anon, authenticated;
grant execute on function fn_stripe_datos_checkout(uuid, text, text) to service_role;

commit;
