-- ============================================================
-- SIRO — Política de conservación por categoría, retención legal y supresión autorizada
-- Migración 104. NUEVA (no modifica ninguna migración anterior; las funciones de 087/089 siguen intactas). Segura para instalaciones existentes.
-- ------------------------------------------------------------
-- QUÉ RESUELVE. Hoy ningún usuario puede borrar por la API (no hay políticas DELETE permisivas), pero las 15 relaciones hacia `pacientes` son ON DELETE CASCADE: borrar un
-- paciente por una vía privilegiada (service_role, SQL, panel) destruía en cascada todo su expediente. Esta migración añade:
--  1) `politicas_conservacion`: un modelo por CATEGORÍA (expediente clínico, documentación fiscal y contable, contratos, facturas, pagos, comprobantes, autorizaciones,
--     auditoría, documentos de soporte) con evento de inicio, fuente jurídica y estado de aprobación. Los plazos NO se inventan: todos nacen vacíos (sin valor). Solo el
--     expediente clínico tiene un PISO de 5 años (NOM-004-SSA3-2012, SUJETO A CONFIRMACIÓN JURÍDICA) que ningún valor puede bajar. La eliminación AUTOMÁTICA está prohibida por el esquema.
--  2) `retenciones_legales`: una retención (por clínica o por paciente) SUSPENDE cualquier supresión mientras esté activa (litigio, auditoría, investigación).
--  3) `conservacion_historial`: historial INMUTABLE de las decisiones (plazos, retenciones, supresiones) con actor, fecha y motivo.
--  4) El plazo clínico se cuenta desde el ÚLTIMO ACTO MÉDICO registrado del paciente (`fn_ultimo_acto_medico`), no desde su alta ni desde la baja de la clínica.
--  5) Un disparador impide borrar físicamente un paciente con registros clínicos o con retención legal activa. La ÚNICA vía es `fn_suprimir_paciente_autorizado` (solo servidor):
--     exige plazo clínico definido y vencido, sin retención legal, motivo, y deja historial. Otro disparador impide eliminar una clínica con retención legal activa.
-- PERMISOS: las tablas no son accesibles para anon ni authenticated; las funciones de gestión son solo para service_role. Un usuario de clínica no puede ver ni cambiar nada de esto.
-- LÍMITES: la supresión de una CLÍNICA completa sigue gobernada por fn_eliminar_clinica (087/089), que mantiene su propia comprobación de plazos; este control añade la retención legal.
-- Para que esa función siga pudiendo borrar los pacientes de la clínica, se REDEFINE aquí (copia exacta de la vigente + dos líneas que autorizan ese borrado solo dentro de ella).
-- Un borrado directo de una clínica por SQL (operación de DBA) solo queda protegido frente a retenciones legales (los pacientes con registros lo impiden por sí mismos: pacientes → clinicas no es cascada). Seguro de re-ejecutar. Rollback: supabase/rollback/104_rollback.sql.
-- No se aprueba aquí ningún plazo legal: todos los estados nacen en PENDIENTE_DE_ABOGADO.
-- ============================================================
begin;

