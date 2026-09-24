-- ============================================================
-- SIRO — Módulo legal, Fase 1: cimiento técnico
-- Migración 049
-- ------------------------------------------------------------
-- CONTEXTO REAL (verificado antes de escribir una sola línea):
-- SIRO YA TIENE, y esta migración NO duplica:
--   - Auditoría de escritura (fn_auditoria(), tabla auditoria) en
--     pacientes, expedientes, notas, tratamientos, pagos, citas,
--     usuarios, recetas, consentimientos, referencias.
--   - Consentimiento informado clínico real (consentimientos_informados,
--     migraciones 024 y 036) — firma capturada (PNG base64),
--     inmutable por trigger, con revocación auditada.
--   - Separación superadmin/owner (usuarios.es_super_admin, protegida
--     contra auto-promoción incluso vía petición manipulada,
--     migración 037).
--   - Multi-tenant y Storage privado, auditados en rondas anteriores.
-- Esta migración NO toca ninguna de esas piezas — solo agrega lo que
-- genuinamente falta: documentos legales versionados, evidencia de
-- aceptación, y la capacidad de auditar EVENTOS DE LECTURA (login,
-- "se vió esta radiografía") — algo que un trigger de base de datos
-- estructuralmente no puede capturar, porque un SELECT nunca dispara
-- un trigger.
-- ============================================================

-- ---------- 1. legal_documents ----------
-- clinica_id NULL = documento de la plataforma SIRO (aplica a todas
-- las clínicas que no configuren el suyo propio). clinica_id no nulo =
-- una clínica reemplazó el documento con su propia versión — nunca se
-- obliga a una clínica a usar el texto de SIRO (pedido explícito).
create table if not exists legal_documents (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid references clinicas(id) on delete cascade,
  tipo text not null check (tipo in (
    'privacy_simplified', 'privacy_integral', 'terms', 'cookies',
    'security', 'retention', 'data_processing_agreement', 'other'
  )),
  version text not null,
  titulo text not null,
  contenido text not null,
  vigente_desde timestamptz,
  publicado_en timestamptz,
  activo boolean not null default false,
  creado_en timestamptz default now(),
  creado_por uuid references usuarios(id) on delete set null,
  unique (clinica_id, tipo, version)
);

create index idx_legal_documents_tipo_activo on legal_documents(tipo, activo) where activo = true;

