-- ============================================================
-- SIRO — HOTFIX DE SEGURIDAD: la auditoría de una clínica era legible por TODAS las clínicas
-- Migración 081
-- ------------------------------------------------------------
-- HALLAZGO (reproducido con sesiones reales de dos clínicas, no supuesto):
--   * La política `auditoria_select` (desde la migración 001) es solo `auth_rol() = 'owner'`: SIN filtro
--     de clínica. Cualquier owner leía la auditoría de TODAS las clínicas.
--   * `fn_auditoria` guarda en `detalle` la fila completa (`to_jsonb(new)`) de cada tabla auditada
--     (pacientes, expedientes, notas, pagos, recetas…) y NUNCA asigna `clinica_id`: las filas nacían con
--     `clinica_id = NULL`. Resultado demostrado: el owner de la clínica A leyó el nombre, el teléfono y el
--     CURP de un paciente de la clínica B. Es una fuga de datos personales/de salud entre clínicas.
--   * El dashboard ("Actividad reciente") mostraba, por la misma razón, acciones de otras clínicas.
--
-- CORRECCIÓN
--   1. Un trigger BEFORE INSERT liga cada fila de auditoría a una clínica: por el usuario que actuó; si no
--      hay usuario, por el `clinica_id` / `paciente_id` del propio detalle.
--   2. Se rellenan las filas existentes con la misma lógica (función idempotente, repetible).
--   3. `auditoria_select`: el owner lee SOLO las filas de SU clínica; el superadmin lee todas (auditoría
--      administrativa). Las filas que no se puedan ligar a ninguna clínica solo las ve el superadmin.
--   4. Índice para consultar por clínica y fecha (lo usan el dashboard y la pantalla de auditoría).
--   5. Integridad: un usuario de una clínica ya no puede escribir eventos falsos en la bitácora de otra
--      (política de INSERT: no puede declarar una clínica que no sea la suya).
-- No borra ni modifica el contenido de ninguna fila: solo completa `clinica_id` donde faltaba.
-- Despliégala de inmediato: es un hotfix independiente de los planes (solo requiere `fn_es_super_admin`,
-- de la 075). Seguro de re-ejecutar.
-- ============================================================
begin;

do $$
begin
  if to_regprocedure('fn_es_super_admin()') is null then
    raise exception 'Aplica primero la migración 075 (necesita fn_es_super_admin).';
  end if;
end $$;

-- ---------- 1. Clínica de una fila de auditoría ----------
create or replace function fn_clinica_de_auditoria(p_usuario uuid, p_detalle jsonb)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  v_clinica uuid;
  v_texto text;
begin
  if p_usuario is not null then
    select clinica_id into v_clinica from usuarios where id = p_usuario;
    if v_clinica is not null then return v_clinica; end if;
  end if;
  if p_detalle is null or jsonb_typeof(p_detalle) <> 'object' then return null; end if;

  v_texto := p_detalle ->> 'clinica_id';
  if v_texto ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id into v_clinica from clinicas where id = v_texto::uuid;
    if v_clinica is not null then return v_clinica; end if;
  end if;

  v_texto := p_detalle ->> 'paciente_id';
  if v_texto ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select clinica_id into v_clinica from pacientes where id = v_texto::uuid;
    if v_clinica is not null then return v_clinica; end if;
  end if;

  v_texto := p_detalle ->> 'expediente_id';
  if v_texto ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select p.clinica_id into v_clinica from expedientes e join pacientes p on p.id = e.paciente_id where e.id = v_texto::uuid;
    if v_clinica is not null then return v_clinica; end if;
  end if;
  return null;
end $$;
revoke all on function fn_clinica_de_auditoria(uuid, jsonb) from public, anon, authenticated;

create or replace function fn_auditoria_asignar_clinica()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Solo COMPLETA lo que falta. Las funciones internas (planes, Edge Functions con service_role) sí indican
  -- la clínica afectada y se respeta. Que un cliente de la API no pueda indicar una clínica ajena lo
  -- garantiza la política de INSERT de más abajo (las funciones internas no pasan por ella).
  if new.clinica_id is null then
    new.clinica_id := fn_clinica_de_auditoria(new.usuario_id, new.detalle);
  end if;
  return new;
end $$;

drop trigger if exists trg_auditoria_asignar_clinica on auditoria;
create trigger trg_auditoria_asignar_clinica
  before insert on auditoria
  for each row execute function fn_auditoria_asignar_clinica();

-- ---------- 2. Rellenar lo que ya existe (idempotente; devuelve cuántas filas ligó) ----------
create or replace function fn_rellenar_clinica_auditoria() returns integer
language plpgsql security definer set search_path = public as $$
declare v_filas integer;
begin
  update auditoria a set clinica_id = x.clinica
    from (select id, fn_clinica_de_auditoria(usuario_id, detalle) as clinica from auditoria where clinica_id is null) x
   where a.id = x.id and x.clinica is not null;
  get diagnostics v_filas = row_count;
  return v_filas;
end $$;
revoke all on function fn_rellenar_clinica_auditoria() from public, anon, authenticated;

select fn_rellenar_clinica_auditoria();

-- ---------- 3. Lectura: solo la propia clínica (el superadmin, todas) ----------
drop policy if exists auditoria_select on auditoria;
create policy auditoria_select on auditoria for select to authenticated
  using (fn_es_super_admin() or (auth_rol() = 'owner' and clinica_id is not null and clinica_id = auth_clinica_id()));

-- ---------- 3b. Integridad: un cliente de la API no escribe en la bitácora de otra clínica ----------
-- Antes solo se exigía `usuario_id = auth.uid()`: un usuario de A podía insertar un evento declarando
-- clinica_id = B y ensuciar la bitácora de otra clínica (demostrado). Ahora, o no indica clínica (el trigger
-- le pone la suya) o indica la suya. Esta política solo rige para clientes de la API.
drop policy if exists auditoria_insert_eventos on auditoria;
create policy auditoria_insert_eventos on auditoria for insert to authenticated
  with check (usuario_id = auth.uid() and (clinica_id is null or clinica_id = auth_clinica_id()));

-- ---------- 4. Índice ----------
create index if not exists idx_auditoria_clinica_fecha on auditoria (clinica_id, creado_en desc);

commit;