create table if not exists public.politicas_conservacion (
  categoria text primary key check (categoria in ('expediente_clinico','documentacion_fiscal_contable','contratos','facturas','pagos','comprobantes','autorizaciones','auditoria','documentos_soporte')),
  descripcion text not null,
  evento_inicio text not null,
  plazo_minimo_anios integer check (plazo_minimo_anios is null or plazo_minimo_anios between 1 and 100),
  plazo_anios integer,
  base_juridica text not null,
  estado_aprobacion text not null default 'PENDIENTE_DE_ABOGADO' check (estado_aprobacion in ('PENDIENTE_DE_ABOGADO','APROBADA_POR_ABOGADO','APROBADA_POR_RESPONSABLE')),
  eliminacion_automatica boolean not null default false check (eliminacion_automatica = false),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid,
  constraint politicas_conservacion_plazo_valido check (plazo_anios is null or (plazo_anios between 1 and 100 and plazo_anios >= coalesce(plazo_minimo_anios, 1)))
);
insert into public.politicas_conservacion (categoria, descripcion, evento_inicio, plazo_minimo_anios, base_juridica) values
 ('expediente_clinico','Expediente clínico: notas, odontogramas, periodontogramas, diagnósticos, tratamientos, consentimientos clínicos, recetas, fotografías y documentos clínicos','ultimo_acto_medico',5,'NOM-004-SSA3-2012 (mínimo de 5 años desde el último acto médico). SUJETO A CONFIRMACIÓN JURÍDICA de su aplicación concreta y de otras obligaciones vigentes'),
 ('documentacion_fiscal_contable','Documentación fiscal y contable (por tipo documental y obligación)','segun_tipo_documental_y_obligacion_fiscal',null,'Código Fiscal de la Federación, art. 30 y su relación con el art. 67 (incluidos supuestos especiales). SIN PLAZO FIJO ASUMIDO: lo define el contador/abogado'),
 ('contratos','Contratos de prestación del servicio y anexos','terminacion_o_vencimiento_del_contrato',null,'POR DEFINIR por el responsable con asesoría jurídica'),
 ('facturas','Facturas y CFDI emitidos o recibidos','fecha_de_emision_o_efectos_fiscales',null,'Código Fiscal de la Federación, art. 30 y 67. SIN PLAZO FIJO ASUMIDO'),
 ('pagos','Registros de pagos y cobros','fecha_del_pago',null,'POR DEFINIR por el responsable con asesoría contable'),
 ('comprobantes','Comprobantes y soportes de operaciones','fecha_de_la_operacion',null,'POR DEFINIR por el responsable con asesoría contable'),
 ('autorizaciones','Autorizaciones y consentimientos administrativos (no clínicos)','fecha_de_otorgamiento_o_revocacion',null,'POR DEFINIR por el responsable con asesoría jurídica'),
 ('auditoria','Registros de auditoría y trazabilidad','fecha_del_evento',null,'POR DEFINIR por el responsable (seguridad y trazabilidad)'),
 ('documentos_soporte','Documentos de soporte técnico y atención','cierre_del_caso',null,'POR DEFINIR por el responsable')
on conflict (categoria) do nothing;

create table if not exists public.retenciones_legales (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  paciente_id uuid references public.pacientes(id) on delete cascade,
  categoria text not null references public.politicas_conservacion(categoria),
  motivo text not null check (char_length(btrim(motivo)) >= 10),
  referencia text,
  creado_por uuid,
  creado_en timestamptz not null default now(),
  liberada_en timestamptz,
  liberada_por uuid,
  motivo_liberacion text,
  constraint retenciones_legales_liberacion_valida check (liberada_en is null or char_length(btrim(coalesce(motivo_liberacion, ''))) >= 10)
);
create index if not exists idx_retenciones_legales_activas on public.retenciones_legales (clinica_id, paciente_id) where liberada_en is null;

create table if not exists public.conservacion_historial (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid,
  paciente_id uuid,
  categoria text,
  accion text not null,
  valor_anterior jsonb,
  valor_nuevo jsonb,
  motivo text,
  actor uuid,
  creado_en timestamptz not null default now()
);

alter table public.politicas_conservacion enable row level security;
alter table public.retenciones_legales enable row level security;
alter table public.conservacion_historial enable row level security;
revoke all on public.politicas_conservacion, public.retenciones_legales, public.conservacion_historial from anon, authenticated;
-- Política restrictiva de sesión (como en el resto de tablas con RLS; ver la guarda de sesiones). Sin ninguna política permisiva, estas tablas siguen sin ser accesibles para los usuarios.
do $$ declare t text; begin
  foreach t in array array['politicas_conservacion', 'retenciones_legales', 'conservacion_historial'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'sesion_activa_' || t) then
      execute format('create policy %I on public.%I as restrictive for all to authenticated using ((select fn_sesion_activa())) with check ((select fn_sesion_activa()))', 'sesion_activa_' || t, t);
    end if;
  end loop;