-- No se permite más de un documento ACTIVO del mismo tipo para la
-- misma clínica (o para la plataforma, cuando clinica_id es NULL) — es
-- lo que hace que "versión activa" tenga sentido sin ambigüedad.
create unique index idx_legal_documents_un_activo_por_tipo
  on legal_documents (tipo, coalesce(clinica_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where activo = true;

alter table legal_documents enable row level security;

-- Los documentos legales deben ser visibles ANTES de iniciar sesión
-- (el aviso de privacidad se muestra en login/registro) — por eso el
-- select se otorga también a anon, no solo a authenticated. Nunca se
-- expone contenido inactivo (borradores) a nadie fuera de quien
-- administra lo legal.
create policy legal_documents_select_publico on legal_documents
  for select using (activo = true);

create policy legal_documents_select_administra on legal_documents
  for select using (
    auth_rol() = 'owner'
    and (clinica_id is null or clinica_id = auth_clinica_id())
  );

-- Solo el owner de la propia clínica puede publicar SU versión; los
-- documentos de plataforma (clinica_id null) los administra únicamente
-- super_admin vía service_role — un owner nunca puede insertar con
-- clinica_id null.
create policy legal_documents_insert on legal_documents
  for insert with check (
    auth_rol() = 'owner'
    and clinica_id = auth_clinica_id()
  );

create policy legal_documents_update on legal_documents
  for update using (
    auth_rol() = 'owner'
    and clinica_id = auth_clinica_id()
  );

grant select on legal_documents to anon;
grant select, insert, update on legal_documents to authenticated;

-- ---------- 2. legal_acceptances ----------
-- Evidencia de que alguien aceptó una versión concreta de un
-- documento. Nunca se sobreescribe una aceptación — cada aceptación es
-- una fila nueva, incluso si la persona ya había aceptado una versión
-- anterior del mismo tipo de documento.
create table if not exists legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references usuarios(id) on delete set null,
  paciente_id uuid references pacientes(id) on delete set null,
  clinica_id uuid references clinicas(id) on delete cascade,
  documento_id uuid not null references legal_documents(id),
  documento_version text not null,
  aceptado_en timestamptz not null default now(),
  metodo text,
  ip text,
  user_agent text,
  metadata jsonb,
  check (usuario_id is not null or paciente_id is not null)
);

create index idx_legal_acceptances_usuario on legal_acceptances(usuario_id);
create index idx_legal_acceptances_paciente on legal_acceptances(paciente_id);
create index idx_legal_acceptances_documento on legal_acceptances(documento_id);

alter table legal_acceptances enable row level security;

-- Cada quien registra y consulta SU PROPIA aceptación (nunca la de
-- otra persona) — más el owner de la clínica, que necesita verlas
-- todas para efectos de cumplimiento.
create policy legal_acceptances_select_propia on legal_acceptances
  for select using (usuario_id = auth.uid());

create policy legal_acceptances_select_clinica on legal_acceptances
  for select using (
    auth_rol() = 'owner'
    and clinica_id = auth_clinica_id()
  );

create policy legal_acceptances_insert on legal_acceptances
  for insert with check (
    usuario_id = auth.uid()
    and (clinica_id is null or clinica_id = auth_clinica_id())
  );

-- Nunca se permite UPDATE ni DELETE — una aceptación es evidencia
-- histórica, no un valor editable (pedido explícito: "NO sobrescribir
-- aceptaciones anteriores"). Al no crear ninguna policy para esas
-- operaciones, RLS las bloquea por defecto.

grant select, insert on legal_acceptances to authenticated;

-- ---------- 3. Auditoría de eventos de lectura/acceso ----------
-- La tabla `auditoria` ya existe y ya audita ESCRITURAS (vía
-- fn_auditoria(), disparado por triggers en 10 tablas). Un SELECT
-- nunca dispara un trigger — por diseño de Postgres — así que eventos
-- tipo LOGIN, PATIENT_VIEWED o XRAY_VIEWED no pueden auditarse por ese
-- mecanismo: tienen que insertarse explícitamente desde la aplicación.
-- Se reutiliza la MISMA tabla (mismo criterio de auditoría, una sola
-- fuente de verdad) en vez de crear una tabla paralela — solo se le
-- agregan las columnas que ese nuevo caso de uso necesita y que hoy no
-- tiene.
alter table auditoria add column if not exists clinica_id uuid references clinicas(id) on delete set null;
alter table auditoria add column if not exists ip text;
alter table auditoria add column if not exists user_agent text;

-- Valor por defecto para el nuevo camino de inserción directa (el
-- trigger existente sigue pasando auth.uid() explícitamente, así que
-- esto no le afecta en nada) — evita que el frontend tenga que
-- recordar mandarlo, y como la policy de abajo exige que coincida con
-- auth.uid() de todas formas, un valor distinto nunca pasaría.
alter table auditoria alter column usuario_id set default auth.uid();

-- Permite insertar eventos de lectura/acceso desde el frontend — algo
-- que hoy no existía ninguna política para (solo el trigger, vía
-- security definer, podía escribir en esta tabla). Cualquier usuario
-- autenticado puede registrar un evento, pero SIEMPRE atribuido a sí
-- mismo — nunca puede registrar una entrada a nombre de otro usuario.
create policy auditoria_insert_eventos on auditoria
  for insert with check (usuario_id = auth.uid());

grant insert on auditoria to authenticated;