end $$;

create or replace function fn_historial_conservacion_inmutable() returns trigger language plpgsql security definer set search_path = public as $$
begin
  raise exception 'El historial de decisiones de conservación es inmutable.' using errcode = 'P0001', hint = 'HISTORIAL_INMUTABLE';
end;
$$;
revoke all on function fn_historial_conservacion_inmutable() from public, anon, authenticated;
drop trigger if exists trg_historial_conservacion_inmutable on public.conservacion_historial;
create trigger trg_historial_conservacion_inmutable before update or delete on public.conservacion_historial for each row execute function fn_historial_conservacion_inmutable();

create or replace function fn_historial_politica_conservacion() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.plazo_anios is distinct from old.plazo_anios or new.estado_aprobacion is distinct from old.estado_aprobacion then
    insert into conservacion_historial (categoria, accion, valor_anterior, valor_nuevo, actor)
    values (new.categoria, 'politica_actualizada', jsonb_build_object('plazo_anios', old.plazo_anios, 'estado_aprobacion', old.estado_aprobacion), jsonb_build_object('plazo_anios', new.plazo_anios, 'estado_aprobacion', new.estado_aprobacion), coalesce(new.actualizado_por, auth.uid()));
  end if;
  return new;
end;
$$;
revoke all on function fn_historial_politica_conservacion() from public, anon, authenticated;
drop trigger if exists trg_historial_politica_conservacion on public.politicas_conservacion;
create trigger trg_historial_politica_conservacion after update on public.politicas_conservacion for each row execute function fn_historial_politica_conservacion();

-- Último ACTO MÉDICO registrado del paciente (no su alta ni la baja de la clínica). NULL si no hay ninguno.
create or replace function fn_ultimo_acto_medico(p_paciente uuid) returns timestamptz language sql stable security definer set search_path = public as $$
  select max(f) from (
    select max(n.creado_en) f from notas_clinicas n join expedientes e on e.id = n.expediente_id where e.paciente_id = p_paciente
    union all select max(inicio) from citas where paciente_id = p_paciente and estado = 'completada'
    union all select max(creado_en) from tratamientos where paciente_id = p_paciente
    union all select max(creado_en) from recetas where paciente_id = p_paciente
    union all select max(creado_en) from consentimientos_informados where paciente_id = p_paciente
    union all select max(creado_en) from signos_vitales where paciente_id = p_paciente
    union all select max(creado_en) from documentos_clinicos where paciente_id = p_paciente
    union all select max(fecha_captura)::timestamptz from fotografias where paciente_id = p_paciente
    union all select max(creado_en) from referencias_medicas where paciente_id = p_paciente
  ) s
$$;
revoke all on function fn_ultimo_acto_medico(uuid) from public, anon, authenticated;

-- OJO: crear un paciente genera automáticamente un expediente vacío y 64 piezas «en blanco» (32 de odontograma y 32 de periodontograma). Eso NO es un registro clínico: solo cuenta
-- lo que alguien TOCÓ (estado distinto de «sano», datos, historial de cambios) o registró (notas, tratamientos, recetas…). Si no, un paciente dado de alta por error no podría borrarse jamás.
create or replace function fn_paciente_tiene_registros_clinicos(p_paciente uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from notas_clinicas n join expedientes e on e.id = n.expediente_id where e.paciente_id = p_paciente)
      or exists (select 1 from citas where paciente_id = p_paciente and estado = 'completada')
      or exists (select 1 from tratamientos where paciente_id = p_paciente) or exists (select 1 from recetas where paciente_id = p_paciente)
      or exists (select 1 from consentimientos_informados where paciente_id = p_paciente) or exists (select 1 from signos_vitales where paciente_id = p_paciente)
      or exists (select 1 from documentos_clinicos where paciente_id = p_paciente) or exists (select 1 from fotografias where paciente_id = p_paciente)
      or exists (select 1 from referencias_medicas where paciente_id = p_paciente)
      or exists (select 1 from odontograma_piezas o where o.paciente_id = p_paciente and (o.estado is distinct from 'sano' or o.superficie is not null or o.actualizado_por is not null or o.diagnostico is not null or o.tratamiento_id is not null or o.notas is not null or o.material_corona is not null or o.tipo_incrustacion is not null or o.tipo_ausencia is not null))
      or exists (select 1 from odontograma_historial h join odontograma_piezas o on o.id = h.pieza_id where o.paciente_id = p_paciente)
      or exists (select 1 from periodontograma_piezas pp where pp.paciente_id = p_paciente and (pp.movilidad is distinct from 0 or pp.furcacion is distinct from 0 or pp.actualizado_por is not null))
      or exists (select 1 from periodontograma_historial h join periodontograma_piezas pp on pp.id = h.pieza_id where pp.paciente_id = p_paciente)
      or exists (select 1 from expedientes e, jsonb_each(to_jsonb(e) - 'id' - 'paciente_id' - 'actualizado_en') kv where e.paciente_id = p_paciente and kv.value not in ('null'::jsonb, '[]'::jsonb, '""'::jsonb))   -- antecedentes con datos; el expediente vacío (arreglos vacíos y nulos) no cuenta
$$;
revoke all on function fn_paciente_tiene_registros_clinicos(uuid) from public, anon, authenticated;

create or replace function fn_retencion_legal_activa(p_clinica uuid, p_paciente uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from retenciones_legales r where r.liberada_en is null and r.clinica_id = p_clinica and (r.paciente_id is null or r.paciente_id = p_paciente))
$$;
revoke all on function fn_retencion_legal_activa(uuid, uuid) from public, anon, authenticated;
create or replace function fn_retencion_legal_clinica(p_clinica uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from retenciones_legales r where r.liberada_en is null and r.clinica_id = p_clinica)
$$;
revoke all on function fn_retencion_legal_clinica(uuid) from public, anon, authenticated;

-- Plazo clínico EFECTIVO: el de la política (si existe) o, si no, el configurado con las claves anteriores (087/089). Un valor por debajo del piso de 5 años NO es válido (= sin plazo).
create or replace function fn_plazo_expediente_anios() returns integer language sql stable security definer set search_path = public as $$
  select case when v >= coalesce((select plazo_minimo_anios from politicas_conservacion where categoria = 'expediente_clinico'), 5) then v end
  from (select coalesce((select plazo_anios from politicas_conservacion where categoria = 'expediente_clinico'), fn_politica_anios('retencion_expediente_anios')) v) s
$$;
revoke all on function fn_plazo_expediente_anios() from public, anon, authenticated;

create or replace function fn_conservacion_paciente(p_paciente uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_clinica uuid; v_ultimo timestamptz; v_plazo integer; v_registros boolean; v_hold boolean; v_vence timestamptz; v_puede boolean; v_motivo text;
begin
  select clinica_id into v_clinica from pacientes where id = p_paciente;
  if v_clinica is null then return jsonb_build_object('error', 'PACIENTE_NO_ENCONTRADO'); end if;
  v_ultimo := fn_ultimo_acto_medico(p_paciente); v_plazo := fn_plazo_expediente_anios(); v_registros := fn_paciente_tiene_registros_clinicos(p_paciente); v_hold := fn_retencion_legal_activa(v_clinica, p_paciente);
  v_vence := case when v_ultimo is not null and v_plazo is not null then v_ultimo + make_interval(years => v_plazo) end;
  if v_hold then v_puede := false; v_motivo := 'RETENCION_LEGAL_ACTIVA';
  elsif not v_registros then v_puede := true; v_motivo := null;
  elsif v_plazo is null then v_puede := false; v_motivo := 'PLAZO_CLINICO_NO_DEFINIDO';
  elsif v_ultimo is null or v_vence > now() then v_puede := false; v_motivo := 'DENTRO_DEL_PLAZO_DE_CONSERVACION';
  else v_puede := true; v_motivo := null; end if;
  return jsonb_build_object('ultimo_acto_medico', v_ultimo, 'plazo_anios', v_plazo, 'conservar_hasta', v_vence, 'tiene_registros_clinicos', v_registros, 'retencion_legal_activa', v_hold, 'puede_suprimirse', v_puede, 'motivo_bloqueo', v_motivo);
end;
$$;
revoke all on function fn_conservacion_paciente(uuid) from public, anon, authenticated;

create or replace function fn_proteger_paciente_conservacion() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('siro.supresion_autorizada', true), '') = 'on' then return old; end if;   -- solo lo fija fn_suprimir_paciente_autorizado
  if fn_retencion_legal_activa(old.clinica_id, old.id) then
    raise exception 'Hay una retención legal activa: no se puede eliminar este paciente.' using errcode = 'P0001', hint = 'RETENCION_LEGAL_ACTIVA';
  end if;
  if fn_paciente_tiene_registros_clinicos(old.id) then
    raise exception 'Un paciente con registros clínicos no se elimina físicamente: archívalo. La supresión solo procede por el procedimiento autorizado, vencido el plazo de conservación.' using errcode = 'P0001', hint = 'EXPEDIENTE_SUJETO_A_CONSERVACION';
  end if;
  return old;
end;
$$;
revoke all on function fn_proteger_paciente_conservacion() from public, anon, authenticated;
drop trigger if exists trg_proteger_paciente_conservacion on public.pacientes;
create trigger trg_proteger_paciente_conservacion before delete on public.pacientes for each row execute function fn_proteger_paciente_conservacion();

create or replace function fn_proteger_clinica_retencion() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if fn_retencion_legal_clinica(old.id) then
    raise exception 'Hay una retención legal activa en esta clínica: no se puede eliminar.' using errcode = 'P0001', hint = 'RETENCION_LEGAL_ACTIVA';
  end if;
  return old;
end;
$$;
revoke all on function fn_proteger_clinica_retencion() from public, anon, authenticated;
drop trigger if exists trg_proteger_clinica_retencion on public.clinicas;
create trigger trg_proteger_clinica_retencion before delete on public.clinicas for each row execute function fn_proteger_clinica_retencion();

-- ---------- Gestión (SOLO servidor: service_role / mantenimiento) ----------
create or replace function fn_establecer_plazo_conservacion(p_categoria text, p_plazo integer, p_estado text, p_motivo text, p_actor uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then raise exception 'Solo el servidor puede cambiar la política de conservación.' using errcode = 'P0001', hint = 'SOLO_SERVIDOR'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 10 then raise exception 'El motivo es obligatorio (mínimo 10 caracteres).' using errcode = 'P0001', hint = 'MOTIVO_REQUERIDO'; end if;
  if p_estado not in ('PENDIENTE_DE_ABOGADO','APROBADA_POR_ABOGADO','APROBADA_POR_RESPONSABLE') then raise exception 'Estado de aprobación no válido.' using errcode = 'P0001', hint = 'ESTADO_NO_VALIDO'; end if;
  update politicas_conservacion set plazo_anios = p_plazo, estado_aprobacion = p_estado, actualizado_en = now(), actualizado_por = p_actor where categoria = p_categoria;
  if not found then raise exception 'Categoría no encontrada.' using errcode = 'P0001', hint = 'CATEGORIA_NO_ENCONTRADA'; end if;
  -- El historial es inmutable: el MOTIVO de la decisión se registra en una fila propia, junto a la de `politica_actualizada` que genera el disparador.
  insert into conservacion_historial (categoria, accion, valor_nuevo, motivo, actor) values (p_categoria, 'motivo_de_decision', jsonb_build_object('plazo_anios', p_plazo, 'estado_aprobacion', p_estado), p_motivo, p_actor);
end;
$$;
revoke all on function fn_establecer_plazo_conservacion(text, integer, text, text, uuid) from public, anon, authenticated;
grant execute on function fn_establecer_plazo_conservacion(text, integer, text, text, uuid) to service_role;

create or replace function fn_colocar_retencion_legal(p_clinica uuid, p_paciente uuid, p_categoria text, p_motivo text, p_referencia text, p_actor uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is not null then raise exception 'Solo el servidor puede colocar una retención legal.' using errcode = 'P0001', hint = 'SOLO_SERVIDOR'; end if;
  if not exists (select 1 from clinicas where id = p_clinica) then raise exception 'Clínica no encontrada.' using errcode = 'P0001', hint = 'CLINICA_NO_ENCONTRADA'; end if;
  if p_paciente is not null and not exists (select 1 from pacientes where id = p_paciente and clinica_id = p_clinica) then raise exception 'El paciente no pertenece a la clínica.' using errcode = 'P0001', hint = 'PACIENTE_INCOHERENTE'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 10 then raise exception 'El motivo es obligatorio (mínimo 10 caracteres).' using errcode = 'P0001', hint = 'MOTIVO_REQUERIDO'; end if;
  insert into retenciones_legales (clinica_id, paciente_id, categoria, motivo, referencia, creado_por) values (p_clinica, p_paciente, p_categoria, p_motivo, p_referencia, p_actor) returning id into v_id;
  insert into conservacion_historial (clinica_id, paciente_id, categoria, accion, valor_nuevo, motivo, actor) values (p_clinica, p_paciente, p_categoria, 'retencion_legal_colocada', jsonb_build_object('retencion_id', v_id, 'referencia', p_referencia), p_motivo, p_actor);
  return v_id;
end;
$$;
revoke all on function fn_colocar_retencion_legal(uuid, uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function fn_colocar_retencion_legal(uuid, uuid, text, text, text, uuid) to service_role;

create or replace function fn_liberar_retencion_legal(p_id uuid, p_motivo text, p_actor uuid) returns void language plpgsql security definer set search_path = public as $$
declare r retenciones_legales%rowtype;
begin
  if auth.uid() is not null then raise exception 'Solo el servidor puede liberar una retención legal.' using errcode = 'P0001', hint = 'SOLO_SERVIDOR'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 10 then raise exception 'El motivo es obligatorio (mínimo 10 caracteres).' using errcode = 'P0001', hint = 'MOTIVO_REQUERIDO'; end if;
  update retenciones_legales set liberada_en = now(), liberada_por = p_actor, motivo_liberacion = p_motivo where id = p_id and liberada_en is null returning * into r;
  if not found then raise exception 'La retención no existe o ya fue liberada.' using errcode = 'P0001', hint = 'RETENCION_NO_ENCONTRADA'; end if;
  insert into conservacion_historial (clinica_id, paciente_id, categoria, accion, valor_nuevo, motivo, actor) values (r.clinica_id, r.paciente_id, r.categoria, 'retencion_legal_liberada', jsonb_build_object('retencion_id', p_id), p_motivo, p_actor);
end;
$$;
revoke all on function fn_liberar_retencion_legal(uuid, text, uuid) from public, anon, authenticated;
grant execute on function fn_liberar_retencion_legal(uuid, text, uuid) to service_role;

create or replace function fn_suprimir_paciente_autorizado(p_paciente uuid, p_motivo text, p_actor uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_estado jsonb; v_clinica uuid;
begin
  if auth.uid() is not null then raise exception 'Solo el servidor puede ejecutar una supresión autorizada.' using errcode = 'P0001', hint = 'SOLO_SERVIDOR'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 20 then raise exception 'El motivo de la supresión es obligatorio (mínimo 20 caracteres).' using errcode = 'P0001', hint = 'MOTIVO_REQUERIDO'; end if;
  v_estado := fn_conservacion_paciente(p_paciente);
  if v_estado ->> 'error' is not null then raise exception 'Paciente no encontrado.' using errcode = 'P0001', hint = 'PACIENTE_NO_ENCONTRADO'; end if;
  if (v_estado ->> 'puede_suprimirse')::boolean is not true then
    -- El rechazo se DEVUELVE (no se lanza): una excepción revertiría la fila de historial del intento rechazado.
    insert into conservacion_historial (clinica_id, paciente_id, categoria, accion, valor_nuevo, motivo, actor)
      select clinica_id, id, 'expediente_clinico', 'supresion_rechazada', v_estado, p_motivo, p_actor from pacientes where id = p_paciente;
    return v_estado || jsonb_build_object('ok', false);
  end if;
  select clinica_id into v_clinica from pacientes where id = p_paciente;
  insert into conservacion_historial (clinica_id, paciente_id, categoria, accion, valor_nuevo, motivo, actor) values (v_clinica, p_paciente, 'expediente_clinico', 'supresion_autorizada', v_estado, p_motivo, p_actor);
  perform set_config('siro.supresion_autorizada', 'on', true);
  delete from pacientes where id = p_paciente;
  perform set_config('siro.supresion_autorizada', 'off', true);
  return v_estado || jsonb_build_object('ok', true);
end;
$$;
revoke all on function fn_suprimir_paciente_autorizado(uuid, text, uuid) from public, anon, authenticated;
grant execute on function fn_suprimir_paciente_autorizado(uuid, text, uuid) to service_role;

-- ---------- fn_eliminar_clinica: copia exacta de la vigente (089) + autorización del borrado de pacientes dentro de ella ----------
CREATE OR REPLACE FUNCTION public.fn_eliminar_clinica(p_clinica uuid, p_solicitante uuid, p_confirmar_nombre text, p_confirmar_datos_clinicos boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_resumen jsonb;
  v_nombre text;
  v_fotos jsonb; v_docs jsonb; v_logos jsonb; v_cuentas jsonb;
  v_n_pacientes integer;
begin
  -- 1) Autorización: solo un superadmin (la Edge Function ya lo verificó; aquí se vuelve a exigir).
  if p_solicitante is null or not coalesce((select es_super_admin from usuarios where id = p_solicitante), false) then
    raise exception 'Solo un superadministrador de la plataforma puede eliminar una clínica.' using errcode = 'P0001', hint = 'NO_AUTORIZADO';
  end if;

  -- 2) La clínica, bloqueada: nadie la modifica mientras se decide y se borra.
  perform 1 from clinicas where id = p_clinica for update;
  v_resumen := fn_clinica_resumen_eliminacion(p_clinica, p_solicitante);
  if not (v_resumen ->> 'existe')::boolean then
    raise exception 'La clínica no existe.' using errcode = 'P0001', hint = 'CLINICA_NO_ENCONTRADA';
  end if;

  -- 3) Comprobaciones previas: si algo lo impide, se dice QUÉ y no se borra nada.
  if not (v_resumen ->> 'puede_eliminar')::boolean then
    raise exception '%', (select string_agg(b ->> 'mensaje', ' ') from jsonb_array_elements(v_resumen -> 'bloqueos') b)
      using errcode = 'P0001', hint = 'ELIMINACION_BLOQUEADA';
  end if;
  v_nombre := v_resumen ->> 'nombre';
  if btrim(coalesce(p_confirmar_nombre, '')) <> v_nombre then
    raise exception 'El nombre no coincide: escribe el nombre exacto de la clínica para confirmar.' using errcode = 'P0001', hint = 'NOMBRE_NO_COINCIDE';
  end if;
  v_n_pacientes := (v_resumen -> 'conteos' ->> 'pacientes')::int;
  if v_n_pacientes > 0 and not coalesce(p_confirmar_datos_clinicos, false) then
    raise exception 'La clínica tiene % paciente(s) con información clínica. Confirma explícitamente que se destruirá de forma permanente.', v_n_pacientes
      using errcode = 'P0001', hint = 'CONFIRMACION_DATOS_CLINICOS';
  end if;

  -- 4) Lo que la base NO puede borrar por sí sola: se anota ANTES de borrar (después ya no habría de dónde sacarlo).
  select coalesce(jsonb_agg(o.name), '[]'::jsonb) into v_fotos from storage.objects o
   where o.bucket_id = 'fotos-clinicas' and (storage.foldername(o.name))[1] in (select id::text from pacientes where clinica_id = p_clinica);
  select coalesce(jsonb_agg(o.name), '[]'::jsonb) into v_docs from storage.objects o
   where o.bucket_id = 'documentos-clinicos' and (storage.foldername(o.name))[1] in (select id::text from pacientes where clinica_id = p_clinica);
  select coalesce(jsonb_agg(o.name), '[]'::jsonb) into v_logos from storage.objects o
   where o.bucket_id = 'logos-clinicas' and (storage.foldername(o.name))[1] = p_clinica::text;
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_cuentas from usuarios where clinica_id = p_clinica;

  -- 5) El borrado, en el orden que respeta las FK (todo o nada: cualquier error deshace TODO).
  -- Las aceptaciones legales primero: su FK a pacientes/usuarios es SET NULL pero tiene CHECK (usuario_id O paciente_id no
  -- nulo), así que al borrar al paciente o al usuario quedarían inválidas y TODO el borrado fallaría.
  delete from legal_acceptances where clinica_id = p_clinica
     or paciente_id in (select id from pacientes where clinica_id = p_clinica)
     or usuario_id in (select id from usuarios where clinica_id = p_clinica);
  perform set_config('siro.supresion_autorizada', 'on', true);   -- (104) autoriza el borrado de pacientes SOLO dentro de esta función, que ya verificó plazos, ARCO y confirmaciones
  delete from pacientes where clinica_id = p_clinica;            -- cascada: expediente, notas, tratamientos, odontograma, citas, pagos…
  perform set_config('siro.supresion_autorizada', 'off', true);
  delete from catalogo_tratamientos where clinica_id = p_clinica;
  delete from horarios_bloqueados where clinica_id = p_clinica;
  delete from lista_espera where clinica_id = p_clinica;
  delete from usuarios where clinica_id = p_clinica;             -- las filas; las cuentas de Auth las borra la Edge Function
  delete from clinicas where id = p_clinica;                     -- cascada: sucursales, suscripciones, legal…; SET NULL: auditoría, ARCO, incidentes

  -- 6) Constancia (sobrevive a la clínica). El solicitante es quien responde.
  insert into auditoria (usuario_id, accion, entidad, entidad_id, detalle)
  values (p_solicitante, 'eliminar_clinica', 'clinicas', p_clinica,
          jsonb_build_object('nombre', v_nombre, 'conteos', v_resumen -> 'conteos', 'se_conserva', v_resumen -> 'se_conserva',
                             -- Lo que se evaluó en el SERVIDOR al decidir (políticas, fechas y avisos): para poder investigar después.
                             'conservacion', v_resumen -> 'conservacion', 'advertencias', v_resumen -> 'advertencias',
                             'confirmo_datos_clinicos', coalesce(p_confirmar_datos_clinicos, false),
                             -- LAS LISTAS COMPLETAS de lo que la base no puede borrar (Storage y Auth), guardadas en la MISMA transacción: si la
                             -- Edge Function se interrumpe tras el commit, nada se pierde y se puede reanudar (fn_limpieza_pendiente_clinica).
                             'limpieza', jsonb_build_object('estado', 'pendiente',
                                'archivos', jsonb_build_object('fotos-clinicas', v_fotos, 'documentos-clinicos', v_docs, 'logos-clinicas', v_logos),
                                'cuentas_auth', v_cuentas),
                             'via', 'fn_eliminar_clinica'));

  return jsonb_build_object('ok', true, 'nombre', v_nombre, 'conteos', v_resumen -> 'conteos', 'se_conserva', v_resumen -> 'se_conserva',
    'rutas_storage', jsonb_build_object('fotos-clinicas', v_fotos, 'documentos-clinicos', v_docs, 'logos-clinicas', v_logos),
    'cuentas_auth', v_cuentas);
end;
$function$;

commit;
